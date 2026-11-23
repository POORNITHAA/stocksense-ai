import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, RotateCcw, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  computeSmartReorderRecommendations,
  type ReorderRecommendationRow,
} from '../services/forecastService';
import { createPurchaseOrder } from '../services/purchaseOrderService';
import { formatINR } from '../utils/format';
import { StatusLabel } from '../components/common/StatusLabel';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';

export function SmartReorderPage() {
  const { firebaseUser } = useAuth();
  const { loadingData, products, sales, suppliers, settings } = useData();

  const defaultLeadTime = settings?.defaultLeadTimeDays ?? 5;
  const [reviewCycleDays, setReviewCycleDays] = useState(7);
  const [leadTimeOverrides, setLeadTimeOverrides] = useState<Record<string, number>>({});
  const [safetyStockOverrides, setSafetyStockOverrides] = useState<Record<string, number>>({});
  const [targetStockOverrides, setTargetStockOverrides] = useState<Record<string, number>>({});
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, string>>({});
  const [onlyNeeded, setOnlyNeeded] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recommendations = useMemo(
    () =>
      computeSmartReorderRecommendations({
        products,
        sales,
        suppliers,
        defaultLeadTimeDays: defaultLeadTime,
        leadTimeOverrides,
        safetyStockOverrides,
        targetStockOverrides,
        reviewCycleDays,
      }),
    [
      products,
      sales,
      suppliers,
      defaultLeadTime,
      leadTimeOverrides,
      safetyStockOverrides,
      targetStockOverrides,
      reviewCycleDays,
    ]
  );

  const displayed = useMemo(
    () =>
      onlyNeeded
        ? recommendations.filter(
            (r) => r.suggestedQuantity > 0 || r.product.quantity <= r.product.minimumStock
          )
        : recommendations,
    [recommendations, onlyNeeded]
  );

  const clearManualQty = (pid: string) => {
    setQtyOverrides((prev) => {
      if (!(pid in prev)) return prev;
      const next = { ...prev };
      delete next[pid];
      return next;
    });
  };

  const resetRowOverrides = (pid: string) => {
    setLeadTimeOverrides((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
    setSafetyStockOverrides((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
    setTargetStockOverrides((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
    clearManualQty(pid);
  };

  const handleAcceptAndCreatePo = async (row: ReorderRecommendationRow) => {
    if (!firebaseUser) return;
    setError(null);
    setBanner(null);

    const chosenSupplierId =
      supplierOverrides[row.product.productId] ||
      row.supplier?.supplierId ||
      suppliers[0]?.supplierId;
    const sup = suppliers.find((s) => s.supplierId === chosenSupplierId);
    if (!sup) {
      setError('No supplier available. Please create a supplier first.');
      return;
    }

    const orderQty =
      qtyOverrides[row.product.productId] ?? Math.max(1, row.suggestedQuantity);

    setCreatingId(row.product.productId);
    try {
      const eta = new Date(Date.now() + row.leadTimeDays * 24 * 60 * 60 * 1000);
      const res = await createPurchaseOrder(firebaseUser.uid, {
        supplierId: sup.supplierId,
        supplierName: sup.company,
        expectedDeliveryDate: eta,
        initialStatus: 'Pending',
        items: [
          {
            productId: row.product.productId,
            productName: row.product.name,
            orderedQty: orderQty,
            unitCost: row.product.purchasePrice,
          },
        ],
      });
      setBanner(
        `Created Purchase Order ${res.poNumber} for ${orderQty} ${row.product.unit} of ${row.product.name} with ${sup.company}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create purchase order.');
    } finally {
      setCreatingId(null);
    }
  };

  if (loadingData) {
    return <LoadingSkeleton rows={8} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Smart Reorder Recommendations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Calculates expected lead-time demand, editable safety stock &amp; target stock levels, and explains every replenishment suggestion
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-lg">
            <span>Review Buffer (days):</span>
            <input
              type="number"
              min={1}
              max={30}
              value={reviewCycleDays}
              onChange={(e) => setReviewCycleDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
              className="w-12 px-1.5 py-0.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </label>
          <button
            type="button"
            onClick={() => setOnlyNeeded((v) => !v)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              onlyNeeded
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-600 dark:border-teal-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            {onlyNeeded ? 'Showing Actionable Only' : 'Showing All Active SKUs'}
          </button>
        </div>
      </div>

      {/* Formula Explanation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
        <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-slate-900 dark:text-white">
            Reorder Calculation Methodology
          </div>
          <p className="leading-relaxed">
            <span className="font-mono">Expected Lead-Time Demand</span> = Avg Daily Sales × Supplier Lead Time (days) ·{' '}
            <span className="font-mono">Reorder Point</span> = Expected Lead-Time Demand + Safety Stock ·{' '}
            <span className="font-mono">Target Stock</span> = Editable (defaults to Reorder Point + {reviewCycleDays}-day Review Buffer, min 2× minimum stock) ·{' '}
            <span className="font-mono">Suggested Reorder Qty</span> = max(0, Target Stock − Current Stock).
          </p>
        </div>
      </div>

      {banner && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Recommendations Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-3 text-right">Current</th>
                <th className="py-3 px-3 text-right">Avg / Day</th>
                <th className="py-3 px-3 text-right">Lead Time (d)</th>
                <th className="py-3 px-3 text-right">Lead Demand</th>
                <th className="py-3 px-3 text-right">Safety Stock</th>
                <th className="py-3 px-3 text-right">ROP</th>
                <th className="py-3 px-3 text-right">Target Stock</th>
                <th className="py-3 px-3 text-right">Order Qty</th>
                <th className="py-3 px-3">Supplier</th>
                <th className="py-3 px-3 text-right">Est. Cost</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {displayed.map((r) => {
                const pid = r.product.productId;
                const editedQty = qtyOverrides[pid] ?? r.suggestedQuantity;
                const chosenSupId =
                  supplierOverrides[pid] || r.supplier?.supplierId || suppliers[0]?.supplierId || '';
                const estCost = editedQty * r.product.purchasePrice;
                const hasOverrides =
                  leadTimeOverrides[pid] !== undefined ||
                  safetyStockOverrides[pid] !== undefined ||
                  targetStockOverrides[pid] !== undefined ||
                  qtyOverrides[pid] !== undefined;

                return (
                  <Fragment key={pid}>
                    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {r.product.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusLabel
                            label={r.status}
                            tone={
                              r.status === 'Critical'
                                ? 'critical'
                                : r.status === 'Reorder Needed'
                                ? 'warning'
                                : 'success'
                            }
                          />
                          {!r.hasSufficientHistory && (
                            <span
                              title="Fewer than 3 days of 30-day sales history"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Limited history
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                        {r.product.quantity}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {r.avgDailyDemand}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={leadTimeOverrides[pid] ?? r.leadTimeDays}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(90, Number(e.target.value) || 1));
                            setLeadTimeOverrides((prev) => ({ ...prev, [pid]: val }));
                            clearManualQty(pid);
                          }}
                          aria-label={`Lead time for ${r.product.name}`}
                          className="w-14 px-1.5 py-1 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {r.expectedLeadTimeDemand}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={safetyStockOverrides[pid] ?? r.safetyStock}
                          onChange={(e) => {
                            const parsed = Number(e.target.value);
                            const raw = Number.isFinite(parsed) ? parsed : 0;
                            setSafetyStockOverrides((prev) => ({
                              ...prev,
                              [pid]: Math.max(0, Math.round(raw)),
                            }));
                            clearManualQty(pid);
                          }}
                          aria-label={`Safety stock for ${r.product.name}`}
                          className="w-16 px-1.5 py-1 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-700 dark:text-slate-200">
                        {r.reorderPoint}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={targetStockOverrides[pid] ?? r.targetStock}
                          onChange={(e) => {
                            const parsed = Number(e.target.value);
                            const raw = Number.isFinite(parsed) ? parsed : 0;
                            setTargetStockOverrides((prev) => ({
                              ...prev,
                              [pid]: Math.max(0, Math.round(raw)),
                            }));
                            clearManualQty(pid);
                          }}
                          aria-label={`Target stock for ${r.product.name}`}
                          className="w-16 px-1.5 py-1 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                        />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={editedQty}
                          onChange={(e) =>
                            setQtyOverrides((prev) => ({
                              ...prev,
                              [pid]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          aria-label={`Order quantity for ${r.product.name}`}
                          className="w-16 px-2 py-1 text-right font-mono font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={chosenSupId}
                          onChange={(e) =>
                            setSupplierOverrides((prev) => ({ ...prev, [pid]: e.target.value }))
                          }
                          className="max-w-[150px] px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                        >
                          {suppliers.map((s) => (
                            <option key={s.supplierId} value={s.supplierId}>
                              {s.company}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-medium">
                        {formatINR(estCost, 0)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {hasOverrides && (
                            <button
                              type="button"
                              onClick={() => resetRowOverrides(pid)}
                              title="Reset row overrides"
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={creatingId === pid || editedQty <= 0 || suppliers.length === 0}
                            onClick={() => handleAcceptAndCreatePo(r)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-40 whitespace-nowrap"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            {creatingId === pid ? 'Creating...' : 'Create PO'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-slate-50/40 dark:bg-slate-900/60">
                      <td colSpan={12} className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Why:{' '}
                        </span>
                        {r.explanation}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-xs text-slate-500">
                    All active products have healthy stock above their reorder points.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
