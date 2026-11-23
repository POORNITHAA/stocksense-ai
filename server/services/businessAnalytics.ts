import { queryOwnerCollection } from '../lib/firebaseAuth.ts';
import {
  aggregateProductSales,
  runDemandForecast,
  type SaleRecord,
} from '../forecasting/engine.ts';

export interface BusinessSnapshot {
  dataSourceFilter: 'all' | 'sample' | 'real';
  generatedAtIso: string;
  totals: {
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
    totalStockUnits: number;
    inventoryValuationInr: number;
    retailValuationInr: number;
    potentialGrossProfitInr: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalSalesCount: number;
    totalRevenueInr: number;
    totalGrossProfitInr: number;
    grossMarginPct: number;
    averageOrderValueInr: number;
    last7DaysRevenueInr: number;
    last30DaysRevenueInr: number;
    last30DaysProfitInr: number;
    currentMonthRevenueInr: number;
    currentMonthProfitInr: number;
    previousMonthRevenueInr: number;
    previousMonthProfitInr: number;
    monthOverMonthRevenueChangePct: number | null;
    pendingPurchaseOrdersCount: number;
    pendingPurchaseOrdersValueInr: number;
  };
  productInventorySummary: Array<{
    productId: string;
    name: string;
    sku: string;
    category: string;
    quantity: number;
    minimumStock: number;
    safetyStock: number;
    purchasePriceInr: number;
    sellingPriceInr: number;
    inventoryValueInr: number;
    unit: string;
    supplierName: string | null;
  }>;
  topValuedProducts: Array<{
    name: string;
    sku: string;
    category: string;
    quantity: number;
    inventoryValueInr: number;
    unit: string;
  }>;
  lowStockProducts: Array<{
    productId: string;
    name: string;
    sku: string;
    category: string;
    quantity: number;
    minimumStock: number;
    safetyStock: number;
    unit: string;
    supplierId: string | null;
    supplierName: string | null;
  }>;
  outOfStockProducts: Array<{
    productId: string;
    name: string;
    sku: string;
    category: string;
    minimumStock: number;
    unit: string;
    supplierId: string | null;
    supplierName: string | null;
  }>;
  topSellingProductsThisMonth: Array<{
    name: string;
    unitsSold: number;
    revenueInr: number;
  }>;
  topSellingProductsAllTime: Array<{
    name: string;
    unitsSold: number;
    revenueInr: number;
  }>;
  categoryPerformance: Array<{
    category: string;
    activeSkuCount: number;
    revenueInr: number;
    profitInr: number;
    unitsSold: number;
    inventoryValueInr: number;
  }>;
  paymentMethodBreakdown: Array<{
    method: string;
    ordersCount: number;
    revenueInr: number;
  }>;
  recentDailySalesTrend: Array<{
    date: string;
    revenueInr: number;
    unitsSold: number;
  }>;
  monthlySalesTrend: Array<{
    month: string;
    revenueInr: number;
    profitInr: number;
    ordersCount: number;
  }>;
  demandPredictions: Array<{
    productId: string;
    productName: string;
    sku: string;
    currentStock: number;
    avgDailySales: number;
    predicted7DayDemand: number;
    predicted30DayDemand: number;
    holdoutMae: number | null;
    trend: 'Increasing' | 'Decreasing' | 'Stable';
    limitedHistory: boolean;
    daysOfStockCover: number | null;
  }>;
  savedForecasts: Array<{
    productName: string;
    algorithm: string;
    aggregation: string;
    horizonDays: number;
    projectedTotalQty: number;
    holdoutMae: number | null;
    trend: string;
  }>;
  reorderAlerts: Array<{
    productId: string;
    productName: string;
    sku: string;
    unit: string;
    currentStock: number;
    minimumStock: number;
    avgDailySales: number;
    leadTimeDays: number;
    expectedLeadTimeDemand: number;
    projected7DayDemand: number;
    safetyStock: number;
    reorderPoint: number;
    targetStock: number;
    suggestedReorderQty: number;
    supplierId: string | null;
    supplierName: string | null;
    unitCostInr: number;
    estimatedOrderCostInr: number;
  }>;
  purchaseOrderSummary: {
    totalCount: number;
    pendingCount: number;
    pendingValueInr: number;
    receivedCount: number;
    cancelledCount: number;
    totalSpendInr: number;
    statusBreakdown: Record<string, number>;
  };
  openPurchaseOrders: Array<{
    poNumber: string;
    supplierName: string;
    orderStatus: string;
    totalAmountInr: number;
    expectedDeliveryDate: string;
    itemCount: number;
    receivedPct: number;
  }>;
  recentPurchaseOrders: Array<{
    poNumber: string;
    supplierName: string;
    orderStatus: string;
    totalAmountInr: number;
    orderDate: string;
    expectedDeliveryDate: string;
  }>;
  supplierSummary: {
    totalSuppliers: number;
    activeSuppliers: number;
    averageLeadTimeDays: number;
  };
  supplierPerformance: Array<{
    supplierId: string;
    company: string;
    contactName: string;
    status: string;
    leadTimeDays: number;
    suppliedProductCount: number;
    totalPurchaseOrders: number;
    openOrders: number;
    completedOrders: number;
    totalOrderValueInr: number;
    fulfillmentRatePct: number | null;
    onTimeDeliveryRatePct: number | null;
  }>;
}

const OPEN_PO_STATUSES = new Set([
  'Draft',
  'Pending',
  'Approved',
  'Ordered',
  'Partially Received',
]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function buildBusinessSnapshot(
  idToken: string,
  ownerId: string,
  dataSourceFilter: 'all' | 'sample' | 'real' = 'all'
): Promise<BusinessSnapshot> {
  const [rawProducts, rawSales, rawOrders, rawSuppliers, rawForecasts] = await Promise.all([
    queryOwnerCollection(idToken, ownerId, 'products', 500),
    queryOwnerCollection(idToken, ownerId, 'sales', 2000),
    queryOwnerCollection(idToken, ownerId, 'purchaseOrders', 200),
    queryOwnerCollection(idToken, ownerId, 'suppliers', 200),
    queryOwnerCollection(idToken, ownerId, 'forecasts', 50),
  ]);

  const filterBySource = <T extends Record<string, unknown>>(list: T[]) =>
    dataSourceFilter === 'all'
      ? list
      : list.filter((item) => item.dataSource === dataSourceFilter);

  const products = filterBySource(rawProducts);
  const sales = filterBySource(rawSales) as unknown as SaleRecord[];
  const orders = filterBySource(rawOrders);
  const suppliers = filterBySource(rawSuppliers);
  const forecasts = filterBySource(rawForecasts);

  const supplierMap = new Map<string, { company: string; leadTimeDays: number }>();
  for (const s of suppliers) {
    if (typeof s.supplierId === 'string') {
      supplierMap.set(s.supplierId, {
        company: String(s.company || 'Unnamed Supplier'),
        leadTimeDays: Number(s.leadTimeDays) || 5,
      });
    }
  }

  let totalStockUnits = 0;
  let inventoryValuationInr = 0;
  let retailValuationInr = 0;
  let activeProducts = 0;
  let inactiveProducts = 0;

  const lowStockProducts: BusinessSnapshot['lowStockProducts'] = [];
  const outOfStockProducts: BusinessSnapshot['outOfStockProducts'] = [];
  const productInventorySummary: BusinessSnapshot['productInventorySummary'] = [];
  const demandCandidates: Array<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    minimumStock: number;
    avgDaily: number;
  }> = [];

  const categoryMap = new Map<
    string,
    {
      activeSkuCount: number;
      revenueInr: number;
      profitInr: number;
      unitsSold: number;
      inventoryValueInr: number;
    }
  >();

  const productCatMap = new Map<string, string>();
  const reorderAlerts: BusinessSnapshot['reorderAlerts'] = [];

  for (const p of products) {
    const qty = Number(p.quantity) || 0;
    const purchasePrice = Number(p.purchasePrice) || 0;
    const sellingPrice = Number(p.sellingPrice) || 0;
    const minStock = Number(p.minimumStock) || 0;
    const safetyStock = Number(p.safetyStock) || 0;
    const category = String(p.category || 'Uncategorized');
    const name = String(p.name || 'Unnamed');
    const sku = String(p.sku || '');
    const unit = String(p.unit || 'pcs');
    const productId = String(p.productId || '');
    const supplierId = typeof p.supplierId === 'string' && p.supplierId ? p.supplierId : null;
    const supInfo = supplierId ? supplierMap.get(supplierId) ?? null : null;
    const isActive = p.isActive !== false;

    if (isActive) activeProducts++;
    else inactiveProducts++;

    productCatMap.set(productId, category);

    totalStockUnits += qty;
    const val = qty * purchasePrice;
    const retailVal = qty * sellingPrice;
    inventoryValuationInr += val;
    retailValuationInr += retailVal;

    const catEntry = categoryMap.get(category) ?? {
      activeSkuCount: 0,
      revenueInr: 0,
      profitInr: 0,
      unitsSold: 0,
      inventoryValueInr: 0,
    };
    if (isActive) catEntry.activeSkuCount++;
    catEntry.inventoryValueInr += val;
    categoryMap.set(category, catEntry);

    if (isActive) {
      productInventorySummary.push({
        productId,
        name,
        sku,
        category,
        quantity: qty,
        minimumStock: minStock,
        safetyStock,
        purchasePriceInr: round2(purchasePrice),
        sellingPriceInr: round2(sellingPrice),
        inventoryValueInr: round2(val),
        unit,
        supplierName: supInfo?.company ?? null,
      });
    }

    if (qty === 0 && isActive) {
      outOfStockProducts.push({
        productId,
        name,
        sku,
        category,
        minimumStock: minStock,
        unit,
        supplierId,
        supplierName: supInfo?.company ?? null,
      });
    } else if (qty > 0 && qty <= minStock && isActive) {
      lowStockProducts.push({
        productId,
        name,
        sku,
        category,
        quantity: qty,
        minimumStock: minStock,
        safetyStock,
        unit,
        supplierId,
        supplierName: supInfo?.company ?? null,
      });
    }

    if (isActive) {
      const series = aggregateProductSales(sales, productId, 'daily');
      const last30 = series.slice(-30);
      const avgDaily =
        last30.length > 0
          ? last30.reduce((a, b) => a + b.actualQty, 0) / last30.length
          : 0;
      const leadDays = supInfo?.leadTimeDays ?? 5;
      const expectedLeadDemand = avgDaily * leadDays;
      const reorderPoint = expectedLeadDemand + safetyStock;
      const targetStock = Math.max(
        Math.ceil(reorderPoint + avgDaily * 7),
        Math.ceil(minStock * 2)
      );
      const triggerThreshold = Math.max(reorderPoint, minStock);
      const suggestedQty = qty <= triggerThreshold ? Math.max(0, Math.ceil(targetStock - qty)) : 0;

      demandCandidates.push({
        productId,
        name,
        sku,
        quantity: qty,
        minimumStock: minStock,
        avgDaily,
      });

      if (suggestedQty > 0 || qty <= minStock) {
        reorderAlerts.push({
          productId,
          productName: name,
          sku,
          unit,
          currentStock: qty,
          minimumStock: minStock,
          avgDailySales: round2(avgDaily),
          leadTimeDays: leadDays,
          expectedLeadTimeDemand: round2(expectedLeadDemand),
          projected7DayDemand: Math.round(avgDaily * 7 * 10) / 10,
          safetyStock,
          reorderPoint: round2(reorderPoint),
          targetStock,
          suggestedReorderQty: suggestedQty,
          supplierId,
          supplierName: supInfo?.company ?? null,
          unitCostInr: round2(purchasePrice),
          estimatedOrderCostInr: round2(suggestedQty * purchasePrice),
        });
      }
    }
  }

  // Compute deterministic 30-day WMA demand outlook for top velocity & low-stock SKUs
  const rankedDemandCandidates = [...demandCandidates]
    .sort((a, b) => {
      const aUrgent = a.quantity <= a.minimumStock ? 1 : 0;
      const bUrgent = b.quantity <= b.minimumStock ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      return b.avgDaily - a.avgDaily;
    })
    .slice(0, 15);

  const demandPredictions: BusinessSnapshot['demandPredictions'] = rankedDemandCandidates.map(
    (c) => {
      const fc = runDemandForecast({
        productId: c.productId,
        sales,
        algorithm: 'WEIGHTED_MOVING_AVERAGE',
        aggregation: 'daily',
        horizonDays: 30,
        windowSize: 7,
      });
      const predicted7DayDemand = round2(
        fc.predictions.slice(0, 7).reduce((s, p) => s + p.predictedQty, 0)
      );
      const predicted30DayDemand = round2(
        fc.predictions.reduce((s, p) => s + p.predictedQty, 0)
      );
      const daysOfStockCover =
        c.avgDaily > 0 ? Math.round((c.quantity / c.avgDaily) * 10) / 10 : null;

      return {
        productId: c.productId,
        productName: c.name,
        sku: c.sku,
        currentStock: c.quantity,
        avgDailySales: round2(c.avgDaily),
        predicted7DayDemand,
        predicted30DayDemand,
        holdoutMae: fc.evaluationMetrics.mae,
        trend: fc.evaluationMetrics.trend,
        limitedHistory: fc.evaluationMetrics.limitedHistory,
        daysOfStockCover,
      };
    }
  );

  // Saved forecasts from Firestore
  const savedForecasts: BusinessSnapshot['savedForecasts'] = forecasts
    .sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')))
    .slice(0, 15)
    .map((f) => {
      const preds = Array.isArray(f.predictions)
        ? (f.predictions as Array<{ predictedQty?: number }>)
        : [];
      const projectedTotalQty = round2(
        preds.reduce((s, p) => s + (Number(p.predictedQty) || 0), 0)
      );
      const metrics = (f.evaluationMetrics ?? {}) as Record<string, unknown>;
      return {
        productName: String(f.productName || 'Unknown'),
        algorithm: String(f.algorithm || 'MOVING_AVERAGE'),
        aggregation: String(f.aggregation || 'daily'),
        horizonDays: Number(f.forecastHorizon) || 30,
        projectedTotalQty,
        holdoutMae: typeof metrics.mae === 'number' ? metrics.mae : null,
        trend: String(metrics.trend || 'Stable'),
      };
    });

  // Sales performance & trends
  const now = new Date();
  const nowMs = now.getTime();
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthKey = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;

  let totalRevenueInr = 0;
  let totalGrossProfitInr = 0;
  let currentMonthRevenueInr = 0;
  let currentMonthProfitInr = 0;
  let previousMonthRevenueInr = 0;
  let previousMonthProfitInr = 0;
  let last7DaysRevenueInr = 0;
  let last30DaysRevenueInr = 0;
  let last30DaysProfitInr = 0;

  const productMonthSales = new Map<string, { name: string; unitsSold: number; revenueInr: number }>();
  const productAllTimeSales = new Map<string, { name: string; unitsSold: number; revenueInr: number }>();
  const dailyMap = new Map<string, { revenueInr: number; unitsSold: number }>();
  const monthlyMap = new Map<string, { revenueInr: number; profitInr: number; ordersCount: number }>();
  const paymentMap = new Map<string, { ordersCount: number; revenueInr: number }>();

  for (const s of sales) {
    const rev = Number(s.totalAmount) || 0;
    const prof = Number(s.totalProfit) || 0;
    const method = String((s as unknown as Record<string, unknown>).paymentMethod || 'Cash');

    totalRevenueInr += rev;
    totalGrossProfitInr += prof;

    const pmEntry = paymentMap.get(method) ?? { ordersCount: 0, revenueInr: 0 };
    pmEntry.ordersCount += 1;
    pmEntry.revenueInr += rev;
    paymentMap.set(method, pmEntry);

    const dt = new Date(s.saleDate);
    if (!Number.isNaN(dt.getTime())) {
      const monthKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      const dayKey = dt.toISOString().slice(0, 10);
      const ageMs = nowMs - dt.getTime();

      if (ageMs >= 0 && ageMs <= ms7d) last7DaysRevenueInr += rev;
      if (ageMs >= 0 && ageMs <= ms30d) {
        last30DaysRevenueInr += rev;
        last30DaysProfitInr += prof;
      }

      if (monthKey === currentMonthKey) {
        currentMonthRevenueInr += rev;
        currentMonthProfitInr += prof;
      }
      if (monthKey === prevMonthKey) {
        previousMonthRevenueInr += rev;
        previousMonthProfitInr += prof;
      }

      const mEntry = monthlyMap.get(monthKey) ?? { revenueInr: 0, profitInr: 0, ordersCount: 0 };
      mEntry.revenueInr += rev;
      mEntry.profitInr += prof;
      mEntry.ordersCount += 1;
      monthlyMap.set(monthKey, mEntry);

      const dEntry = dailyMap.get(dayKey) ?? { revenueInr: 0, unitsSold: 0 };
      dEntry.revenueInr += rev;

      if (Array.isArray(s.items)) {
        for (const item of s.items) {
          const itemQty = Number(item.quantity) || 0;
          const itemRev = Number(item.subtotal) || 0;
          const itemCost = (Number(item.unitCost) || 0) * itemQty;
          dEntry.unitsSold += itemQty;

          const cat = productCatMap.get(item.productId) ?? 'Other';
          const cEntry = categoryMap.get(cat) ?? {
            activeSkuCount: 0,
            revenueInr: 0,
            profitInr: 0,
            unitsSold: 0,
            inventoryValueInr: 0,
          };
          cEntry.revenueInr += itemRev;
          cEntry.profitInr += itemRev - itemCost;
          cEntry.unitsSold += itemQty;
          categoryMap.set(cat, cEntry);

          const allEntry = productAllTimeSales.get(item.productId) ?? {
            name: item.productName,
            unitsSold: 0,
            revenueInr: 0,
          };
          allEntry.unitsSold += itemQty;
          allEntry.revenueInr += itemRev;
          productAllTimeSales.set(item.productId, allEntry);

          if (monthKey === currentMonthKey) {
            const pEntry = productMonthSales.get(item.productId) ?? {
              name: item.productName,
              unitsSold: 0,
              revenueInr: 0,
            };
            pEntry.unitsSold += itemQty;
            pEntry.revenueInr += itemRev;
            productMonthSales.set(item.productId, pEntry);
          }
        }
      }
      dailyMap.set(dayKey, dEntry);
    }
  }

  // Purchase orders & Supplier performance
  const statusBreakdown: Record<string, number> = {};
  let pendingPurchaseOrdersCount = 0;
  let pendingPurchaseOrdersValueInr = 0;
  let receivedCount = 0;
  let cancelledCount = 0;
  let totalPoSpendInr = 0;

  const openPurchaseOrders: BusinessSnapshot['openPurchaseOrders'] = [];
  const recentPurchaseOrders: BusinessSnapshot['recentPurchaseOrders'] = [];

  const supStatsMap = new Map<
    string,
    {
      totalPurchaseOrders: number;
      openOrders: number;
      completedOrders: number;
      totalOrderValueInr: number;
      orderedQty: number;
      receivedQty: number;
      onTimeDeliveries: number;
      timedDeliveries: number;
    }
  >();

  const sortedOrders = [...orders].sort((a, b) =>
    String(b.orderDate || '').localeCompare(String(a.orderDate || ''))
  );

  for (const o of sortedOrders) {
    const status = String(o.orderStatus || 'Pending');
    const amount = Number(o.totalAmount) || 0;
    const poNumber = String(o.poNumber || o.purchaseOrderId || '');
    const supId = String(o.supplierId || '');
    const supName = String(o.supplierName || supplierMap.get(supId)?.company || 'Supplier');
    const items = Array.isArray(o.items)
      ? (o.items as Array<{ orderedQty?: number; receivedQty?: number }>)
      : [];

    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;
    if (status !== 'Cancelled') totalPoSpendInr += amount;
    if (status === 'Received') receivedCount++;
    if (status === 'Cancelled') cancelledCount++;

    let totalOrdQty = 0;
    let totalRecQty = 0;
    for (const it of items) {
      totalOrdQty += Number(it.orderedQty) || 0;
      totalRecQty += Number(it.receivedQty) || 0;
    }
    const receivedPct = totalOrdQty > 0 ? Math.round((totalRecQty / totalOrdQty) * 100) : 0;

    if (OPEN_PO_STATUSES.has(status)) {
      pendingPurchaseOrdersCount++;
      pendingPurchaseOrdersValueInr += amount;
      if (openPurchaseOrders.length < 15) {
        openPurchaseOrders.push({
          poNumber,
          supplierName: supName,
          orderStatus: status,
          totalAmountInr: round2(amount),
          expectedDeliveryDate: String(o.expectedDeliveryDate || '').slice(0, 10),
          itemCount: items.length,
          receivedPct,
        });
      }
    }

    if (recentPurchaseOrders.length < 10) {
      recentPurchaseOrders.push({
        poNumber,
        supplierName: supName,
        orderStatus: status,
        totalAmountInr: round2(amount),
        orderDate: String(o.orderDate || '').slice(0, 10),
        expectedDeliveryDate: String(o.expectedDeliveryDate || '').slice(0, 10),
      });
    }

    if (supId) {
      const st = supStatsMap.get(supId) ?? {
        totalPurchaseOrders: 0,
        openOrders: 0,
        completedOrders: 0,
        totalOrderValueInr: 0,
        orderedQty: 0,
        receivedQty: 0,
        onTimeDeliveries: 0,
        timedDeliveries: 0,
      };
      st.totalPurchaseOrders += 1;
      if (OPEN_PO_STATUSES.has(status)) st.openOrders += 1;
      if (status === 'Received') st.completedOrders += 1;
      if (status !== 'Cancelled') {
        st.totalOrderValueInr += amount;
        st.orderedQty += totalOrdQty;
        st.receivedQty += totalRecQty;
      }
      if (status === 'Received' && o.receivedDate && o.expectedDeliveryDate) {
        const recMs = new Date(String(o.receivedDate)).getTime();
        const etaMs = new Date(String(o.expectedDeliveryDate)).getTime();
        if (!Number.isNaN(recMs) && !Number.isNaN(etaMs)) {
          st.timedDeliveries += 1;
          if (recMs <= etaMs + 24 * 60 * 60 * 1000) st.onTimeDeliveries += 1;
        }
      }
      supStatsMap.set(supId, st);
    }
  }

  let activeSuppliers = 0;
  let totalLeadSum = 0;
  const supplierPerformance: BusinessSnapshot['supplierPerformance'] = suppliers.map((s) => {
    const sid = String(s.supplierId || '');
    const status = String(s.status || 'active');
    const leadTimeDays = Number(s.leadTimeDays) || 5;
    if (status === 'active') activeSuppliers++;
    totalLeadSum += leadTimeDays;

    const st = supStatsMap.get(sid);
    const suppliedProducts = Array.isArray(s.suppliedProducts) ? s.suppliedProducts.length : 0;
    return {
      supplierId: sid,
      company: String(s.company || 'Unnamed'),
      contactName: String(s.name || ''),
      status,
      leadTimeDays,
      suppliedProductCount: suppliedProducts,
      totalPurchaseOrders: st?.totalPurchaseOrders ?? 0,
      openOrders: st?.openOrders ?? 0,
      completedOrders: st?.completedOrders ?? 0,
      totalOrderValueInr: round2(st?.totalOrderValueInr ?? 0),
      fulfillmentRatePct:
        st && st.orderedQty > 0 ? Math.round((st.receivedQty / st.orderedQty) * 100) : null,
      onTimeDeliveryRatePct:
        st && st.timedDeliveries > 0
          ? Math.round((st.onTimeDeliveries / st.timedDeliveries) * 100)
          : null,
    };
  });

  const topSellingProductsThisMonth = Array.from(productMonthSales.values())
    .sort((a, b) => b.revenueInr - a.revenueInr)
    .slice(0, 10)
    .map((p) => ({
      ...p,
      revenueInr: round2(p.revenueInr),
    }));

  const topSellingProductsAllTime = Array.from(productAllTimeSales.values())
    .sort((a, b) => b.revenueInr - a.revenueInr)
    .slice(0, 10)
    .map((p) => ({
      ...p,
      revenueInr: round2(p.revenueInr),
    }));

  const categoryPerformance = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      activeSkuCount: stats.activeSkuCount,
      revenueInr: round2(stats.revenueInr),
      profitInr: round2(stats.profitInr),
      unitsSold: round2(stats.unitsSold),
      inventoryValueInr: round2(stats.inventoryValueInr),
    }))
    .sort((a, b) => b.revenueInr - a.revenueInr);

  const paymentMethodBreakdown = Array.from(paymentMap.entries())
    .map(([method, stats]) => ({
      method,
      ordersCount: stats.ordersCount,
      revenueInr: round2(stats.revenueInr),
    }))
    .sort((a, b) => b.revenueInr - a.revenueInr);

  const recentDailySalesTrend = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, stats]) => ({
      date,
      revenueInr: round2(stats.revenueInr),
      unitsSold: stats.unitsSold,
    }));

  const monthlySalesTrend = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, stats]) => ({
      month,
      revenueInr: round2(stats.revenueInr),
      profitInr: round2(stats.profitInr),
      ordersCount: stats.ordersCount,
    }));

  const topValuedProducts = [...productInventorySummary]
    .sort((a, b) => b.inventoryValueInr - a.inventoryValueInr)
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      sku: p.sku,
      category: p.category,
      quantity: p.quantity,
      inventoryValueInr: p.inventoryValueInr,
      unit: p.unit,
    }));

  const grossMarginPct =
    totalRevenueInr > 0 ? round2((totalGrossProfitInr / totalRevenueInr) * 100) : 0;
  const averageOrderValueInr =
    sales.length > 0 ? round2(totalRevenueInr / sales.length) : 0;
  const monthOverMonthRevenueChangePct =
    previousMonthRevenueInr > 0
      ? round2(
          ((currentMonthRevenueInr - previousMonthRevenueInr) / previousMonthRevenueInr) * 100
        )
      : null;

  return {
    dataSourceFilter,
    generatedAtIso: new Date().toISOString(),
    totals: {
      totalProducts: products.length,
      activeProducts,
      inactiveProducts,
      totalStockUnits: round2(totalStockUnits),
      inventoryValuationInr: round2(inventoryValuationInr),
      retailValuationInr: round2(retailValuationInr),
      potentialGrossProfitInr: round2(retailValuationInr - inventoryValuationInr),
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
      totalSalesCount: sales.length,
      totalRevenueInr: round2(totalRevenueInr),
      totalGrossProfitInr: round2(totalGrossProfitInr),
      grossMarginPct,
      averageOrderValueInr,
      last7DaysRevenueInr: round2(last7DaysRevenueInr),
      last30DaysRevenueInr: round2(last30DaysRevenueInr),
      last30DaysProfitInr: round2(last30DaysProfitInr),
      currentMonthRevenueInr: round2(currentMonthRevenueInr),
      currentMonthProfitInr: round2(currentMonthProfitInr),
      previousMonthRevenueInr: round2(previousMonthRevenueInr),
      previousMonthProfitInr: round2(previousMonthProfitInr),
      monthOverMonthRevenueChangePct,
      pendingPurchaseOrdersCount,
      pendingPurchaseOrdersValueInr: round2(pendingPurchaseOrdersValueInr),
    },
    productInventorySummary: productInventorySummary
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 60),
    topValuedProducts,
    lowStockProducts: lowStockProducts.slice(0, 25),
    outOfStockProducts: outOfStockProducts.slice(0, 25),
    topSellingProductsThisMonth,
    topSellingProductsAllTime,
    categoryPerformance,
    paymentMethodBreakdown,
    recentDailySalesTrend,
    monthlySalesTrend,
    demandPredictions,
    savedForecasts,
    reorderAlerts: reorderAlerts
      .sort((a, b) => b.suggestedReorderQty - a.suggestedReorderQty)
      .slice(0, 15),
    purchaseOrderSummary: {
      totalCount: orders.length,
      pendingCount: pendingPurchaseOrdersCount,
      pendingValueInr: round2(pendingPurchaseOrdersValueInr),
      receivedCount,
      cancelledCount,
      totalSpendInr: round2(totalPoSpendInr),
      statusBreakdown,
    },
    openPurchaseOrders,
    recentPurchaseOrders,
    supplierSummary: {
      totalSuppliers: suppliers.length,
      activeSuppliers,
      averageLeadTimeDays:
        suppliers.length > 0 ? round2(totalLeadSum / suppliers.length) : 0,
    },
    supplierPerformance: supplierPerformance.sort(
      (a, b) => b.totalOrderValueInr - a.totalOrderValueInr
    ),
  };
}
