import { useMemo, useState } from 'react';
import { Download, Eye, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { generateId } from '../lib/firebase';
import { createSaleTransaction } from '../services/salesService';
import { exportToCsv, formatDateTime, formatINR, toDate } from '../utils/format';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import type { PaymentMethod, Sale } from '../types';

interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  unitCost: number;
  available: number;
  quantity: number;
}

export function SalesPage() {
  const { firebaseUser } = useAuth();
  const { loadingData, products, sales, globalSearch, settings } = useData();

  const [posOpen, setPosOpen] = useState(false);
  const [saleIdempotencyKey, setSaleIdempotencyKey] = useState(() => generateId('sale'));
  const [productQuery, setProductQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);

  const sellableProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products
      .filter((p) => p.isActive && p.quantity > 0)
      .filter((p) =>
        !q
          ? true
          : p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [products, productQuery]);

  const filteredSales = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return sales.filter((s) => {
      const dt = toDate(s.saleDate)?.getTime() ?? 0;
      if (fromMs && dt < fromMs) return false;
      if (toMs && dt > toMs) return false;
      if (q) {
        return (
          s.invoiceNumber.toLowerCase().includes(q) ||
          s.paymentMethod.toLowerCase().includes(q) ||
          s.items.some((i) => i.productName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [sales, globalSearch, dateFrom, dateTo]);

  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedSales = filteredSales.slice((safePage - 1) * pageSize, safePage * pageSize);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const cartCost = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitCost * item.quantity, 0),
    [cart]
  );

  const cartProfit = useMemo(() => cartTotal - cartCost, [cartTotal, cartCost]);

  const openNewSale = () => {
    setSaleIdempotencyKey(generateId('sale'));
    setCart([]);
    setProductQuery('');
    setSaleError(null);
    setPosOpen(true);
  };

  const addToCart = (productId: string) => {
    const p = products.find((x) => x.productId === productId);
    if (!p || p.quantity <= 0) return;
    setSaleError(null);

    setCart((prev) => {
      const existing = prev.find((c) => c.productId === productId);
      if (existing) {
        if (existing.quantity >= p.quantity) {
          setSaleError(`Maximum available stock reached for ${p.name} (${p.quantity} ${p.unit}).`);
          return prev;
        }
        return prev.map((c) =>
          c.productId === productId ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          productId: p.productId,
          name: p.name,
          sku: p.sku,
          unitPrice: p.sellingPrice,
          unitCost: p.purchasePrice,
          available: p.quantity,
          quantity: 1,
        },
      ];
    });
  };

  const updateCartQty = (productId: string, nextQty: number) => {
    setSaleError(null);
    setCart((prev) =>
      prev.map((c) => {
        if (c.productId !== productId) return c;
        if (nextQty > c.available) {
          setSaleError(`Cannot exceed available stock for ${c.name} (${c.available} max).`);
          return { ...c, quantity: c.available };
        }
        const clamped = Math.max(1, nextQty || 1);
        return { ...c, quantity: clamped };
      })
    );
  };

  const handleCheckout = async () => {
    if (!firebaseUser || cart.length === 0) return;
    setSaleError(null);
    setSubmitting(true);
    try {
      const res = await createSaleTransaction({
        ownerId: firebaseUser.uid,
        saleId: saleIdempotencyKey,
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        paymentMethod,
      });
      setSaleSuccess(
        `Invoice ${res.invoiceNumber} recorded for ${formatINR(res.totalAmount)}. Inventory deducted atomically.`
      );
      setPosOpen(false);
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : 'Failed to complete sale.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      `stocksense-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Invoice', 'Date', 'Items Count', 'Payment Method', 'Total (INR)', 'Cost (INR)', 'Profit (INR)', 'Source'],
      filteredSales.map((s) => [
        s.invoiceNumber,
        formatDateTime(s.saleDate, settings?.timezone),
        s.items.length,
        s.paymentMethod,
        s.totalAmount,
        s.totalCost,
        s.totalProfit,
        s.dataSource,
      ])
    );
  };

  if (loadingData) {
    return <LoadingSkeleton rows={8} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Sales &amp; POS Billing
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Create itemized retail invoices with atomic inventory deduction and profit tracking
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openNewSale}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Sale
          </button>
        </div>
      </div>

      {saleSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{saleSuccess}</span>
          <button type="button" onClick={() => setSaleSuccess(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Date Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <label className="text-slate-500">From:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-slate-500">To:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="text-xs text-teal-600 hover:underline"
          >
            Clear dates
          </button>
        )}
        <div className="ml-auto text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
          Filtered Total:{' '}
          <span className="font-bold text-slate-900 dark:text-white">
            {formatINR(filteredSales.reduce((a, s) => a + s.totalAmount, 0))}
          </span>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Sale Date</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Gross Profit</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {paginatedSales.map((s) => (
                <tr key={s.saleId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {s.invoiceNumber}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTime(s.saleDate, settings?.timezone)}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                    {s.items.length} SKU{s.items.length > 1 ? 's' : ''} ({s.items.reduce((a, i) => a + i.quantity, 0)} units)
                  </td>
                  <td className="py-3 px-4 text-xs">{s.paymentMethod}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                    {formatINR(s.totalAmount)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatINR(s.totalProfit)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setViewingSale(s)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Invoice
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedSales.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                    <ShoppingCart className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                    No sales match your selected date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          totalItems={filteredSales.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      {/* POS New Sale Modal */}
      <Modal
        open={posOpen}
        onClose={() => setPosOpen(false)}
        title="New POS Sale"
        subtitle="Select products to add to the invoice. Inventory is verified and deducted atomically."
        maxWidth="max-w-4xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Product Picker */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search in-stock products or SKU..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {sellableProducts.map((p) => (
                <div
                  key={p.productId}
                  className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {p.sku} · Stock: {p.quantity} {p.unit} · {formatINR(p.sellingPrice)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(p.productId)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-900 dark:bg-teal-600 text-white rounded-md shrink-0"
                  >
                    Add
                  </button>
                </div>
              ))}
              {sellableProducts.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  No in-stock products match your search.
                </div>
              )}
            </div>
          </div>

          {/* Right: Cart & Payment */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500">
                Invoice Items ({cart.length})
              </div>
              {saleError && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
                  {saleError}
                </div>
              )}

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.productId} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{line.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {formatINR(line.unitPrice)} × {line.quantity} ={' '}
                        {formatINR(line.unitPrice * line.quantity)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={line.available}
                        value={line.quantity}
                        onChange={(e) => updateCartQty(line.productId, Number(e.target.value))}
                        className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) => prev.filter((x) => x.productId !== line.productId))
                        }
                        aria-label="Remove item"
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {cart.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Click Add on products on the left to build the invoice.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium mb-1">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['UPI', 'Cash', 'Card', 'Credit'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        paymentMethod === m
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-600 dark:border-teal-600'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Estimated Cost</span>
                  <span className="font-mono tabular-nums">{formatINR(cartCost)}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Estimated Gross Profit</span>
                  <span className="font-mono tabular-nums">{formatINR(cartProfit)}</span>
                </div>
                <div className="flex items-center justify-between text-base font-bold pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Total Payable</span>
                  <span className="font-mono tabular-nums">{formatINR(cartTotal)}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={handleCheckout}
                className="w-full py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Processing Sale...' : 'Complete Sale & Generate Invoice'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Invoice Details Modal */}
      <Modal
        open={Boolean(viewingSale)}
        onClose={() => setViewingSale(null)}
        title={`Invoice ${viewingSale?.invoiceNumber || ''}`}
        subtitle={
          viewingSale
            ? `${formatDateTime(viewingSale.saleDate, settings?.timezone)} · Paid via ${viewingSale.paymentMethod}`
            : undefined
        }
      >
        {viewingSale && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {viewingSale.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 font-medium">{item.productName}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{item.quantity}</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {formatINR(item.unitPrice)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums font-semibold">
                        {formatINR(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-between gap-2 text-sm">
              <div className="text-xs text-slate-500">
                Cost: <span className="font-mono">{formatINR(viewingSale.totalCost)}</span> · Profit:{' '}
                <span className="font-mono text-emerald-600">
                  {formatINR(viewingSale.totalProfit)}
                </span>
              </div>
              <div className="font-bold font-mono tabular-nums">
                Grand Total: {formatINR(viewingSale.totalAmount)}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
