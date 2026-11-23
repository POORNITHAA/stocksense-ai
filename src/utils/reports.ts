import { formatDate, formatDateTime, toDate } from './format';
import type {
  ForecastRecord,
  Product,
  PurchaseOrder,
  Sale,
  StockMovement,
  Supplier,
} from '../types';

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  categoryFilter: string;
  productFilter: string;
}

export interface PeriodSalesRow {
  period: string;
  invoices: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  avgOrderValue: number;
}

export interface ProductPerformanceRow {
  productId: string;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface CategoryPerformanceRow {
  category: string;
  skus: number;
  stockUnits: number;
  inventoryCost: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface InventoryValuationRow {
  productId: string;
  name: string;
  sku: string;
  category: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
}

export interface StockMovementReportRow {
  movementId: string;
  dateLabel: string;
  productName: string;
  category: string;
  movementType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
}

export interface SupplierPurchaseRow {
  supplierId: string;
  supplier: string;
  leadTimeDays: number;
  orders: number;
  openOrders: number;
  receivedOrders: number;
  orderedUnits: number;
  receivedUnits: number;
  fulfillmentPct: number;
  totalSpend: number;
}

export interface ForecastEvaluationRow {
  forecastId: string;
  productName: string;
  category: string;
  algorithm: string;
  horizonLabel: string;
  projectedTotal: number;
  trend: string;
  maeDisplay: string;
  maeNumeric: number | null;
  trainTestLabel: string;
  generatedLabel: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toLocalDateKey(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isDateWithinRange(dt: Date | null, dateFrom: string, dateTo: string): boolean {
  if (!dt) return false;
  const key = toLocalDateKey(dt);
  if (dateFrom && key < dateFrom) return false;
  if (dateTo && key > dateTo) return false;
  return true;
}

function getMondayKey(dt: Date): string {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function buildSalesPeriodReport(params: {
  sales: Sale[];
  productLookup: Map<string, Product>;
  filters: ReportFilters;
  granularity: 'daily' | 'weekly' | 'monthly';
}): PeriodSalesRow[] {
  const { sales, productLookup, filters, granularity } = params;
  const map = new Map<
    string,
    { period: string; invoices: number; units: number; revenue: number; cost: number; profit: number }
  >();

  for (const s of sales) {
    const dt = toDate(s.saleDate);
    if (!isDateWithinRange(dt, filters.dateFrom, filters.dateTo) || !dt) continue;

    let key = toLocalDateKey(dt);
    if (granularity === 'weekly') {
      key = getMondayKey(dt);
    } else if (granularity === 'monthly') {
      key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    }

    let rev = 0;
    let cost = 0;
    let units = 0;
    for (const item of s.items ?? []) {
      const prod = productLookup.get(item.productId);
      if (filters.categoryFilter !== 'ALL' && prod?.category !== filters.categoryFilter) continue;
      if (filters.productFilter !== 'ALL' && item.productId !== filters.productFilter) continue;
      const qty = Number(item.quantity || 0);
      rev += Number(item.subtotal || 0);
      cost += Number(item.unitCost || 0) * qty;
      units += qty;
    }
    if (units === 0 && rev === 0) continue;

    const entry = map.get(key) ?? {
      period: key,
      invoices: 0,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    entry.invoices += 1;
    entry.units += units;
    entry.revenue += rev;
    entry.cost += cost;
    entry.profit += rev - cost;
    map.set(key, entry);
  }

  return Array.from(map.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((r) => {
      const revenue = round2(r.revenue);
      const cost = round2(r.cost);
      const profit = round2(r.profit);
      return {
        period: r.period,
        invoices: r.invoices,
        units: r.units,
        revenue,
        cost,
        profit,
        marginPct: revenue > 0 ? round2((profit / revenue) * 100) : 0,
        avgOrderValue: r.invoices > 0 ? round2(revenue / r.invoices) : 0,
      };
    });
}

export function buildProductPerformanceReport(params: {
  sales: Sale[];
  productLookup: Map<string, Product>;
  filters: ReportFilters;
}): ProductPerformanceRow[] {
  const { sales, productLookup, filters } = params;
  const map = new Map<string, ProductPerformanceRow>();

  for (const s of sales) {
    const dt = toDate(s.saleDate);
    if (!isDateWithinRange(dt, filters.dateFrom, filters.dateTo)) continue;

    for (const item of s.items ?? []) {
      const prod = productLookup.get(item.productId);
      if (filters.categoryFilter !== 'ALL' && prod?.category !== filters.categoryFilter) continue;
      if (filters.productFilter !== 'ALL' && item.productId !== filters.productFilter) continue;

      const qty = Number(item.quantity || 0);
      const rev = Number(item.subtotal || 0);
      const cost = Number(item.unitCost || 0) * qty;

      const entry = map.get(item.productId) ?? {
        productId: item.productId,
        name: item.productName,
        sku: prod?.sku || '—',
        category: prod?.category || 'Other',
        currentStock: prod?.quantity ?? 0,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        marginPct: 0,
      };
      entry.units += qty;
      entry.revenue += rev;
      entry.cost += cost;
      entry.profit += rev - cost;
      map.set(item.productId, entry);
    }
  }

  return Array.from(map.values())
    .map((r) => {
      const revenue = round2(r.revenue);
      const cost = round2(r.cost);
      const profit = round2(r.profit);
      return {
        ...r,
        revenue,
        cost,
        profit,
        marginPct: revenue > 0 ? round2((profit / revenue) * 100) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildCategoryPerformanceReport(params: {
  products: Product[];
  sales: Sale[];
  productLookup: Map<string, Product>;
  filters: ReportFilters;
}): CategoryPerformanceRow[] {
  const { products, sales, productLookup, filters } = params;
  const map = new Map<
    string,
    { category: string; skus: number; stockUnits: number; inventoryCost: number; revenue: number; cost: number; profit: number }
  >();

  for (const p of products) {
    if (filters.categoryFilter !== 'ALL' && p.category !== filters.categoryFilter) continue;
    if (filters.productFilter !== 'ALL' && p.productId !== filters.productFilter) continue;
    const entry = map.get(p.category) ?? {
      category: p.category,
      skus: 0,
      stockUnits: 0,
      inventoryCost: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    entry.skus += 1;
    entry.stockUnits += p.quantity;
    entry.inventoryCost += p.quantity * p.purchasePrice;
    map.set(p.category, entry);
  }

  for (const s of sales) {
    const dt = toDate(s.saleDate);
    if (!isDateWithinRange(dt, filters.dateFrom, filters.dateTo)) continue;

    for (const item of s.items ?? []) {
      const prod = productLookup.get(item.productId);
      const cat = prod?.category || 'Other';
      if (filters.categoryFilter !== 'ALL' && cat !== filters.categoryFilter) continue;
      if (filters.productFilter !== 'ALL' && item.productId !== filters.productFilter) continue;

      const qty = Number(item.quantity || 0);
      const rev = Number(item.subtotal || 0);
      const cost = Number(item.unitCost || 0) * qty;

      const entry = map.get(cat) ?? {
        category: cat,
        skus: 0,
        stockUnits: 0,
        inventoryCost: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      entry.revenue += rev;
      entry.cost += cost;
      entry.profit += rev - cost;
      map.set(cat, entry);
    }
  }

  return Array.from(map.values())
    .map((r) => {
      const revenue = round2(r.revenue);
      const cost = round2(r.cost);
      const profit = round2(r.profit);
      return {
        category: r.category,
        skus: r.skus,
        stockUnits: r.stockUnits,
        inventoryCost: round2(r.inventoryCost),
        revenue,
        cost,
        profit,
        marginPct: revenue > 0 ? round2((profit / revenue) * 100) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildInventoryValuationReport(params: {
  products: Product[];
  filters: ReportFilters;
}): InventoryValuationRow[] {
  return params.products
    .filter((p) => (params.filters.categoryFilter === 'ALL' ? true : p.category === params.filters.categoryFilter))
    .filter((p) => (params.filters.productFilter === 'ALL' ? true : p.productId === params.filters.productFilter))
    .map((p) => {
      const costValue = round2(p.quantity * p.purchasePrice);
      const retailValue = round2(p.quantity * p.sellingPrice);
      return {
        productId: p.productId,
        name: p.name,
        sku: p.sku,
        category: p.category,
        qty: p.quantity,
        unitCost: round2(p.purchasePrice),
        unitPrice: round2(p.sellingPrice),
        costValue,
        retailValue,
        potentialProfit: round2(retailValue - costValue),
      };
    })
    .sort((a, b) => b.costValue - a.costValue);
}

export function buildStockMovementReport(params: {
  stockMovements: StockMovement[];
  productLookup: Map<string, Product>;
  filters: ReportFilters;
  timezone?: string;
}): StockMovementReportRow[] {
  const { stockMovements, productLookup, filters, timezone } = params;
  const rows: StockMovementReportRow[] = [];

  for (const m of stockMovements) {
    const dt = toDate(m.createdAt);
    if (!isDateWithinRange(dt, filters.dateFrom, filters.dateTo)) continue;
    const prod = productLookup.get(m.productId);
    const category = prod?.category || 'Other';
    if (filters.categoryFilter !== 'ALL' && category !== filters.categoryFilter) continue;
    if (filters.productFilter !== 'ALL' && m.productId !== filters.productFilter) continue;

    rows.push({
      movementId: m.movementId,
      dateLabel: formatDateTime(m.createdAt, timezone),
      productName: m.productName,
      category,
      movementType: m.movementType,
      quantity: m.quantity,
      previousStock: m.previousStock,
      newStock: m.newStock,
      reason: m.reason,
    });
  }

  return rows;
}

export function buildSupplierPurchaseReport(params: {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  productLookup: Map<string, Product>;
  filters: ReportFilters;
}): SupplierPurchaseRow[] {
  const { purchaseOrders, suppliers, productLookup, filters } = params;
  const supLeadMap = new Map<string, number>();
  suppliers.forEach((s) => supLeadMap.set(s.supplierId, s.leadTimeDays));

  const map = new Map<
    string,
    {
      supplierId: string;
      supplier: string;
      leadTimeDays: number;
      orders: number;
      openOrders: number;
      receivedOrders: number;
      orderedUnits: number;
      receivedUnits: number;
      totalSpend: number;
    }
  >();

  for (const po of purchaseOrders) {
    const dt = toDate(po.orderDate);
    if (!isDateWithinRange(dt, filters.dateFrom, filters.dateTo)) continue;

    let matchingOrdered = 0;
    let matchingReceived = 0;
    let matchingSubtotal = 0;
    let hasMatchingItem = false;

    for (const item of po.items ?? []) {
      const prod = productLookup.get(item.productId);
      if (filters.categoryFilter !== 'ALL' && prod?.category !== filters.categoryFilter) continue;
      if (filters.productFilter !== 'ALL' && item.productId !== filters.productFilter) continue;
      hasMatchingItem = true;
      matchingOrdered += Number(item.orderedQty || 0);
      matchingReceived += Number(item.receivedQty || 0);
      matchingSubtotal += Number(item.subtotal || 0);
    }

    if (!hasMatchingItem) continue;

    const entry = map.get(po.supplierId) ?? {
      supplierId: po.supplierId,
      supplier: po.supplierName,
      leadTimeDays: supLeadMap.get(po.supplierId) ?? 5,
      orders: 0,
      openOrders: 0,
      receivedOrders: 0,
      orderedUnits: 0,
      receivedUnits: 0,
      totalSpend: 0,
    };

    entry.orders += 1;
    if (po.orderStatus === 'Received') {
      entry.receivedOrders += 1;
    } else if (po.orderStatus !== 'Cancelled') {
      entry.openOrders += 1;
    }
    if (po.orderStatus !== 'Cancelled') {
      entry.orderedUnits += matchingOrdered;
      entry.receivedUnits += matchingReceived;
      entry.totalSpend +=
        filters.categoryFilter === 'ALL' && filters.productFilter === 'ALL'
          ? Number(po.totalAmount || 0)
          : matchingSubtotal;
    }
    map.set(po.supplierId, entry);
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      totalSpend: round2(r.totalSpend),
      fulfillmentPct: r.orderedUnits > 0 ? Math.round((r.receivedUnits / r.orderedUnits) * 100) : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export function buildForecastEvaluationReport(params: {
  forecasts: ForecastRecord[];
  productLookup: Map<string, Product>;
  filters: ReportFilters;
  timezone?: string;
}): ForecastEvaluationRow[] {
  const { forecasts, productLookup, filters, timezone } = params;
  const rows: ForecastEvaluationRow[] = [];

  for (const f of forecasts) {
    const dt = toDate(f.generatedAt);
    if (!isDateWithinRange(dt, filters.dateFrom, filters.dateTo)) continue;
    const prod = productLookup.get(f.productId);
    const category = prod?.category || 'Other';
    if (filters.categoryFilter !== 'ALL' && category !== filters.categoryFilter) continue;
    if (filters.productFilter !== 'ALL' && f.productId !== filters.productFilter) continue;

    const projectedTotal = round2(
      (f.predictions ?? []).reduce((s, p) => s + Number(p.predictedQty || 0), 0)
    );
    const maeVal =
      f.evaluationMetrics?.mae !== null && f.evaluationMetrics?.mae !== undefined
        ? f.evaluationMetrics.mae
        : null;

    rows.push({
      forecastId: f.forecastId,
      productName: f.productName,
      category,
      algorithm: f.algorithm.replace(/_/g, ' '),
      horizonLabel: `${f.forecastHorizon}d (${f.aggregation})`,
      projectedTotal,
      trend: f.evaluationMetrics?.trend ?? '—',
      maeDisplay: maeVal !== null ? `${maeVal} units` : 'N/A',
      maeNumeric: maeVal,
      trainTestLabel: `${f.evaluationMetrics?.trainCount ?? 0} / ${f.evaluationMetrics?.testCount ?? 0}`,
      generatedLabel: formatDate(f.generatedAt, timezone),
    });
  }

  return rows;
}
