import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Download,
  FileText,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  deleteNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/notificationService';
import {
  exportToCsv,
  exportToPdf,
  formatDateTime,
  formatINR,
  formatNumber,
} from '../utils/format';
import {
  buildCategoryPerformanceReport,
  buildForecastEvaluationReport,
  buildInventoryValuationReport,
  buildProductPerformanceReport,
  buildSalesPeriodReport,
  buildStockMovementReport,
  buildSupplierPurchaseReport,
  toLocalDateKey,
  type ReportFilters,
} from '../utils/reports';
import { StatusLabel } from '../components/common/StatusLabel';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';

type ReportTab =
  | 'daily-sales'
  | 'weekly-sales'
  | 'monthly-revenue'
  | 'gross-profit'
  | 'product-performance'
  | 'category-performance'
  | 'inventory-valuation'
  | 'stock-movement'
  | 'supplier-purchases'
  | 'forecast-evaluation'
  | 'notifications';

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'daily-sales', label: 'Daily Sales' },
  { id: 'weekly-sales', label: 'Weekly Sales' },
  { id: 'monthly-revenue', label: 'Monthly Revenue' },
  { id: 'gross-profit', label: 'Gross Profit' },
  { id: 'product-performance', label: 'Product Performance' },
  { id: 'category-performance', label: 'Category Performance' },
  { id: 'inventory-valuation', label: 'Inventory Valuation' },
  { id: 'stock-movement', label: 'Stock Movements' },
  { id: 'supplier-purchases', label: 'Supplier Purchases' },
  { id: 'forecast-evaluation', label: 'Forecast Evaluation' },
  { id: 'notifications', label: 'Notification Center' },
];

const VALID_TABS = new Set<ReportTab>(REPORT_TABS.map((t) => t.id));

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  return {
    from: toLocalDateKey(from),
    to: toLocalDateKey(to),
  };
}

export function AnalyticsPage() {
  const { firebaseUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const primarySeriesColor = isDark ? '#cbd5e1' : '#0f172a';
  const tickStyle = { fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' };
  const tooltipStyle = isDark
    ? { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.5rem', fontSize: '12px' }
    : { borderRadius: '0.5rem', fontSize: '12px' };
  const {
    loadingData,
    products,
    sales,
    stockMovements,
    purchaseOrders,
    suppliers,
    forecasts,
    notifications,
    unreadNotificationCount,
    dataSourceFilter,
    settings,
  } = useData();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialParam = searchParams.get('tab') as ReportTab | null;
  const [tab, setTab] = useState<ReportTab>(
    initialParam && VALID_TABS.has(initialParam) ? initialParam : 'daily-sales'
  );

  useEffect(() => {
    const paramTab = searchParams.get('tab') as ReportTab | null;
    if (paramTab && VALID_TABS.has(paramTab) && paramTab !== tab) {
      setTab(paramTab);
    }
  }, [searchParams, tab]);

  const selectTab = (next: ReportTab) => {
    setTab(next);
    setSearchParams(next === 'daily-sales' ? {} : { tab: next }, { replace: true });
  };

  const defaults = useMemo(() => defaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [notifViewFilter, setNotifViewFilter] = useState<'all' | 'unread'>('all');
  const [notifError, setNotifError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const productLookup = useMemo(() => {
    const m = new Map<string, (typeof products)[number]>();
    products.forEach((p) => m.set(p.productId, p));
    return m;
  }, [products]);

  const selectableProducts = useMemo(() => {
    if (categoryFilter === 'ALL') return products;
    return products.filter((p) => p.category === categoryFilter);
  }, [products, categoryFilter]);

  const handleCategoryChange = (nextCategory: string) => {
    setCategoryFilter(nextCategory);
    if (nextCategory !== 'ALL' && productFilter !== 'ALL') {
      const selected = productLookup.get(productFilter);
      if (selected && selected.category !== nextCategory) {
        setProductFilter('ALL');
      }
    }
  };

  const handleResetFilters = () => {
    const d = defaultDateRange();
    setDateFrom(d.from);
    setDateTo(d.to);
    setCategoryFilter('ALL');
    setProductFilter('ALL');
  };

  const filters: ReportFilters = useMemo(
    () => ({ dateFrom, dateTo, categoryFilter, productFilter }),
    [dateFrom, dateTo, categoryFilter, productFilter]
  );

  const dailySalesRows = useMemo(
    () => buildSalesPeriodReport({ sales, productLookup, filters, granularity: 'daily' }),
    [sales, productLookup, filters]
  );

  const weeklySalesRows = useMemo(
    () => buildSalesPeriodReport({ sales, productLookup, filters, granularity: 'weekly' }),
    [sales, productLookup, filters]
  );

  const monthlyRevenueRows = useMemo(
    () => buildSalesPeriodReport({ sales, productLookup, filters, granularity: 'monthly' }),
    [sales, productLookup, filters]
  );

  const productPerfRows = useMemo(
    () => buildProductPerformanceReport({ sales, productLookup, filters }),
    [sales, productLookup, filters]
  );

  const categoryPerfRows = useMemo(
    () => buildCategoryPerformanceReport({ products, sales, productLookup, filters }),
    [products, sales, productLookup, filters]
  );

  const valuationRows = useMemo(
    () => buildInventoryValuationReport({ products, filters }),
    [products, filters]
  );

  const movementRows = useMemo(
    () =>
      buildStockMovementReport({
        stockMovements,
        productLookup,
        filters,
        timezone: settings?.timezone,
      }),
    [stockMovements, productLookup, filters, settings?.timezone]
  );

  const supplierPurchaseRows = useMemo(
    () => buildSupplierPurchaseReport({ purchaseOrders, suppliers, productLookup, filters }),
    [purchaseOrders, suppliers, productLookup, filters]
  );

  const forecastEvalRows = useMemo(
    () =>
      buildForecastEvaluationReport({
        forecasts,
        productLookup,
        filters,
        timezone: settings?.timezone,
      }),
    [forecasts, productLookup, filters, settings?.timezone]
  );

  const movementChartData = useMemo(() => {
    const map = new Map<string, { type: string; entries: number; totalUnits: number }>();
    for (const m of movementRows) {
      const curr = map.get(m.movementType) ?? { type: m.movementType, entries: 0, totalUnits: 0 };
      curr.entries += 1;
      curr.totalUnits += Number(m.quantity || 0);
      map.set(m.movementType, curr);
    }
    return Array.from(map.values());
  }, [movementRows]);

  const kpiSummary = useMemo(() => {
    const revenue = dailySalesRows.reduce((s, r) => s + r.revenue, 0);
    const cost = dailySalesRows.reduce((s, r) => s + r.cost, 0);
    const profit = revenue - cost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    const totalCostVal = valuationRows.reduce((s, r) => s + r.costValue, 0);
    const totalRetailVal = valuationRows.reduce((s, r) => s + r.retailValue, 0);
    const totalPoSpend = supplierPurchaseRows.reduce((s, r) => s + r.totalSpend, 0);
    return {
      revenue,
      profit,
      marginPct,
      totalCostVal,
      totalRetailVal,
      totalPoSpend,
      totalInvoices: dailySalesRows.reduce((s, r) => s + r.invoices, 0),
    };
  }, [dailySalesRows, valuationRows, supplierPurchaseRows]);

  const visibleNotifications = useMemo(() => {
    return notifViewFilter === 'unread'
      ? notifications.filter((n) => !n.isRead)
      : notifications;
  }, [notifications, notifViewFilter]);

  const getActiveExportData = (): {
    title: string;
    headers: string[];
    rows: Array<Array<string | number>>;
  } => {
    if (tab === 'daily-sales') {
      return {
        title: 'Daily Sales Report',
        headers: ['Date', 'Invoices', 'Units Sold', 'Revenue (INR)', 'Cost (INR)', 'Gross Profit (INR)', 'Margin %'],
        rows: dailySalesRows.map((r) => [
          r.period,
          r.invoices,
          r.units,
          r.revenue,
          r.cost,
          r.profit,
          `${r.marginPct}%`,
        ]),
      };
    }
    if (tab === 'weekly-sales') {
      return {
        title: 'Weekly Sales Report',
        headers: ['Week Starting', 'Invoices', 'Units Sold', 'Revenue (INR)', 'Cost (INR)', 'Gross Profit (INR)', 'Margin %'],
        rows: weeklySalesRows.map((r) => [
          r.period,
          r.invoices,
          r.units,
          r.revenue,
          r.cost,
          r.profit,
          `${r.marginPct}%`,
        ]),
      };
    }
    if (tab === 'monthly-revenue') {
      return {
        title: 'Monthly Revenue Report',
        headers: ['Month', 'Invoices', 'Units Sold', 'Revenue (INR)', 'Avg Order (INR)', 'Gross Profit (INR)', 'Margin %'],
        rows: monthlyRevenueRows.map((r) => [
          r.period,
          r.invoices,
          r.units,
          r.revenue,
          r.avgOrderValue,
          r.profit,
          `${r.marginPct}%`,
        ]),
      };
    }
    if (tab === 'gross-profit') {
      return {
        title: 'Gross Profit & Margin Report',
        headers: ['Product', 'SKU', 'Category', 'Units Sold', 'Revenue (INR)', 'COGS (INR)', 'Gross Profit (INR)', 'Margin %'],
        rows: productPerfRows.map((r) => [
          r.name,
          r.sku,
          r.category,
          r.units,
          r.revenue,
          r.cost,
          r.profit,
          `${r.marginPct}%`,
        ]),
      };
    }
    if (tab === 'product-performance') {
      return {
        title: 'Product Performance Report',
        headers: ['Product', 'SKU', 'Category', 'Current Stock', 'Units Sold', 'Revenue (INR)', 'Gross Profit (INR)', 'Margin %'],
        rows: productPerfRows.map((r) => [
          r.name,
          r.sku,
          r.category,
          r.currentStock,
          r.units,
          r.revenue,
          r.profit,
          `${r.marginPct}%`,
        ]),
      };
    }
    if (tab === 'category-performance') {
      return {
        title: 'Category-Wise Performance Report',
        headers: ['Category', 'SKUs', 'Stock Units', 'Inventory Cost (INR)', 'Revenue (INR)', 'Gross Profit (INR)', 'Margin %'],
        rows: categoryPerfRows.map((r) => [
          r.category,
          r.skus,
          r.stockUnits,
          r.inventoryCost,
          r.revenue,
          r.profit,
          `${r.marginPct}%`,
        ]),
      };
    }
    if (tab === 'inventory-valuation') {
      return {
        title: 'Inventory Valuation Report',
        headers: ['Product', 'SKU', 'Category', 'Stock Qty', 'Unit Cost (INR)', 'Cost Value (INR)', 'Retail Value (INR)', 'Potential Profit (INR)'],
        rows: valuationRows.map((r) => [
          r.name,
          r.sku,
          r.category,
          r.qty,
          r.unitCost,
          r.costValue,
          r.retailValue,
          r.potentialProfit,
        ]),
      };
    }
    if (tab === 'stock-movement') {
      return {
        title: 'Stock Movement Report',
        headers: ['Date', 'Product', 'Category', 'Type', 'Qty', 'Before', 'After', 'Reason'],
        rows: movementRows.slice(0, 300).map((m) => [
          m.dateLabel,
          m.productName,
          m.category,
          m.movementType,
          m.quantity,
          m.previousStock,
          m.newStock,
          m.reason,
        ]),
      };
    }
    if (tab === 'supplier-purchases') {
      return {
        title: 'Supplier Purchase Report',
        headers: ['Supplier', 'Lead Time (d)', 'Total POs', 'Open POs', 'Received POs', 'Ordered Units', 'Received Units', 'Fulfillment %', 'Total Spend (INR)'],
        rows: supplierPurchaseRows.map((r) => [
          r.supplier,
          r.leadTimeDays,
          r.orders,
          r.openOrders,
          r.receivedOrders,
          r.orderedUnits,
          r.receivedUnits,
          `${r.fulfillmentPct}%`,
          r.totalSpend,
        ]),
      };
    }
    if (tab === 'forecast-evaluation') {
      return {
        title: 'Forecast Evaluation Report',
        headers: ['Product', 'Category', 'Algorithm', 'Horizon', 'Projected Qty', 'Trend', 'Holdout MAE', 'Train/Test', 'Generated'],
        rows: forecastEvalRows.map((f) => [
          f.productName,
          f.category,
          f.algorithm,
          f.horizonLabel,
          f.projectedTotal,
          f.trend,
          f.maeDisplay,
          f.trainTestLabel,
          f.generatedLabel,
        ]),
      };
    }
    return {
      title: 'Operational Notifications Log',
      headers: ['Type', 'Title', 'Message', 'Status', 'Created'],
      rows: visibleNotifications.map((n) => [
        n.notificationType,
        n.title,
        n.message,
        n.isRead ? 'Read' : 'Unread',
        formatDateTime(n.createdAt, settings?.timezone),
      ]),
    };
  };

  const handleDownloadCsv = () => {
    const data = getActiveExportData();
    exportToCsv(`stocksense-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, data.headers, data.rows);
  };

  const handleDownloadPdf = () => {
    const data = getActiveExportData();
    exportToPdf({
      title: data.title,
      subtitle: `${settings?.storeName || 'StockSense AI'} | Scope: ${dataSourceFilter} | Range: ${dateFrom} to ${dateTo}`,
      filename: `stocksense-${tab}-${new Date().toISOString().slice(0, 10)}.pdf`,
      headers: data.headers,
      rows: data.rows,
      summaryLines: [
        `Filtered Revenue: INR ${formatNumber(Math.round(kpiSummary.revenue))} | Gross Profit: INR ${formatNumber(Math.round(kpiSummary.profit))} (${kpiSummary.marginPct.toFixed(1)}%)`,
        `Inventory Cost Valuation: INR ${formatNumber(Math.round(kpiSummary.totalCostVal))} | Retail Valuation: INR ${formatNumber(Math.round(kpiSummary.totalRetailVal))}`,
      ],
    });
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser) return;
    setNotifError(null);
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.notificationId);
    try {
      await markAllNotificationsAsRead(firebaseUser.uid, unreadIds);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : 'Unable to mark notifications as read.');
    }
  };

  const handleMarkSingleRead = async (notificationId: string) => {
    setNotifError(null);
    try {
      await markNotificationAsRead(notificationId);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : 'Unable to mark notification as read.');
    }
  };

  const handleDismissNotification = async (notificationId: string) => {
    setNotifError(null);
    try {
      await deleteNotification(notificationId);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : 'Unable to dismiss notification.');
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
            Analytics &amp; Reports
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live Firestore operational reports, interactive Recharts visualizations, CSV/PDF export, and alert management ({dataSourceFilter} data)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-teal-600 text-white rounded-lg hover:opacity-90"
          >
            <FileText className="w-3.5 h-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Filtered Sales Revenue</div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {formatINR(kpiSummary.revenue, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {kpiSummary.totalInvoices} invoices in range
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Filtered Gross Profit</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {formatINR(kpiSummary.profit, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Gross margin: {kpiSummary.marginPct.toFixed(1)}%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Inventory Valuation (Cost)</div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {formatINR(kpiSummary.totalCostVal, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Retail value: {formatINR(kpiSummary.totalRetailVal, 0)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Supplier Procurement Spend</div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {formatINR(kpiSummary.totalPoSpend, 0)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Across {supplierPurchaseRows.length} active suppliers
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">From:</span>
          <input
            type="date"
            aria-label="Date from"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">To:</span>
          <input
            type="date"
            aria-label="Date to"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>

        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by product"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg max-w-[230px]"
        >
          <option value="ALL">All Products</option>
          {selectableProducts.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleResetFilters}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-slate-900 text-white dark:bg-teal-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.id === 'notifications' && <Bell className="w-3.5 h-3.5" />}
            <span>{t.label}</span>
            {t.id === 'notifications' && unreadNotificationCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-red-600 text-white font-semibold">
                {unreadNotificationCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Report Visualizations */}
      {(tab === 'daily-sales' || tab === 'weekly-sales' || tab === 'monthly-revenue') && (() => {
        const periodData = (tab === 'daily-sales'
          ? dailySalesRows
          : tab === 'weekly-sales'
          ? weeklySalesRows
          : monthlyRevenueRows
        ).slice(-30);
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold">
              {tab === 'daily-sales'
                ? 'Daily Sales & Gross Profit'
                : tab === 'weekly-sales'
                ? 'Weekly Sales & Gross Profit'
                : 'Monthly Revenue & Gross Profit'}
            </h2>
            <div className="h-72">
              {periodData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={periodData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="period" tick={tickStyle} />
                    <YAxis tick={tickStyle} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v ?? 0), 0)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue (INR)" fill={primarySeriesColor} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Gross Profit (INR)" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  No sales data matches the selected filters.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {tab === 'gross-profit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Revenue vs Cost (COGS) &amp; Gross Profit Trend</h2>
          <div className="h-72">
            {dailySalesRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySalesRows.slice(-30)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="period" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v ?? 0), 0)} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue (INR)"
                    stroke={primarySeriesColor}
                    fill={primarySeriesColor}
                    fillOpacity={0.12}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    name="COGS (INR)"
                    stroke="#d97706"
                    fill="#d97706"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Gross Profit (INR)"
                    stroke="#0d9488"
                    fill="#0d9488"
                    fillOpacity={0.22}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No profit data matches the selected filters.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'product-performance' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Top Products by Revenue &amp; Profit</h2>
          <div className="h-72">
            {productPerfRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productPerfRows.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="sku" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v ?? 0), 0)} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue (INR)" fill={primarySeriesColor} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Gross Profit (INR)" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No product performance data matches the selected filters.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'category-performance' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Category Revenue vs Inventory Cost Value</h2>
          <div className="h-72">
            {categoryPerfRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryPerfRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="category" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v ?? 0), 0)} />
                  <Legend />
                  <Bar dataKey="revenue" name="Sales Revenue (INR)" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="inventoryCost" name="Inventory Cost (INR)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No category performance data matches the selected filters.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'inventory-valuation' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Top 10 Valued SKUs (Cost vs Retail Value)</h2>
          <div className="h-72">
            {valuationRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valuationRows.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="sku" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v ?? 0), 0)} />
                  <Legend />
                  <Bar dataKey="costValue" name="Cost Valuation (INR)" fill={primarySeriesColor} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="retailValue" name="Retail Valuation (INR)" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No inventory items match the selected filters.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'stock-movement' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Stock Movement Volume by Operation Type</h2>
          <div className="h-64">
            {movementChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movementChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="type" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="totalUnits" name="Units Moved" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="entries" name="Ledger Entries" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No stock movements match the selected filters.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'supplier-purchases' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Supplier Procurement Spend (INR)</h2>
          <div className="h-64">
            {supplierPurchaseRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierPurchaseRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="supplier" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v ?? 0), 0)} />
                  <Legend />
                  <Bar dataKey="totalSpend" name="Total Spend (INR)" fill={primarySeriesColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No supplier purchase records match the selected filters.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'forecast-evaluation' && (() => {
        const forecastEvalChartData = forecastEvalRows
          .filter((f) => f.maeNumeric !== null)
          .slice(0, 12)
          .map((f) => ({
            label: `${f.productName.slice(0, 14)} (${f.algorithm.slice(0, 3)})`,
            mae: f.maeNumeric,
          }));
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold">Saved Forecast Holdout MAE Comparison</h2>
            <div className="h-64">
              {forecastEvalChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastEvalChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="label" tick={tickStyle} />
                    <YAxis tick={tickStyle} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="mae" name="Holdout MAE (Units)" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Save forecasts with sufficient holdout history to compare model MAE here.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Notification Center Full Panel OR Data Table */}
      {tab === 'notifications' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Notification Center</span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setNotifViewFilter('all')}
                  className={`px-2.5 py-1 rounded ${
                    notifViewFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  All ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifViewFilter('unread')}
                  className={`px-2.5 py-1 rounded ${
                    notifViewFilter === 'unread'
                      ? 'bg-white dark:bg-slate-900 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  Unread ({unreadNotificationCount})
                </button>
              </div>
            </div>

            {unreadNotificationCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark All Read
              </button>
            )}
          </div>

          {notifError && (
            <div className="px-5 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {notifError}
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleNotifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {notifViewFilter === 'unread'
                  ? 'No unread notifications.'
                  : 'No operational alerts recorded yet.'}
              </div>
            ) : (
              visibleNotifications.map((n) => (
                <div
                  key={n.notificationId}
                  className={`px-5 py-3.5 flex flex-wrap items-start justify-between gap-4 text-xs ${
                    n.isRead ? 'opacity-75' : 'bg-sky-50/40 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusLabel
                        label={n.notificationType.replace(/_/g, ' ')}
                        tone={
                          n.notificationType === 'OUT_OF_STOCK'
                            ? 'critical'
                            : n.notificationType === 'LOW_STOCK' || n.notificationType === 'REORDER'
                            ? 'warning'
                            : 'info'
                        }
                      />
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">
                        {n.title}
                      </span>
                      {!n.isRead && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 rounded">
                          Unread
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{n.message}</p>
                    <div className="text-[11px] text-slate-400">
                      {formatDateTime(n.createdAt, settings?.timezone)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={() => void handleMarkSingleRead(n.notificationId)}
                        className="px-2.5 py-1.5 rounded-lg border border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 font-medium hover:bg-teal-50 dark:hover:bg-teal-950/40"
                      >
                        Mark as Read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDismissNotification(n.notificationId)}
                      title="Dismiss notification"
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[520px]">
            {(() => {
              const { headers, rows } = getActiveExportData();
              return (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="py-3 px-4 font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        {row.map((cell, cidx) => (
                          <td
                            key={cidx}
                            className={`py-2.5 px-4 whitespace-nowrap ${
                              typeof cell === 'number' ? 'font-mono tabular-nums' : ''
                            }`}
                          >
                            {typeof cell === 'number' && headers[cidx]?.includes('(INR)')
                              ? formatINR(cell)
                              : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={headers.length} className="py-10 text-center text-slate-500">
                          No records match the current report filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
