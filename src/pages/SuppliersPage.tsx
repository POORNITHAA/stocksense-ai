import React, { useMemo, useState } from 'react';
import { Edit2, Eye, Plus, Search, Trash2, Truck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  createSupplier,
  deleteSupplier,
  updateSupplier,
  type SupplierInput,
} from '../services/supplierService';
import { formatDate, formatINR } from '../utils/format';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { StatusLabel } from '../components/common/StatusLabel';
import type { Supplier } from '../types';

const EMPTY_SUPPLIER: SupplierInput = {
  name: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  suppliedProducts: [],
  leadTimeDays: 5,
  status: 'active',
};

export function SuppliersPage() {
  const { firebaseUser, isAdmin } = useAuth();
  const { loadingData, suppliers, products, purchaseOrders, globalSearch, settings } = useData();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierInput>(EMPTY_SUPPLIER);
  const [suppliedText, setSuppliedText] = useState('');
  const [mappedProductIds, setMappedProductIds] = useState<string[]>([]);
  const [originalMappedIds, setOriginalMappedIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = (search || globalSearch).trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.company.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    );
  }, [suppliers, search, globalSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_SUPPLIER,
      leadTimeDays: settings?.defaultLeadTimeDays ?? 5,
    });
    setSuppliedText('');
    setMappedProductIds([]);
    setOriginalMappedIds([]);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      company: s.company,
      email: s.email,
      phone: s.phone,
      address: s.address || '',
      suppliedProducts: s.suppliedProducts,
      leadTimeDays: s.leadTimeDays,
      status: s.status,
    });
    setSuppliedText((s.suppliedProducts ?? []).join(', '));
    const linked = products.filter((p) => p.supplierId === s.supplierId).map((p) => p.productId);
    setMappedProductIds(linked);
    setOriginalMappedIds(linked);
    setFormError(null);
    setFormOpen(true);
  };

  const toggleProductMapping = (productId: string) => {
    setMappedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setFormError(null);
    setActionError(null);
    setSaving(true);
    try {
      const manualNotes = suppliedText
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      const mappedNames = products
        .filter((p) => mappedProductIds.includes(p.productId))
        .map((p) => p.name);
      const combinedSupplied = Array.from(new Set([...manualNotes, ...mappedNames]));

      const payload: SupplierInput = {
        ...form,
        suppliedProducts: combinedSupplied,
      };
      if (editing) {
        await updateSupplier(editing.supplierId, payload, mappedProductIds, originalMappedIds);
        setBanner(`Updated supplier "${form.company.trim()}" and synced ${mappedProductIds.length} product mappings.`);
      } else {
        await createSupplier(firebaseUser.uid, payload, mappedProductIds);
        setBanner(`Added supplier "${form.company.trim()}" with ${mappedProductIds.length} linked catalog products.`);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    const hasLinkedOrders = purchaseOrders.some((po) => po.supplierId === deleteTarget.supplierId);
    if (hasLinkedOrders) {
      setActionError(
        `Cannot delete "${deleteTarget.company}" because existing Purchase Orders reference this supplier. Set status to Inactive instead.`
      );
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      const linkedIds = products
        .filter((p) => p.supplierId === deleteTarget.supplierId)
        .map((p) => p.productId);
      await deleteSupplier(deleteTarget.supplierId, linkedIds);
      setBanner(`Deleted supplier "${deleteTarget.company}".`);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete supplier.');
    } finally {
      setDeleting(false);
    }
  };

  const viewingOrders = useMemo(() => {
    if (!viewing) return [];
    return purchaseOrders.filter((po) => po.supplierId === viewing.supplierId);
  }, [viewing, purchaseOrders]);

  const viewingLinkedProducts = useMemo(() => {
    if (!viewing) return [];
    return products.filter((p) => p.supplierId === viewing.supplierId);
  }, [viewing, products]);

  if (loadingData) {
    return <LoadingSkeleton rows={6} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Supplier Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage vendor contacts, delivery lead times, and purchase order history
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Add Supplier
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

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by company, contact, or email..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                <th className="py-3 px-4">Company &amp; Contact</th>
                <th className="py-3 px-4">Email &amp; Phone</th>
                <th className="py-3 px-4 text-right">Lead Time</th>
                <th className="py-3 px-4 text-right">Linked SKUs</th>
                <th className="py-3 px-4 text-right">Pending POs</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filtered.map((s) => {
                const linkedCount = products.filter((p) => p.supplierId === s.supplierId).length;
                const pendingPoCount = purchaseOrders.filter(
                  (po) =>
                    po.supplierId === s.supplierId &&
                    ['Draft', 'Pending', 'Approved', 'Ordered', 'Partially Received'].includes(
                      po.orderStatus
                    )
                ).length;

                return (
                  <tr key={s.supplierId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {s.company}
                      </div>
                      <div className="text-xs text-slate-500">{s.name}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div>{s.email}</div>
                      <div className="text-slate-500 font-mono">{s.phone}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {s.leadTimeDays} days
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {linkedCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {pendingPoCount}
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel
                        label={s.status === 'active' ? 'Active' : 'Inactive'}
                        tone={s.status === 'active' ? 'success' : 'neutral'}
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewing(s)}
                          title="View supplier details"
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          title="Edit supplier"
                          className="p-1.5 text-slate-500 hover:text-teal-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {(isAdmin || s.dataSource === 'sample') && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(s)}
                            title="Delete supplier"
                            className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    <Truck className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                    No suppliers match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Supplier — ${editing.company}` : 'Add Supplier'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Company Name *</label>
              <input
                type="text"
                required
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contact Person *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Lead Time (Days) *</label>
              <input
                type="number"
                required
                min={1}
                max={365}
                value={form.leadTimeDays}
                onChange={(e) => setForm({ ...form, leadTimeDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as 'active' | 'inactive' })
                }
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">
                Map Catalog Products ({mappedProductIds.length} selected)
              </label>
              <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                {products.filter((p) => p.isActive).map((p) => {
                  const checked = mappedProductIds.includes(p.productId);
                  return (
                    <label
                      key={p.productId}
                      className="flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProductMapping(p.productId)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0 ml-2">
                        {p.sku}
                      </span>
                    </label>
                  );
                })}
                {products.filter((p) => p.isActive).length === 0 && (
                  <div className="p-3 text-xs text-slate-500 text-center">
                    No active catalog products available to link.
                  </div>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">
                Supplied Product Notes (comma-separated)
              </label>
              <input
                type="text"
                value={suppliedText}
                onChange={(e) => setSuppliedText(e.target.value)}
                placeholder="Basmati Rice, Wheat Flour, Sugar"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
            >
              {saving ? 'Saving...' : 'Save Supplier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Supplier Modal */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.company || 'Supplier Details'}
        subtitle={viewing ? `Contact: ${viewing.name} · Lead Time: ${viewing.leadTimeDays} days` : undefined}
      >
        {viewing && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-slate-500">Email</div>
                <div className="font-medium">{viewing.email}</div>
              </div>
              <div>
                <div className="text-slate-500">Phone</div>
                <div className="font-mono font-medium">{viewing.phone}</div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-500">Address</div>
                <div>{viewing.address || '—'}</div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Catalog Products Linked ({viewingLinkedProducts.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {viewingLinkedProducts.map((p) => (
                  <span
                    key={p.productId}
                    className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md"
                  >
                    {p.name} ({p.quantity} {p.unit})
                  </span>
                ))}
                {viewingLinkedProducts.length === 0 && (
                  <span className="text-slate-500">No products currently linked.</span>
                )}
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Purchase Order History ({viewingOrders.length})
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                {viewingOrders.map((po) => (
                  <div key={po.purchaseOrderId} className="p-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold">{po.poNumber}</span> ·{' '}
                      {formatDate(po.orderDate, settings?.timezone)}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono">{formatINR(po.totalAmount)}</span>
                      <StatusLabel label={po.orderStatus} tone="info" />
                    </div>
                  </div>
                ))}
                {viewingOrders.length === 0 && (
                  <div className="p-4 text-center text-slate-500">No purchase orders yet.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Supplier"
        description={
          deleteTarget
            ? `Permanently remove "${deleteTarget.company}" and unlink any assigned catalog products?`
            : ''
        }
        confirmLabel="Delete Supplier"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
