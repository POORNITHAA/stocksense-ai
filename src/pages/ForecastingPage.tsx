import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookmarkCheck,
  Download,
  Eye,
  GitCompare,
  Play,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  compareAllForecastAlgorithms,
  deleteForecastRecord,
  runBackendForecast,
  saveForecastRecord,
} from '../services/forecastService';
import { formatDateTime } from '../utils/format';
import { StatusLabel } from '../components/common/StatusLabel';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import type {
  ForecastAggregation,
  ForecastAlgorithm,
  ForecastApiResponse,
  ForecastRecord,
} from '../types';

function formatAlgorithmName(algo: ForecastAlgorithm): string {
  if (algo === 'MOVING_AVERAGE') return 'Moving Average (MA)';
  if (algo === 'WEIGHTED_MOVING_AVERAGE') return 'Weighted Moving Avg (WMA)';
  return 'Linear Regression (OLS)';
}

function getAggregationPeriodNoun(agg: ForecastAggregation, count: number): string {
  if (agg === 'daily') return count === 1 ? 'day' : 'days';
  if (agg === 'weekly') return count === 1 ? 'week' : 'weeks';
  return count === 1 ? 'month' : 'months';
}

export function ForecastingPage() {
  const { firebaseUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const primarySeriesColor = isDark ? '#cbd5e1' : '#0f172a';
  const tickStyle = { fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' };
  const tooltipStyle = isDark
    ? { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '0.5rem', fontSize: '12px' }
    : { borderRadius: '0.5rem', fontSize: '12px' };
  const { loadingData, products, forecasts, dataSourceFilter, settings } = useData();

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const [productId, setProductId] = useState('');
  const [algorithm, setAlgorithm] = useState<ForecastAlgorithm>('WEIGHTED_MOVING_AVERAGE');
  const [aggregation, setAggregation] = useState<ForecastAggregation>('daily');
  const [horizonDays, setHorizonDays] = useState<7 | 30 | 90>(30);
  const [windowSize, setWindowSize] = useState(7);

  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ForecastApiResponse | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ForecastApiResponse[] | null>(null);

  const [inspectRecord, setInspectRecord] = useState<ForecastRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ForecastRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!productId && activeProducts.length > 0) {
      setProductId(activeProducts[0].productId);
    }
  }, [activeProducts, productId]);

  const selectedProduct = activeProducts.find((p) => p.productId === productId);

  const handleRunForecast = async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await runBackendForecast({
        productId,
        algorithm,
        aggregation,
        horizonDays,
        windowSize,
        dataSourceFilter,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forecasting engine error.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompareAll = async () => {
    if (!productId) return;
    setComparing(true);
    setError(null);
    setSavedMsg(null);
    try {
      const results = await compareAllForecastAlgorithms({
        productId,
        aggregation,
        horizonDays,
        windowSize,
        dataSourceFilter,
      });
      setComparisonResults(results);
      const activeMatch = results.find((r) => r.algorithm === algorithm) ?? results[0];
      if (activeMatch) setResult(activeMatch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model comparison error.');
    } finally {
      setComparing(false);
    }
  };

  const handleSaveForecast = async () => {
    if (!firebaseUser || !result || !selectedProduct) return;
    setSaving(true);
    setError(null);
    try {
      await saveForecastRecord({
        ownerId: firebaseUser.uid,
        productName: selectedProduct.name,
        forecast: result,
      });
      setSavedMsg('Forecast saved to Firestore.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save forecast.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteForecast = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteForecastRecord(deleteTarget.forecastId);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete forecast.');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    const rows = [
      ['Type', 'Period', 'Period Key', 'Quantity'],
      ...result.historical.map((h) => ['Historical Actual', h.label, h.periodKey, String(h.actualQty)]),
      ...result.predictions.map((p) => ['Predicted Demand', p.label, p.periodKey, String(p.predictedQty)]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forecast_${selectedProduct?.sku ?? result.productId}_${result.algorithm.toLowerCase()}_${result.horizonDays}d.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const bestModelMae = useMemo(() => {
    if (!comparisonResults) return null;
    const valid = comparisonResults
      .map((r) => r.evaluationMetrics.mae)
      .filter((v): v is number => v !== null);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [comparisonResults]);

  const chartData = useMemo(() => {
    if (!result) return [];
    const hist = result.historical.slice(-45).map((h) => ({
      label: h.label,
      actualQty: h.actualQty,
      predictedQty: null as number | null,
    }));
    const preds = result.predictions.map((p) => ({
      label: p.label,
      actualQty: null as number | null,
      predictedQty: p.predictedQty,
    }));
    return [...hist, ...preds];
  }, [result]);

  const totalPredictedDemand = useMemo(() => {
    if (!result) return 0;
    return Math.round(result.predictions.reduce((s, p) => s + p.predictedQty, 0) * 100) / 100;
  }, [result]);

  if (loadingData) {
    return <LoadingSkeleton rows={6} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Demand Forecasting
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Statistical forecasting engine with Moving Average, Weighted Moving Average, Linear Regression, and chronological holdout MAE evaluation
          </p>
        </div>
      </div>

      {activeProducts.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No active products to forecast"
          description="Add active products in the Product Catalog, switch the data filter to All Data, or restore the sample supermarket dataset in Settings."
        />
      ) : (
        <>

      {/* Configuration Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium mb-1">Select Product</label>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setComparisonResults(null);
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              {activeProducts.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.name} ({p.sku}) — Stock: {p.quantity}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Algorithm</label>
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as ForecastAlgorithm)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="MOVING_AVERAGE">Moving Average (MA)</option>
              <option value="WEIGHTED_MOVING_AVERAGE">Weighted Moving Average (WMA)</option>
              <option value="LINEAR_REGRESSION">Linear Regression (OLS)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Aggregation</label>
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as ForecastAggregation)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Forecast Horizon</label>
            <select
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value) as 7 | 30 | 90)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value={7}>Next 7 days</option>
              <option value={30}>Next 30 days</option>
              <option value={90}>Next 90 days</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 text-xs">
            {algorithm !== 'LINEAR_REGRESSION' && (
              <label className="flex items-center gap-2">
                <span className="text-slate-600 dark:text-slate-300">Historical Window (periods):</span>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={windowSize}
                  onChange={(e) => setWindowSize(Math.max(2, Math.min(30, Number(e.target.value) || 2)))}
                  className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {result && !result.evaluationMetrics.insufficientData && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveForecast}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <BookmarkCheck className="w-4 h-4 text-teal-600" />
                {saving ? 'Saving...' : 'Save Forecast'}
              </button>
            )}
            <button
              type="button"
              disabled={comparing || loading || !productId}
              onClick={handleCompareAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              <GitCompare className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              {comparing ? 'Comparing...' : 'Compare All 3 Models'}
            </button>
            <button
              type="button"
              disabled={loading || comparing || !productId}
              onClick={handleRunForecast}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-60"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Running Model...' : 'Generate Forecast'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {savedMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs text-emerald-700 dark:text-emerald-300">
          {savedMsg}
        </div>
      )}

      {/* Multi-Model Comparison Table */}
      {comparisonResults && comparisonResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="text-sm font-semibold">
              Algorithm Holdout Comparison — {selectedProduct?.name} ({aggregation}, {horizonDays}d horizon)
            </div>
            <span className="text-xs text-slate-500">Lowest Holdout MAE indicates best historical fit</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                  <th className="py-2.5 px-4">Algorithm</th>
                  <th className="py-2.5 px-4 text-right">Holdout MAE</th>
                  <th className="py-2.5 px-4">Trend</th>
                  <th className="py-2.5 px-4 text-right">Avg / Period</th>
                  <th className="py-2.5 px-4 text-right">Projected Total</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {comparisonResults.map((cmp) => {
                  const total =
                    Math.round(cmp.predictions.reduce((s, p) => s + p.predictedQty, 0) * 100) / 100;
                  const isBest =
                    bestModelMae !== null && cmp.evaluationMetrics.mae === bestModelMae;
                  const isSelected = result?.algorithm === cmp.algorithm;

                  return (
                    <tr key={cmp.algorithm} className={isSelected ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''}>
                      <td className="py-2.5 px-4 font-medium">
                        <span>{formatAlgorithmName(cmp.algorithm)}</span>
                        {isBest && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded">
                            Lowest MAE
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold">
                        {cmp.evaluationMetrics.mae !== null
                          ? `${cmp.evaluationMetrics.mae} units`
                          : 'N/A'}
                      </td>
                      <td className="py-2.5 px-4">{cmp.evaluationMetrics.trend}</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {cmp.evaluationMetrics.averageHistoricalDemand}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold">{total} units</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setAlgorithm(cmp.algorithm);
                            setResult(cmp);
                          }}
                          className={`px-2.5 py-1 rounded border text-xs font-medium ${
                            isSelected
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {isSelected ? 'Viewing' : 'View Chart'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results Area */}
      {result ? (
        <div className="space-y-6">
          {/* Insufficient / Limited History Banner */}
          {(result.evaluationMetrics.insufficientData || result.evaluationMetrics.limitedHistory) && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">
                  {result.evaluationMetrics.insufficientData
                    ? 'Insufficient Historical Data: '
                    : 'Limited Historical Window: '}
                </span>
                {result.evaluationMetrics.note}
              </div>
            </div>
          )}

          {/* Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">
                Projected {result.predictions.length}-
                {getAggregationPeriodNoun(result.aggregation, result.predictions.length)} Demand ({result.horizonDays}d horizon)
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                {totalPredictedDemand} units
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Current stock: {selectedProduct?.quantity ?? 0} {selectedProduct?.unit}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">Holdout Validation MAE</div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                {result.evaluationMetrics.mae !== null
                  ? `${result.evaluationMetrics.mae} units`
                  : 'N/A'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Train: {result.evaluationMetrics.trainCount} · Test: {result.evaluationMetrics.testCount} periods
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">Demand Trend</div>
              <div className="mt-1.5">
                <StatusLabel
                  label={result.evaluationMetrics.trend}
                  tone={
                    result.evaluationMetrics.trend === 'Increasing'
                      ? 'success'
                      : result.evaluationMetrics.trend === 'Decreasing'
                      ? 'warning'
                      : 'info'
                  }
                />
              </div>
              <div className="text-xs text-slate-500 mt-1.5 font-mono">
                Avg: {result.evaluationMetrics.averageHistoricalDemand} / {result.aggregation}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">Algorithm &amp; History</div>
              <div className="text-sm font-semibold mt-1">
                {formatAlgorithmName(result.algorithm)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {result.evaluationMetrics.totalPeriods} historical {result.aggregation} periods
              </div>
            </div>
          </div>

          {/* Disclaimer / Methodology Note */}
          {!result.evaluationMetrics.insufficientData && !result.evaluationMetrics.limitedHistory && (
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">Evaluation Note: </span>
              {result.evaluationMetrics.note}
            </div>
          )}

          {/* Forecast Line Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold">
              Historical Sales vs Predicted Demand — {selectedProduct?.name}
            </h2>
            {chartData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="label" tick={tickStyle} />
                    <YAxis tick={tickStyle} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="actualQty"
                      name="Historical Sales"
                      stroke={primarySeriesColor}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="predictedQty"
                      name="Predicted Demand"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-slate-500">
                No sales data points available to plot.
              </div>
            )}
          </div>

          {/* Forecast Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="text-sm font-semibold">
                Predicted Demand Schedule ({result.predictions.length}{' '}
                {getAggregationPeriodNoun(result.aggregation, result.predictions.length)})
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Period</th>
                    <th className="py-2.5 px-4">Period Key</th>
                    <th className="py-2.5 px-4 text-right">Predicted Demand (Units)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {result.predictions.map((p) => (
                    <tr key={p.periodKey}>
                      <td className="py-2 px-4 font-medium">{p.label}</td>
                      <td className="py-2 px-4 font-mono text-slate-500">{p.periodKey}</td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold">
                        {p.predictedQty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
          <TrendingUp className="w-8 h-8 mx-auto text-teal-600" />
          <div className="text-sm font-semibold">Select a product and click Generate Forecast</div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The forecasting engine aggregates your Firestore sales history, fills zero-sales dates, performs a chronological train/test split for holdout MAE, and projects future demand.
          </p>
        </div>
      )}
        </>
      )}

      {/* Saved Forecasts History */}
      {forecasts.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
            Saved Forecasts History ({forecasts.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-4">Algorithm</th>
                  <th className="py-2.5 px-4">Horizon</th>
                  <th className="py-2.5 px-4">Trend</th>
                  <th className="py-2.5 px-4 text-right">Holdout MAE</th>
                  <th className="py-2.5 px-4">Generated</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {forecasts.slice(0, 20).map((f) => (
                  <tr key={f.forecastId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-medium">{f.productName}</td>
                    <td className="py-2.5 px-4">{formatAlgorithmName(f.algorithm)}</td>
                    <td className="py-2.5 px-4 font-mono">
                      {f.forecastHorizon}d ({f.aggregation})
                    </td>
                    <td className="py-2.5 px-4">{f.evaluationMetrics?.trend ?? '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {f.evaluationMetrics?.mae !== null && f.evaluationMetrics?.mae !== undefined
                        ? f.evaluationMetrics.mae
                        : 'N/A'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {formatDateTime(f.generatedAt, settings?.timezone)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectRecord(f)}
                          title="Inspect saved forecast"
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          title="Delete saved forecast"
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inspect Saved Forecast Modal */}
      <Modal
        open={Boolean(inspectRecord)}
        onClose={() => setInspectRecord(null)}
        title={inspectRecord ? `Saved Forecast — ${inspectRecord.productName}` : 'Saved Forecast'}
        subtitle={
          inspectRecord
            ? `${formatAlgorithmName(inspectRecord.algorithm)} · ${inspectRecord.forecastHorizon}d (${inspectRecord.aggregation})`
            : undefined
        }
        maxWidth="max-w-2xl"
      >
        {inspectRecord && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">Holdout MAE</div>
                <div className="font-mono font-semibold text-sm mt-0.5">
                  {inspectRecord.evaluationMetrics?.mae !== null &&
                  inspectRecord.evaluationMetrics?.mae !== undefined
                    ? `${inspectRecord.evaluationMetrics.mae} units`
                    : 'N/A'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">Trend</div>
                <div className="font-semibold text-sm mt-0.5">
                  {inspectRecord.evaluationMetrics?.trend ?? '—'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">Projected Total</div>
                <div className="font-mono font-semibold text-sm mt-0.5">
                  {Math.round(
                    (inspectRecord.predictions ?? []).reduce((s, p) => s + p.predictedQty, 0) * 100
                  ) / 100}{' '}
                  units
                </div>
              </div>
            </div>

            {inspectRecord.evaluationMetrics?.note && (
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                {inspectRecord.evaluationMetrics.note}
              </div>
            )}

            <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Period</th>
                    <th className="py-2 px-3">Period Key</th>
                    <th className="py-2 px-3 text-right">Predicted Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(inspectRecord.predictions ?? []).map((p) => (
                    <tr key={p.periodKey}>
                      <td className="py-1.5 px-3 font-medium">{p.label}</td>
                      <td className="py-1.5 px-3 font-mono text-slate-500">{p.periodKey}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold">
                        {p.predictedQty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Saved Forecast"
        description={
          deleteTarget
            ? `Remove the saved ${formatAlgorithmName(deleteTarget.algorithm)} forecast for "${deleteTarget.productName}"?`
            : ''
        }
        confirmLabel="Delete Forecast"
        destructive
        loading={deleting}
        onConfirm={handleDeleteForecast}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
