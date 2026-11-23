import React, { useMemo, useState } from 'react';
import { ClipboardList, Eye, PackageCheck, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { generateId } from '../lib/firebase';
import {
  createPurchaseOrder,
  deletePurchaseOrder,
  receivePurchaseOrderItems,
  updatePurchaseOrderStatus,
} from '../services/purchaseOrderService';
import { formatDate, formatDateTime, formatINR } from '../utils/format';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { StatusLabel } from '../components/common/StatusLabel';
import type { PurchaseOrder, PurchaseOrderStatus } from '../types';

export function PurchaseOrdersPage() {
  const { firebaseUser } = useAuth();
  const { loadingData, purchaseOrders, suppliers, products, globalSearch, settings } = useData();

  const [statusFilter, setStatusFilter] = useState<'ALL' | PurchaseOrderStatus>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState(() => {
    const d = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [initialStatus, setInitialStatus] = useState<'Draft' | 'Pending' | 'Approved' | 'Ordered'>('Pending');
  const [poLines, setPoLines] = useState<
    Array<{ productId: string; productName: string; orderedQty: number; unitCost: number }>
  >([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [receiptIdKey, setReceiptIdKey] = useState('');
  const [recvQtys, setRecvQtys] = useState<Record<string, number>>({});
  const [recvError, setRecvError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);

  const [viewingPo, setViewingPo] = useState<PurchaseOrder | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  const computeEtaForSupplier = (supplierId: string) => {
    const sup = suppliers.find((s) => s.supplierId === supplierId);
    const days = sup?.leadTimeDays ?? settings?.defaultLeadTimeDays ?? 5;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  };

  const filteredPOs = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (statusFilter !== 'ALL' && po.orderStatus !== statusFilter) return false;
      if (q) {
        return (
          po.poNumber.toLowerCase().includes(q) ||
          po.supplierName.toLowerCase().includes(q) ||
          po.items.some((i) => i.productName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [purchaseOrders, statusFilter, globalSearch]);

  const openCreateModal = () => {
    const firstSup = suppliers.find((s) => s.status === 'active') || suppliers[0];
    const supId = firstSup?.supplierId || '';
    setSelectedSupplierId(supId);
    if (supId) {
      setExpectedDate(computeEtaForSupplier(supId));
    }
    const supplierProd =
      products.find((p) => p.isActive && p.supplierId === supId) ||
      products.find((p) => p.isActive);
    setPoLines(
      supplierProd
        ? [
            {
              productId: supplierProd.productId,
              productName: supplierProd.name,
              orderedQty: 25,
              unitCost: supplierProd.purchasePrice,
            },
          ]
        : []
    );
    setCreateError(null);
    setCreateOpen(true);
  };

  const addLine = () => {
    const unused =
      products.find(
        (p) => p.isActive && !poLines.some((l) => l.productId === p.productId)
      ) || products[0];
    if (!unused) return;
    setPoLines((prev) => [
      ...prev,
      {
        productId: unused.productId,
        productName: unused.name,
        orderedQty: 20,
        unitCost: unused.purchasePrice,
      },
    ]);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const sup = suppliers.find((s) => s.supplierId === selectedSupplierId);
    if (!sup) {
      setCreateError('Please select a valid supplier.');
      return;
    }
    setCreateError(null);
    setActionError(null);
    setSaving(true);
    try {
      const res = await createPurchaseOrder(firebaseUser.uid, {
        supplierId: sup.supplierId,
        supplierName: sup.company,
        expectedDeliveryDate: new Date(expectedDate),
        initialStatus,
        items: poLines,
      });
      setBanner(`Created Purchase Order ${res.poNumber} for ${sup.company}.`);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create purchase order.');
    } finally {
      setSaving(false);
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setReceivingPo(po);
    setReceiptIdKey(generateId('rcpt'));
    const initial: Record<string, number> = {};
    po.items.forEach((i) => {
      initial[i.productId] = Math.max(0, i.orderedQty - i.receivedQty);
    });
    setRecvQtys(initial);
    setRecvError(null);
  };

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !receivingPo) return;
    setRecvError(null);
    setActionError(null);
    setReceiving(true);
    try {
      const res = await receivePurchaseOrderItems({
        ownerId: firebaseUser.uid,
        purchaseOrderId: receivingPo.purchaseOrderId,
        receiptId: receiptIdKey,
        receivedQuantities: recvQtys,
      });
      setBanner(
        `Received ${res.totalUnitsReceived} units for ${receivingPo.poNumber}. Status: ${res.newStatus}. Inventory updated atomically.`
      );
      setReceivingPo(null);
    } catch (err) {
      setRecvError(err instanceof Error ? err.message : 'Failed to receive goods.');
    } finally {
      setReceiving(false);
    }
  };

  const handleStatusChange = async (
    po: PurchaseOrder,
    next: 'Pending' | 'Approved' | 'Ordered' | 'Cancelled'
  ) => {
    if (!firebaseUser) return;
    setActionError(null);
    setProcessingAction(true);
    try {
      await updatePurchaseOrderStatus(firebaseUser.uid, po.purchaseOrderId, po.poNumber, next);
      setBanner(`Purchase Order ${po.poNumber} updated to ${next}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update purchase order status.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    await handleStatusChange(cancelTarget, 'Cancelled');
    setCancelTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    setProcessingAction(true);
    try {
      await deletePurchaseOrder(deleteTarget.purchaseOrderId);
      setBanner(`Deleted Purchase Order ${deleteTarget.poNumber}.`);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete purchase order.');
    } finally {
      setProcessingAction(false);
    }
  };

  const getTone = (status: PurchaseOrderStatus) => {
    if (status === 'Received') return 'success';
    if (status === 'Partially Received') return 'warning';
    if (status === 'Cancelled') return 'critical';
    return 'info';
  };

  if (loadingData) {
    return <LoadingSkeleton rows={6} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Purchase Orders
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Create supplier orders and receive partial or full deliveries. Inventory updates strictly on goods receipt.
          </p>
        </div>
        <button
          type="button"
          disabled={suppliers.length === 0 || products.filter((p) => p.isActive).length === 0}
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          Create Purchase Order
        </button>
      </div>

      {banner && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {actionError}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {(
          ['ALL', 'Draft', 'Pending', 'Approved', 'Ordered', 'Partially Received', 'Received', 'Cancelled'] as const
        ).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              statusFilter === s
                ? 'bg-slate-900 text-white dark:bg-teal-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {s === 'ALL' ? 'All Orders' : s}
          </button>
        ))}
      </div>

      {/* PO Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                <th className="py-3 px-4">PO Reference</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4">Order Date</th>
                <th className="py-3 px-4">Expected ETA</th>
                <th className="py-3 px-4 text-right">Total Cost</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Workflow Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filteredPOs.map((po) => {
                const canReceive = ['Approved', 'Ordered', 'Partially Received', 'Pending'].includes(
                  po.orderStatus
                );
                return (
                  <tr key={po.purchaseOrderId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-xs font-semibold">{po.poNumber}</td>
                    <td className="py-3 px-4 text-xs">{po.supplierName}</td>
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(po.orderDate, settings?.timezone)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(po.expectedDeliveryDate, settings?.timezone)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                      {formatINR(po.totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel label={po.orderStatus} tone={getTone(po.orderStatus)} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setViewingPo(po)}
                          className="text-slate-600 dark:text-slate-300 hover:underline inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        {po.orderStatus === 'Draft' && (
                          <button
                            type="button"
                            disabled={processingAction}
                            onClick={() => handleStatusChange(po, 'Pending')}
                            className="text-sky-600 hover:underline disabled:opacity-50"
                          >
                            Submit
                          </button>
                        )}
                        {po.orderStatus === 'Pending' && (
                          <button
                            type="button"
                            disabled={processingAction}
                            onClick={() => handleStatusChange(po, 'Approved')}
                            className="text-sky-600 hover:underline disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {po.orderStatus === 'Approved' && (
                          <button
                            type="button"
                            disabled={processingAction}
                            onClick={() => handleStatusChange(po, 'Ordered')}
                            className="text-sky-600 hover:underline disabled:opacity-50"
                          >
                            Mark Ordered
                          </button>
                        )}
                        {canReceive && (
                          <button
                            type="button"
                            onClick={() => openReceiveModal(po)}
                            className="inline-flex items-center gap-1 text-emerald-600 font-medium hover:underline"
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            Receive Goods
                          </button>
                        )}
                        {po.orderStatus !== 'Received' && po.orderStatus !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(po)}
                            className="text-red-600 hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                        {(po.orderStatus === 'Draft' || po.dataSource === 'sample') && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(po)}
                            title="Delete purchase order"
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPOs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    <ClipboardList className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                    No purchase orders in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create PO Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Purchase Order"
        subtitle="Creating or approving a purchase order does not increment inventory until goods are received."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleCreatePo} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Supplier *</label>
              <select
                required
                value={selectedSupplierId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSupplierId(id);
                  setExpectedDate(computeEtaForSupplier(id));
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {suppliers.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    {s.company} ({s.leadTimeDays}d lead)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Expected Delivery *</label>
              <input
                type="date"
                required
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Initial Status</label>
              <select
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as typeof initialStatus)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="Draft">Draft</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Ordered">Ordered</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Order Line Items</span>
              <button
                type="button"
                onClick={addLine}
                className="text-xs font-medium text-teal-600 hover:underline"
              >
                + Add Product Row
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
              {poLines.map((line, idx) => (
                <div key={idx} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-2 items-center">
                  <div className="sm:col-span-6">
                    <label className="block sm:hidden text-[11px] font-medium text-slate-500 mb-1">Product</label>
                    <select
                      value={line.productId}
                      onChange={(e) => {
                        const prod = products.find((p) => p.productId === e.target.value);
                        if (!prod) return;
                        setPoLines((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? {
                                  ...row,
                                  productId: prod.productId,
                                  productName: prod.name,
                                  unitCost: prod.purchasePrice,
                                }
                              : row
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      {products
                        .filter((p) => p.isActive)
                        .map((p) => (
                          <option key={p.productId} value={p.productId}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block sm:hidden text-[11px] font-medium text-slate-500 mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={line.orderedQty}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, orderedQty: Math.max(1, Number(e.target.value) || 1) } : row
                          )
                        )
                      }
                      aria-label="Ordered quantity"
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block sm:hidden text-[11px] font-medium text-slate-500 mb-1">Unit Cost (INR)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, unitCost: Math.max(0, Number(e.target.value) || 0) } : row
                          )
                        )
                      }
                      aria-label="Unit cost"
                      className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      disabled={poLines.length <= 1}
                      onClick={() => setPoLines((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove line item"
                      className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm font-bold font-mono tabular-nums">
              Total Order Value:{' '}
              {formatINR(poLines.reduce((s, l) => s + l.orderedQty * l.unitCost, 0))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
              >
                {saving ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Receive Goods Modal */}
      <Modal
        open={Boolean(receivingPo)}
        onClose={() => setReceivingPo(null)}
        title={`Receive Delivery — ${receivingPo?.poNumber || ''}`}
        subtitle="Enter received quantities for full or partial delivery. Stock and ledger update atomically once per batch."
      >
        {receivingPo && (
          <form onSubmit={handleConfirmReceive} className="space-y-4">
            {recvError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
                {recvError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Ordered</th>
                    <th className="py-2 text-right">Already Received</th>
                    <th className="py-2 text-right">Receive Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {receivingPo.items.map((item) => {
                    const remaining = Math.max(0, item.orderedQty - item.receivedQty);
                    return (
                      <tr key={item.productId}>
                        <td className="py-2.5 font-medium pr-3">{item.productName}</td>
                        <td className="py-2.5 text-right font-mono">{item.orderedQty}</td>
                        <td className="py-2.5 text-right font-mono text-slate-500">
                          {item.receivedQty}
                        </td>
                        <td className="py-2.5 text-right">
                          {remaining === 0 ? (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              Completed
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={remaining}
                              value={recvQtys[item.productId] ?? 0}
                              onChange={(e) =>
                                setRecvQtys((prev) => ({
                                  ...prev,
                                  [item.productId]: Math.max(
                                    0,
                                    Math.min(remaining, Number(e.target.value) || 0)
                                  ),
                                }))
                              }
                              className="w-20 px-2 py-1 text-right font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  receiving ||
                  Object.values(recvQtys).reduce((sum, q) => sum + (Number(q) || 0), 0) <= 0
                }
                className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
              >
                {receiving ? 'Processing Receipt...' : 'Confirm Goods Receipt'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* View PO Details Modal */}
      <Modal
        open={Boolean(viewingPo)}
        onClose={() => setViewingPo(null)}
        title={`Purchase Order ${viewingPo?.poNumber || ''}`}
        subtitle={
          viewingPo
            ? `${viewingPo.supplierName} · Status: ${viewingPo.orderStatus}`
            : undefined
        }
      >
        {viewingPo && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <div>
                <div className="text-slate-500">Order Date</div>
                <div className="font-medium">{formatDate(viewingPo.orderDate, settings?.timezone)}</div>
              </div>
              <div>
                <div className="text-slate-500">Expected Delivery</div>
                <div className="font-medium">{formatDate(viewingPo.expectedDeliveryDate, settings?.timezone)}</div>
              </div>
              <div>
                <div className="text-slate-500">Received / Batches</div>
                <div className="font-medium">
                  {viewingPo.receivedDate
                    ? formatDateTime(viewingPo.receivedDate, settings?.timezone)
                    : `${viewingPo.receiptIds?.length ?? 0} receipt batch(es)`}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Ordered</th>
                    <th className="py-2 text-right">Received</th>
                    <th className="py-2 text-right">Unit Cost</th>
                    <th className="py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {viewingPo.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 font-medium pr-3">{item.productName}</td>
                      <td className="py-2 text-right font-mono">{item.orderedQty}</td>
                      <td className="py-2 text-right font-mono">{item.receivedQty}</td>
                      <td className="py-2 text-right font-mono">{formatINR(item.unitCost)}</td>
                      <td className="py-2 text-right font-mono font-semibold">
                        {formatINR(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-sm font-mono">
              <span>Order Total</span>
              <span>{formatINR(viewingPo.totalAmount)}</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Purchase Order"
        description={
          cancelTarget
            ? `Cancel ${cancelTarget.poNumber} for ${cancelTarget.supplierName}? Cancelled orders cannot receive future goods.`
            : ''
        }
        confirmLabel="Cancel PO"
        destructive
        loading={processingAction}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Purchase Order"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.poNumber}? Any already-received stock movements remain in the inventory ledger.`
            : ''
        }
        confirmLabel="Delete PO"
        destructive
        loading={processingAction}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
