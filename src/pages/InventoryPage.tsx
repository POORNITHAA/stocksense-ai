import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Boxes, Search, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { recordStockMovement } from '../services/inventoryService';
import { formatDateTime, formatINR } from '../utils/format';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { StatusLabel } from '../components/common/StatusLabel';

type Tab = 'overview' | 'low-stock' | 'out-of-stock' | 'movements';
type MovementOp = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';

export function InventoryPage() {
  const { firebaseUser } = useAuth();
  const { loadingData, products, stockMovements, globalSearch, settings } = useData();

  const [tab, setTab] = useState<Tab>('overview');
  const [localSearch, setLocalSearch] = useState('');
  const [movFilter, setMovFilter] = useState<'ALL' | 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'SALE' | 'PURCHASE_RECEIPT'>('ALL');
  const [page, setPage] = useState(1);

  const [modalOp, setModalOp] = useState<MovementOp | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qtyInput, setQtyInput] = useState(0);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [opSuccess, setOpSuccess] = useState<string | null>(null);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const lowStockList = useMemo(
    () => activeProducts.filter((p) => p.quantity > 0 && p.quantity <= p.minimumStock),
    [activeProducts]
  );
  const outOfStockList = useMemo(
    () => activeProducts.filter((p) => p.quantity === 0),
    [activeProducts]
  );

  const stockSummary = useMemo(() => {
    let stockInTotal = 0;
    let stockOutTotal = 0;
    for (const m of stockMovements) {
      if (m.movementType === 'STOCK_IN' || m.movementType === 'PURCHASE_RECEIPT') {
        stockInTotal += Number(m.quantity || 0);
      } else if (m.movementType === 'STOCK_OUT' || m.movementType === 'SALE') {
        stockOutTotal += Number(m.quantity || 0);
      }
    }
    const totalValuation = activeProducts.reduce(
      (sum, p) => sum + p.quantity * p.purchasePrice,
      0
    );
    return { stockInTotal, stockOutTotal, totalValuation };
  }, [stockMovements, activeProducts]);

  const filteredMovements = useMemo(() => {
    const q = (localSearch || globalSearch).trim().toLowerCase();
    return stockMovements.filter((m) => {
      if (movFilter !== 'ALL' && m.movementType !== movFilter) return false;
      if (q) {
        return (
          m.productName.toLowerCase().includes(q) ||
          m.reason.toLowerCase().includes(q) ||
          (m.referenceId || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [stockMovements, movFilter, localSearch, globalSearch]);

  const displayedProducts = useMemo(() => {
    const q = (localSearch || globalSearch).trim().toLowerCase();
    const base =
      tab === 'low-stock'
        ? lowStockList
        : tab === 'out-of-stock'
        ? outOfStockList
        : activeProducts;
    if (!q) return base;
    return base.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [tab, activeProducts, lowStockList, outOfStockList, localSearch, globalSearch]);

  const pageSize = 12;
  const activeRows = tab === 'movements' ? filteredMovements : displayedProducts;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = activeRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openOpModal = (op: MovementOp, presetProductId?: string) => {
    const firstId = presetProductId || activeProducts[0]?.productId || '';
    const prod = activeProducts.find((p) => p.productId === firstId);
    setModalOp(op);
    setSelectedProductId(firstId);
    setQtyInput(op === 'ADJUSTMENT' && prod ? prod.quantity : 10);
    setReason('');
    setOpError(null);
  };

  const handleSubmitOp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !modalOp) return;
    setOpError(null);
    setSubmitting(true);
    try {
      const res = await recordStockMovement({
        ownerId: firebaseUser.uid,
        productId: selectedProductId,
        operation: modalOp,
        quantityOrNewStock: Number(qtyInput),
        reason,
      });
      setOpSuccess(
        `Inventory updated atomically: ${res.previousStock} → ${res.newStock} units.`
      );
      setModalOp(null);
    } catch (err) {
      setOpError(err instanceof Error ? err.message : 'Stock update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = activeProducts.find((p) => p.productId === selectedProductId);

  if (loadingData) {
    return <LoadingSkeleton rows={8} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Inventory &amp; Stock Ledger
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Atomic stock-in, stock-out, physical count adjustments, and immutable audit history
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={activeProducts.length === 0}
            onClick={() => openOpModal('STOCK_IN')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-40"
          >
            <ArrowDownLeft className="w-4 h-4" />
            Stock In
          </button>
          <button
            type="button"
            disabled={activeProducts.length === 0}
            onClick={() => openOpModal('STOCK_OUT')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-40"
          >
            <ArrowUpRight className="w-4 h-4" />
            Stock Out
          </button>
          <button
            type="button"
            disabled={activeProducts.length === 0}
            onClick={() => openOpModal('ADJUSTMENT')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-slate-700 hover:opacity-90 text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-40"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Stock Adjustment
          </button>
        </div>
      </div>

      {opSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{opSuccess}</span>
          <button type="button" onClick={() => setOpSuccess(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Inventory Cost Value</div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {formatINR(stockSummary.totalValuation, 0)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Logged Stock In</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            +{stockSummary.stockInTotal} units
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Logged Stock Out / Sales</div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            -{stockSummary.stockOutTotal} units
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Alerts (Low / Out)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400 mt-1">
            {lowStockList.length} / {outOfStockList.length}
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          {(
            [
              { id: 'overview', label: `Current Stock (${activeProducts.length})` },
              { id: 'low-stock', label: `Low Stock (${lowStockList.length})` },
              { id: 'out-of-stock', label: `Out of Stock (${outOfStockList.length})` },
              { id: 'movements', label: `Movement History (${stockMovements.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-slate-900 text-white dark:bg-teal-600'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Filter product or reference..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-52"
            />
          </div>

          {tab === 'movements' && (
            <select
              value={movFilter}
              onChange={(e) => {
                setMovFilter(e.target.value as typeof movFilter);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              <option value="ALL">All Movement Types</option>
              <option value="STOCK_IN">Stock In</option>
              <option value="STOCK_OUT">Stock Out</option>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="SALE">POS Sale</option>
              <option value="PURCHASE_RECEIPT">PO Receipt</option>
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'movements' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Before → After</th>
                  <th className="py-3 px-4">Reason / Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {(paginatedRows as typeof filteredMovements).map((m) => (
                  <tr key={m.movementId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(m.createdAt, settings?.timezone)}
                    </td>
                    <td className="py-3 px-4 font-medium">{m.productName}</td>
                    <td className="py-3 px-4">
                      <StatusLabel
                        label={m.movementType.replace('_', ' ')}
                        tone={
                          m.movementType === 'STOCK_IN' || m.movementType === 'PURCHASE_RECEIPT'
                            ? 'success'
                            : m.movementType === 'ADJUSTMENT'
                            ? 'info'
                            : 'warning'
                        }
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                      {m.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {m.previousStock} → <span className="font-semibold">{m.newStock}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {m.reason} {m.referenceId ? `(${m.referenceId})` : ''}
                    </td>
                  </tr>
                ))}
                {paginatedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                      No stock movements found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4 text-right">Available</th>
                  <th className="py-3 px-4 text-right">Min / Safety</th>
                  <th className="py-3 px-4 text-right">Stock Value</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {(paginatedRows as typeof displayedProducts).map((p) => (
                  <tr key={p.productId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium">{p.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.sku}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {p.quantity} {p.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500">
                      {p.minimumStock} / {p.safetyStock}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {formatINR(p.quantity * p.purchasePrice, 0)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel
                        label={
                          p.quantity === 0
                            ? 'Out of Stock'
                            : p.quantity <= p.minimumStock
                            ? 'Low Stock'
                            : 'Healthy'
                        }
                        tone={
                          p.quantity === 0
                            ? 'critical'
                            : p.quantity <= p.minimumStock
                            ? 'warning'
                            : 'success'
                        }
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => openOpModal('STOCK_IN', p.productId)}
                          className="text-emerald-600 hover:underline"
                        >
                          +In
                        </button>
                        <button
                          type="button"
                          onClick={() => openOpModal('STOCK_OUT', p.productId)}
                          className="text-amber-600 hover:underline"
                        >
                          -Out
                        </button>
                        <button
                          type="button"
                          onClick={() => openOpModal('ADJUSTMENT', p.productId)}
                          className="text-slate-600 dark:text-slate-300 hover:underline"
                        >
                          Adjust
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                      <Boxes className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                      No products in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <Pagination
          page={safePage}
          totalItems={activeRows.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      {/* Stock Operation Modal */}
      <Modal
        open={Boolean(modalOp)}
        onClose={() => setModalOp(null)}
        title={
          modalOp === 'STOCK_IN'
            ? 'Record Stock In'
            : modalOp === 'STOCK_OUT'
            ? 'Record Stock Out'
            : 'Physical Stock Adjustment'
        }
        subtitle="Updates product stock and creates an immutable stock movement entry atomically."
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmitOp} className="space-y-4">
          {opError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {opError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">Product *</label>
            <select
              required
              value={selectedProductId}
              onChange={(e) => {
                const pid = e.target.value;
                setSelectedProductId(pid);
                const p = activeProducts.find((x) => x.productId === pid);
                if (modalOp === 'ADJUSTMENT' && p) {
                  setQtyInput(p.quantity);
                }
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              {activeProducts.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.name} ({p.sku}) — Available: {p.quantity} {p.unit}
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (() => {
            const projected =
              modalOp === 'STOCK_IN'
                ? selectedProduct.quantity + (Number(qtyInput) || 0)
                : modalOp === 'STOCK_OUT'
                ? selectedProduct.quantity - (Number(qtyInput) || 0)
                : Number(qtyInput) || 0;
            return (
              <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 font-mono flex flex-wrap justify-between gap-2">
                <span>
                  Current: {selectedProduct.quantity} {selectedProduct.unit} (Min: {selectedProduct.minimumStock})
                </span>
                <span className={projected < 0 ? 'text-red-600 font-semibold' : 'text-teal-600 dark:text-teal-400 font-semibold'}>
                  Projected: {projected} {selectedProduct.unit}
                </span>
              </div>
            );
          })()}

          <div>
            <label className="block text-xs font-medium mb-1">
              {modalOp === 'ADJUSTMENT' ? 'New Physical Count Quantity *' : 'Quantity *'}
            </label>
            <input
              type="number"
              required
              min={modalOp === 'ADJUSTMENT' ? 0 : 1}
              step="1"
              value={qtyInput}
              onChange={(e) => setQtyInput(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Reason *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                modalOp === 'STOCK_IN'
                  ? 'e.g., Direct supplier delivery or store transfer'
                  : modalOp === 'STOCK_OUT'
                  ? 'e.g., Damaged goods write-off or bulk dispatch'
                  : 'e.g., Weekly physical cycle count reconciliation'
              }
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setModalOp(null)}
              className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Confirm Operation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
