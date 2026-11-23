import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Edit2,
  Eye,
  Image as ImageIcon,
  Package,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  createProduct,
  deleteProduct,
  toggleProductActive,
  updateProduct,
  type ProductInput,
} from '../services/productService';
import { compressImageFileToDataUrl, formatDateTime, formatINR } from '../utils/format';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Pagination } from '../components/common/Pagination';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { StatusLabel } from '../components/common/StatusLabel';
import type { Product } from '../types';

const PAGE_SIZE = 10;

const EMPTY_FORM: ProductInput = {
  name: '',
  sku: '',
  barcode: '',
  category: 'Groceries',
  description: '',
  imageUrl: '',
  purchasePrice: 0,
  sellingPrice: 0,
  quantity: 0,
  minimumStock: 10,
  safetyStock: 10,
  supplierId: '',
  unit: 'pcs',
};

export function ProductsPage() {
  const { firebaseUser, isAdmin } = useAuth();
  const { loadingData, products, suppliers, globalSearch, settings } = useData();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [sortBy, setSortBy] = useState<'name' | 'stock-asc' | 'stock-desc' | 'price-asc' | 'price-desc'>('name');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>(['Groceries', 'Beverages', 'Dairy', 'Personal Care', 'Household Items']);
    products.forEach((p) => set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach((s) => m.set(s.supplierId, s.company));
    return m;
  }, [suppliers]);

  const filteredProducts = useMemo(() => {
    const queryTerm = (search || globalSearch).trim().toLowerCase();
    const list = products.filter((p) => {
      if (statusFilter === 'ACTIVE' && !p.isActive) return false;
      if (statusFilter === 'INACTIVE' && p.isActive) return false;
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (supplierFilter !== 'ALL' && p.supplierId !== supplierFilter) return false;
      if (stockFilter === 'OUT_OF_STOCK' && p.quantity !== 0) return false;
      if (stockFilter === 'LOW_STOCK' && !(p.quantity > 0 && p.quantity <= p.minimumStock)) return false;
      if (stockFilter === 'IN_STOCK' && p.quantity <= p.minimumStock) return false;
      if (queryTerm) {
        return (
          p.name.toLowerCase().includes(queryTerm) ||
          p.sku.toLowerCase().includes(queryTerm) ||
          (p.barcode || '').toLowerCase().includes(queryTerm)
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'stock-asc') return a.quantity - b.quantity;
      if (sortBy === 'stock-desc') return b.quantity - a.quantity;
      if (sortBy === 'price-asc') return a.sellingPrice - b.sellingPrice;
      if (sortBy === 'price-desc') return b.sellingPrice - a.sellingPrice;
      return a.name.localeCompare(b.name);
    });
  }, [products, search, globalSearch, categoryFilter, supplierFilter, stockFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, safePage]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setForm({
      ...EMPTY_FORM,
      safetyStock: settings?.defaultSafetyStock ?? 15,
      minimumStock: settings?.lowStockThreshold ?? 20,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      category: product.category,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      quantity: product.quantity,
      minimumStock: product.minimumStock,
      safetyStock: product.safetyStock,
      supplierId: product.supplierId || '',
      unit: product.unit,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 240);
      setForm((prev) => ({ ...prev, imageUrl: dataUrl }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to process image.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setFormError(null);
    setActionError(null);
    setSaving(true);
    try {
      if (editingProduct) {
        await updateProduct(firebaseUser.uid, editingProduct, form);
        setBanner(`Updated product "${form.name.trim()}" (${form.sku.trim().toUpperCase()}).`);
      } else {
        await createProduct(firebaseUser.uid, form);
        setBanner(`Added product "${form.name.trim()}" (${form.sku.trim().toUpperCase()}) to catalog.`);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmToggleActive = async () => {
    if (!confirmTarget) return;
    setToggling(true);
    setActionError(null);
    try {
      await toggleProductActive(confirmTarget.productId, !confirmTarget.isActive);
      setBanner(
        `${confirmTarget.name} has been ${confirmTarget.isActive ? 'deactivated' : 'reactivated'}.`
      );
      setConfirmTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update product status.');
    } finally {
      setToggling(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!firebaseUser || !deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteProduct(firebaseUser.uid, deleteTarget);
      setBanner(`Deleted product "${deleteTarget.name}" (${deleteTarget.sku}).`);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete product.');
    } finally {
      setDeleting(false);
    }
  };

  if (loadingData) {
    return <LoadingSkeleton rows={8} />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Product Catalog
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage SKUs, pricing, safety stock thresholds, and supplier links
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Add Product
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

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by product name, SKU, or barcode..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={supplierFilter}
          onChange={(e) => {
            setSupplierFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by supplier"
          className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
        >
          <option value="ALL">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.supplierId} value={s.supplierId}>
              {s.company}
            </option>
          ))}
        </select>

        <select
          value={stockFilter}
          onChange={(e) => {
            setStockFilter(e.target.value as typeof stockFilter);
            setPage(1);
          }}
          aria-label="Filter by stock level"
          className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
        >
          <option value="ALL">All Stock Levels</option>
          <option value="IN_STOCK">Healthy Stock</option>
          <option value="LOW_STOCK">Low Stock</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE');
            setPage(1);
          }}
          aria-label="Filter by status"
          className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
        >
          <option value="ACTIVE">Active Products</option>
          <option value="INACTIVE">Inactive Products</option>
          <option value="ALL">All Statuses</option>
        </select>

        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-4 h-4 text-slate-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Sort products"
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            <option value="name">Sort: Name (A–Z)</option>
            <option value="stock-asc">Sort: Stock (Low to High)</option>
            <option value="stock-desc">Sort: Stock (High to Low)</option>
            <option value="price-asc">Sort: Price (Low to High)</option>
            <option value="price-desc">Sort: Price (High to Low)</option>
          </select>
        </div>
      </div>

      {/* Product Table */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products match your filters"
          description="Try clearing the search term or add a new SKU to your catalog."
          actionLabel="Add Product"
          onAction={openCreateModal}
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Purchase</th>
                  <th className="py-3 px-4 text-right">Selling</th>
                  <th className="py-3 px-4 text-right">Stock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {paginated.map((p) => {
                  const tone = !p.isActive
                    ? 'neutral'
                    : p.quantity === 0
                    ? 'critical'
                    : p.quantity <= p.minimumStock
                    ? 'warning'
                    : 'success';
                  const statusText = !p.isActive
                    ? 'Inactive'
                    : p.quantity === 0
                    ? 'Out of Stock'
                    : p.quantity <= p.minimumStock
                    ? 'Low Stock'
                    : 'In Stock';

                  return (
                    <tr
                      key={p.productId}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[240px]">
                              {p.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                              {p.supplierId ? supplierMap.get(p.supplierId) || 'Linked supplier' : 'No supplier'} · {p.dataSource}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {p.sku}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {p.category}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatINR(p.purchasePrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                        {formatINR(p.sellingPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="font-semibold">{p.quantity}</span>{' '}
                        <span className="text-xs text-slate-400">{p.unit}</span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel label={statusText} tone={tone} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingProduct(p)}
                            title="View details"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title="Edit product"
                            className="p-1.5 text-slate-500 hover:text-teal-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmTarget(p)}
                            title={p.isActive ? 'Deactivate product' : 'Reactivate product'}
                            className="p-1.5 text-slate-500 hover:text-amber-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          {(isAdmin || p.dataSource === 'sample') && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(p)}
                              title="Delete product"
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
              </tbody>
            </table>
          </div>
          <Pagination
            page={safePage}
            totalItems={filteredProducts.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingProduct ? `Edit Product — ${editingProduct.sku}` : 'Add New Product'}
        subtitle="SKU must be unique across your store catalog. Stock quantities are adjusted via Inventory operations once created."
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="India Gate Basmati Rice 5kg"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">SKU *</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                placeholder="GRO-RICE-5K"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Barcode</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="890123400101"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Preferred Supplier</label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="">Unassigned</option>
                {suppliers.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    {s.company} ({s.leadTimeDays}d lead)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Purchase Price (INR) *</label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Selling Price (INR) *</label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            {!editingProduct && (
              <div>
                <label className="block text-xs font-medium mb-1">Initial Quantity *</label>
                <input
                  type="number"
                  required
                  min={0}
                  step="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1">Unit *</label>
              <input
                type="text"
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="pcs, kg, bottle, pack"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Minimum Stock *</label>
              <input
                type="number"
                required
                min={0}
                step="1"
                value={form.minimumStock}
                onChange={(e) => setForm({ ...form, minimumStock: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Safety Stock *</label>
              <input
                type="number"
                required
                min={0}
                step="1"
                value={form.safetyStock}
                onChange={(e) => setForm({ ...form, safetyStock: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Product Image</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {form.imageUrl && (
                  <div className="flex items-center gap-2">
                    <img
                      src={form.imageUrl}
                      alt="Preview"
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, imageUrl: '' })}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shelf placement, brand notes, or pack size..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Detail Modal */}
      <Modal
        open={Boolean(viewingProduct)}
        onClose={() => setViewingProduct(null)}
        title={viewingProduct?.name || 'Product Details'}
        subtitle={viewingProduct ? `SKU: ${viewingProduct.sku}` : undefined}
      >
        {viewingProduct && (
          <div className="space-y-4 text-sm">
            {viewingProduct.imageUrl && (
              <div className="flex items-center gap-4">
                <img
                  src={viewingProduct.imageUrl}
                  alt={viewingProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                />
                <div className="text-xs text-slate-500">
                  Supplier:{' '}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {viewingProduct.supplierId
                      ? supplierMap.get(viewingProduct.supplierId) || 'Assigned Supplier'
                      : 'Unassigned'}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-slate-500">Category</div>
                <div className="font-medium">{viewingProduct.category}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Current Stock</div>
                <div className="font-mono font-semibold">
                  {viewingProduct.quantity} {viewingProduct.unit}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Barcode</div>
                <div className="font-mono">{viewingProduct.barcode || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Purchase Price</div>
                <div className="font-mono">{formatINR(viewingProduct.purchasePrice)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Selling Price</div>
                <div className="font-mono">{formatINR(viewingProduct.sellingPrice)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Unit Margin</div>
                <div className="font-mono text-emerald-600">
                  {formatINR(viewingProduct.sellingPrice - viewingProduct.purchasePrice)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Minimum Stock</div>
                <div className="font-mono">{viewingProduct.minimumStock}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Safety Stock</div>
                <div className="font-mono">{viewingProduct.safetyStock}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Supplier</div>
                <div className="text-xs">
                  {viewingProduct.supplierId
                    ? supplierMap.get(viewingProduct.supplierId) || 'Linked'
                    : 'Unassigned'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Last Updated</div>
                <div className="text-xs">{formatDateTime(viewingProduct.updatedAt, settings?.timezone)}</div>
              </div>
            </div>
            {viewingProduct.description && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Description</div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {viewingProduct.description}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Deactivate / Reactivate Confirmation */}
      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={confirmTarget?.isActive ? 'Deactivate Product' : 'Reactivate Product'}
        description={
          confirmTarget?.isActive
            ? `Deactivating "${confirmTarget.name}" prevents it from being sold at POS while preserving historical sales and ledger records.`
            : `Reactivate "${confirmTarget?.name}" so it can be sold and included in reorder calculations again.`
        }
        confirmLabel={confirmTarget?.isActive ? 'Deactivate' : 'Reactivate'}
        destructive={Boolean(confirmTarget?.isActive)}
        loading={toggling}
        onConfirm={handleConfirmToggleActive}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* Delete Product Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Product"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}" (${deleteTarget.sku}) and release its SKU index? Historical invoices referencing this product remain intact.`
            : ''
        }
        confirmLabel="Delete Product"
        destructive
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
