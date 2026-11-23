import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  ClipboardList,
  IndianRupee,
  Package,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { authorizedPost } from '../lib/api';
import { formatDate, formatINR, formatNumber, toDate } from '../utils/format';
import { StatusLabel } from '../components/common/StatusLabel';
import type { DataSourceFilter } from '../types';

export function DashboardPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const primarySeriesColor = isDark ? '#cbd5e1' : '#0f172a';
  const chartColors = ['#0d9488', '#2563eb', isDark ? '#38bdf8' : '#0f172a', '#d97706', '#64748b'];
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
    forecasts,
    dataSourceFilter,
    setDataSourceFilter,
    settings,
  } = useData();

  const [dateRangeDays, setDateRangeDays] = useState<7 | 30 | 90>(30);
  const [trendGranularity, setTrendGranularity] = useState<'daily' | 'monthly'>('daily');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const filteredSalesByDate = useMemo(() => {
    const cutoff = Date.now() - dateRangeDays * 24 * 60 * 60 * 1000;
    return sales.filter((s) => {
      const dt = toDate(s.saleDate);
      return dt ? dt.getTime() >= cutoff : false;
    });
  }, [sales, dateRangeDays]);

  const kpis = useMemo(() => {
    const totalProducts = products.length;
    const totalStockUnits = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
    const totalInventoryValue = products.reduce(
      (sum, p) => sum + Number(p.quantity || 0) * Number(p.purchasePrice || 0),
      0
    );
    const totalSalesRevenue = filteredSalesByDate.reduce(
      (sum, s) => sum + Number(s.totalAmount || 0),
      0
    );
    const estimatedGrossProfit = filteredSalesByDate.reduce(
      (sum, s) => sum + Number(s.totalProfit || 0),
      0
    );
    const lowStockProducts = products.filter(
      (p) => p.isActive && p.quantity > 0 && p.quantity <= p.minimumStock
    );
    const outOfStockProducts = products.filter((p) => p.isActive && p.quantity === 0);
    const pendingPurchaseOrders = purchaseOrders.filter((po) =>
      ['Draft', 'Pending', 'Approved', 'Ordered', 'Partially Received'].includes(po.orderStatus)
    );

    return {
      totalProducts,
      totalStockUnits,
      totalInventoryValue,
      totalSalesRevenue,
      estimatedGrossProfit,
      lowStockProducts,
      outOfStockProducts,
      pendingPurchaseOrders,
    };
  }, [products, filteredSalesByDate, purchaseOrders]);

  const salesTrendData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; profit: number; units: number }>();
    const sorted = [...filteredSalesByDate].sort(
      (a, b) => (toDate(a.saleDate)?.getTime() ?? 0) - (toDate(b.saleDate)?.getTime() ?? 0)
    );

    for (const s of sorted) {
      const dt = toDate(s.saleDate);
      if (!dt) continue;
      const key =
        trendGranularity === 'daily'
          ? dt.toISOString().slice(0, 10)
          : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label =
        trendGranularity === 'daily'
          ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
          : dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

      const units = (s.items ?? []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
      const curr = map.get(key) ?? { label, revenue: 0, profit: 0, units: 0 };
      curr.revenue += Number(s.totalAmount || 0);
      curr.profit += Number(s.totalProfit || 0);
      curr.units += units;
      map.set(key, curr);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => ({
        ...v,
        revenue: Math.round(v.revenue),
        profit: Math.round(v.profit),
      }));
  }, [filteredSalesByDate, trendGranularity]);

  const categorySalesData = useMemo(() => {
    const productCat = new Map<string, string>();
    for (const p of products) {
      productCat.set(p.productId, p.category);
    }
    const map = new Map<string, { category: string; revenue: number; stockValue: number }>();

    for (const p of products) {
      const entry = map.get(p.category) ?? { category: p.category, revenue: 0, stockValue: 0 };
      entry.stockValue += Number(p.quantity || 0) * Number(p.purchasePrice || 0);
      map.set(p.category, entry);
    }

    for (const s of filteredSalesByDate) {
      for (const item of s.items ?? []) {
        const cat = productCat.get(item.productId) ?? 'Other';
        const entry = map.get(cat) ?? { category: cat, revenue: 0, stockValue: 0 };
        entry.revenue += Number(item.subtotal || 0);
        map.set(cat, entry);
      }
    }

    return Array.from(map.values())
      .map((v) => ({
        ...v,
        revenue: Math.round(v.revenue),
        stockValue: Math.round(v.stockValue),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [products, filteredSalesByDate]);

  const topSellingData = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number }>();
    for (const s of filteredSalesByDate) {
      for (const item of s.items ?? []) {
        const entry = map.get(item.productId) ?? {
          name: item.productName,
          units: 0,
          revenue: 0,
        };
        entry.units += Number(item.quantity || 0);
        entry.revenue += Number(item.subtotal || 0);
        map.set(item.productId, entry);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map((d) => ({
        ...d,
        shortName: d.name.length > 18 ? `${d.name.slice(0, 18)}…` : d.name,
        revenue: Math.round(d.revenue),
      }));
  }, [filteredSalesByDate]);

  const historicalVsPredictedData = useMemo(() => {
    // Use latest saved forecast if available, otherwise project top product's trailing 14 days + 7 day MA
    if (forecasts.length > 0) {
      const latest = forecasts[0];
      const targetProdId = latest.productId;
      const dailyMap = new Map<string, number>();
      for (const s of sales) {
        const dt = toDate(s.saleDate);
        if (!dt) continue;
        for (const item of s.items ?? []) {
          if (item.productId === targetProdId) {
            const key = dt.toISOString().slice(0, 10);
            dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(item.quantity || 0));
          }
        }
      }
      const histPoints = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-10)
        .map(([k, v]) => ({
          label: k.slice(5),
          actual: v,
          predicted: null as number | null,
        }));
      const predPoints = latest.predictions.slice(0, 10).map((p) => ({
        label: p.label,
        actual: null as number | null,
        predicted: p.predictedQty,
      }));
      return {
        productName: latest.productName,
        series: [...histPoints, ...predPoints],
      };
    }

    // Fallback: compute live trailing 10-day actual + 7-day moving average projection for top product
    const topProd = products[0];
    if (!topProd) return { productName: 'No product', series: [] };
    const dailyMap = new Map<string, number>();
    for (const s of sales) {
      const dt = toDate(s.saleDate);
      if (!dt) continue;
      for (const item of s.items ?? []) {
        if (item.productId === topProd.productId) {
          const key = dt.toISOString().slice(0, 10);
          dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(item.quantity || 0));
        }
      }
    }
    const sorted = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10);
    const avg =
      sorted.length > 0
        ? Math.round((sorted.reduce((a, b) => a + b[1], 0) / sorted.length) * 10) / 10
        : 0;

    const hist = sorted.map(([k, v]) => ({
      label: k.slice(5),
      actual: v,
      predicted: null as number | null,
    }));
    const proj = Array.from({ length: 7 }, (_, i) => ({
      label: `+${i + 1}d`,
      actual: null as number | null,
      predicted: avg,
    }));
    return {
      productName: topProd.name,
      series: [...hist, ...proj],
    };
  }, [forecasts, products, sales]);

  const handleGenerateAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await authorizedPost<{ summary: string }>('/api/assistant/dashboard-summary', {
        dataSourceFilter,
      });
      setAiSummary(res.summary);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate AI summary.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          ))}
        </div>
        <div className="h-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Store Operations Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time Firestore metrics · {settings?.storeName || 'FreshMart Superstore'} · Currency: INR
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Range Filter */}
          <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setDateRangeDays(days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  dateRangeDays === days
                    ? 'bg-slate-900 text-white dark:bg-teal-600'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Last {days}d
              </button>
            ))}
          </div>

          {/* Mobile Data Source Filter */}
          <div className="flex md:hidden items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            {(['all', 'sample', 'real'] as DataSourceFilter[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setDataSourceFilter(opt)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize ${
                  dataSourceFilter === opt
                    ? 'bg-slate-900 text-white dark:bg-teal-600'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Products</span>
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatNumber(kpis.totalProducts)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {products.filter((p) => p.isActive).length} active SKUs
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Stock Units</span>
            <Boxes className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatNumber(kpis.totalStockUnits)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Across {categorySalesData.length} categories
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Inventory Value</span>
            <IndianRupee className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatINR(kpis.totalInventoryValue, 0)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            At purchase cost valuation
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Sales Revenue ({dateRangeDays}d)</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatINR(kpis.totalSalesRevenue, 0)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {filteredSalesByDate.length} invoices recorded
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Estimated Gross Profit ({dateRangeDays}d)</span>
            <IndianRupee className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatINR(kpis.estimatedGrossProfit, 0)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Margin:{' '}
            {kpis.totalSalesRevenue > 0
              ? `${((kpis.estimatedGrossProfit / kpis.totalSalesRevenue) * 100).toFixed(1)}%`
              : '0.0%'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Low Stock Products</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {kpis.lowStockProducts.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            At or below minimum threshold
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Out of Stock Products</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
            {kpis.outOfStockProducts.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Zero units on shelf
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Pending Purchase Orders</span>
            <ClipboardList className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {kpis.pendingPurchaseOrders.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Value:{' '}
            {formatINR(
              kpis.pendingPurchaseOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
              0
            )}
          </div>
        </div>
      </div>

      {/* Gemini AI Executive Summary Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-teal-600 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                AI Business Summary
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grounded executive briefing generated on the server from your live Firestore store data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={aiLoading}
              onClick={handleGenerateAiSummary}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
              {aiLoading ? 'Analyzing...' : aiSummary ? 'Refresh AI Brief' : 'Generate AI Summary'}
            </button>
            <Link
              to="/assistant"
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Open Assistant
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {aiError && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
            {aiError}
          </div>
        )}

        {aiSummary && (
          <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            {aiSummary}
          </div>
        )}
      </div>

      {/* Charts Row 1: Revenue & Sales Trend + Category Sales */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Revenue &amp; Gross Profit Trend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calculated from actual Firestore sales invoices
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['daily', 'monthly'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setTrendGranularity(g)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize ${
                    trendGranularity === g
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72">
            {salesTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="label" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => formatINR(Number(value ?? 0), 0)}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue (INR)"
                    stroke="#0d9488"
                    fill="#0d9488"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Gross Profit (INR)"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No sales recorded in the last {dateRangeDays} days.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Category-wise Revenue &amp; Inventory
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Share of sales revenue across retail categories
            </p>
          </div>
          <div className="h-72">
            {categorySalesData.some((c) => c.revenue > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorySalesData}
                    dataKey="revenue"
                    nameKey="category"
                    cx="50%"
                    cy="45%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {categorySalesData.map((_, index) => (
                      <Cell key={index} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => formatINR(Number(value ?? 0), 0)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No category revenue data in this period.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2: Top Selling Products + Historical vs Predicted Demand */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Top-Selling Products ({dateRangeDays}d)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ranked by total revenue generated
            </p>
          </div>
          <div className="h-64">
            {topSellingData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSellingData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis type="number" tick={tickStyle} />
                  <YAxis type="category" dataKey="shortName" width={130} tick={tickStyle} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => formatINR(Number(value ?? 0), 0)}
                  />
                  <Bar dataKey="revenue" name="Revenue (INR)" fill={primarySeriesColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No product sales recorded in the last {dateRangeDays} days.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Historical vs Predicted Demand
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-sm">
                SKU: {historicalVsPredictedData.productName}
              </p>
            </div>
            <Link
              to="/forecasting"
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              Run Forecast
            </Link>
          </div>
          <div className="h-64">
            {historicalVsPredictedData.series.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historicalVsPredictedData.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="label" tick={tickStyle} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual Sold"
                    stroke={primarySeriesColor}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="Predicted Units"
                    stroke="#0d9488"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Add products and sales or run a forecast to visualize demand trends.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Operational Lists: Low Stock Alerts + Recent Transactions + Stock Movements + Upcoming POs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Low Stock & Out of Stock Alerts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Low &amp; Out-of-Stock Alerts
            </h2>
            <Link
              to="/smart-reorder"
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              Smart Reorder
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...kpis.outOfStockProducts, ...kpis.lowStockProducts].slice(0, 6).map((p) => (
              <div key={p.productId} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {p.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {p.sku} · Min: {p.minimumStock} {p.unit}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold font-mono tabular-nums">
                    {p.quantity} {p.unit}
                  </div>
                  <StatusLabel
                    label={p.quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                    tone={p.quantity === 0 ? 'critical' : 'warning'}
                  />
                </div>
              </div>
            ))}
            {kpis.outOfStockProducts.length === 0 && kpis.lowStockProducts.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                All active SKUs are above minimum stock levels.
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Purchase Orders */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Upcoming &amp; Open Purchase Orders
            </h2>
            <Link
              to="/purchase-orders"
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              View All POs
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {kpis.pendingPurchaseOrders.slice(0, 6).map((po) => (
              <div
                key={po.purchaseOrderId}
                className="px-5 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 font-mono">
                    {po.poNumber}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {po.supplierName} · ETA {formatDate(po.expectedDeliveryDate, settings?.timezone)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold font-mono tabular-nums">
                    {formatINR(po.totalAmount, 0)}
                  </div>
                  <StatusLabel
                    label={po.orderStatus}
                    tone={po.orderStatus === 'Partially Received' ? 'warning' : 'info'}
                  />
                </div>
              </div>
            ))}
            {kpis.pendingPurchaseOrders.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                No pending purchase orders.
              </div>
            )}
          </div>
        </div>

        {/* Recent Sales Transactions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Recent Sales Transactions
            </h2>
            <Link
              to="/sales"
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              POS &amp; History
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sales.slice(0, 6).map((sale) => (
              <div key={sale.saleId} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium font-mono text-slate-900 dark:text-slate-100">
                    {sale.invoiceNumber}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(sale.saleDate, settings?.timezone)} · {sale.items.length} items · {sale.paymentMethod}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold font-mono tabular-nums">
                    {formatINR(sale.totalAmount)}
                  </div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    +{formatINR(sale.totalProfit)} profit
                  </div>
                </div>
              </div>
            ))}
            {sales.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                No sales transactions recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Recent Stock Movements */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Recent Stock Movements
            </h2>
            <Link
              to="/inventory"
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              Stock Ledger
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stockMovements.slice(0, 6).map((mov) => (
              <div key={mov.movementId} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {mov.productName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {mov.movementType.replace('_', ' ')} · {mov.reason}
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono tabular-nums">
                  <div className="text-sm font-semibold">
                    {mov.previousStock} → {mov.newStock}
                  </div>
                  <div className="text-xs text-slate-500">Qty: {mov.quantity}</div>
                </div>
              </div>
            ))}
            {stockMovements.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                No stock movements logged yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
