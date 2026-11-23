import type { ForecastAggregation, ForecastAlgorithm } from '../validation/schemas.ts';

export interface SaleItemRecord {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
}

export interface SaleRecord {
  saleId: string;
  saleDate: string;
  dataSource: 'sample' | 'real';
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  items: SaleItemRecord[];
}

export interface TimeBucketPoint {
  periodKey: string;
  label: string;
  actualQty: number;
}

export interface ForecastPredictionPoint {
  periodKey: string;
  label: string;
  predictedQty: number;
}

export interface ForecastEvaluationMetrics {
  mae: number | null;
  trainCount: number;
  testCount: number;
  totalPeriods: number;
  limitedHistory: boolean;
  insufficientData: boolean;
  trend: 'Increasing' | 'Decreasing' | 'Stable';
  averageHistoricalDemand: number;
  note: string;
}

export interface ForecastResult {
  productId: string;
  algorithm: ForecastAlgorithm;
  aggregation: ForecastAggregation;
  horizonDays: 7 | 30 | 90;
  historical: TimeBucketPoint[];
  predictions: ForecastPredictionPoint[];
  evaluationMetrics: ForecastEvaluationMetrics;
}

function toDateOnlyKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getBucketKey(date: Date, aggregation: ForecastAggregation): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (aggregation === 'daily') {
    return toDateOnlyKey(d);
  }
  if (aggregation === 'weekly') {
    // Align to Monday UTC of that week
    const day = d.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diffToMonday);
    return toDateOnlyKey(d);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function advanceBucketDate(date: Date, aggregation: ForecastAggregation, steps = 1): Date {
  const next = new Date(date.getTime());
  if (aggregation === 'daily') {
    next.setUTCDate(next.getUTCDate() + steps);
  } else if (aggregation === 'weekly') {
    next.setUTCDate(next.getUTCDate() + steps * 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + steps);
  }
  return next;
}

function formatBucketLabel(key: string, aggregation: ForecastAggregation): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  if (aggregation === 'monthly') {
    return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  if (aggregation === 'weekly') {
    return `Wk ${dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`;
  }
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export function aggregateProductSales(
  sales: SaleRecord[],
  productId: string,
  aggregation: ForecastAggregation
): TimeBucketPoint[] {
  const bucketMap = new Map<string, number>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const sale of sales) {
    if (!sale.saleDate || !Array.isArray(sale.items)) continue;
    const dt = new Date(sale.saleDate);
    if (Number.isNaN(dt.getTime())) continue;

    let matchedQty = 0;
    for (const item of sale.items) {
      if (item.productId === productId && Number(item.quantity) > 0) {
        matchedQty += Number(item.quantity);
      }
    }

    if (matchedQty > 0) {
      if (!minDate || dt < minDate) minDate = dt;
      if (!maxDate || dt > maxDate) maxDate = dt;
      const key = getBucketKey(dt, aggregation);
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + matchedQty);
    }
  }

  if (!minDate || !maxDate || bucketMap.size === 0) {
    return [];
  }

  // Ensure continuous timeline including zero-sales periods up to maxDate (or today)
  const today = new Date();
  const endBound = maxDate > today ? maxDate : today;
  const startKey = getBucketKey(minDate, aggregation);
  const endKey = getBucketKey(endBound, aggregation);

  const [sy, sm, sd] = startKey.split('-').map(Number);
  let cursor = new Date(Date.UTC(sy, (sm || 1) - 1, sd || 1));
  const series: TimeBucketPoint[] = [];

  for (let guard = 0; guard < 500; guard++) {
    const key = getBucketKey(cursor, aggregation);
    series.push({
      periodKey: key,
      label: formatBucketLabel(key, aggregation),
      actualQty: Math.round((bucketMap.get(key) ?? 0) * 100) / 100,
    });
    if (key >= endKey) break;
    cursor = advanceBucketDate(cursor, aggregation, 1);
  }

  return series;
}

function predictNextStep(
  history: number[],
  algorithm: ForecastAlgorithm,
  windowSize: number
): number {
  if (history.length === 0) return 0;

  if (algorithm === 'MOVING_AVERAGE') {
    const w = Math.min(windowSize, history.length);
    const slice = history.slice(-w);
    const avg = slice.reduce((acc, v) => acc + v, 0) / slice.length;
    return Math.max(0, Math.round(avg * 100) / 100);
  }

  if (algorithm === 'WEIGHTED_MOVING_AVERAGE') {
    const w = Math.min(windowSize, history.length);
    const slice = history.slice(-w);
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < slice.length; i++) {
      const weight = i + 1;
      weightedSum += slice[i] * weight;
      totalWeight += weight;
    }
    const wma = totalWeight > 0 ? weightedSum / totalWeight : 0;
    return Math.max(0, Math.round(wma * 100) / 100);
  }

  // LINEAR_REGRESSION over index 0..n-1, forecasting index n
  const n = history.length;
  if (n === 1) return Math.max(0, Math.round(history[0] * 100) / 100);

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += history[i];
    sumXY += i * history[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) {
    return Math.max(0, Math.round((sumY / n) * 100) / 100);
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const rawPred = intercept + slope * n;
  return Math.max(0, Math.round(rawPred * 100) / 100);
}

function generateMultiStepForecast(
  series: number[],
  algorithm: ForecastAlgorithm,
  windowSize: number,
  steps: number
): number[] {
  if (series.length === 0) return Array(steps).fill(0);

  if (algorithm === 'LINEAR_REGRESSION') {
    const n = series.length;
    if (n === 1) return Array(steps).fill(Math.max(0, Math.round(series[0] * 100) / 100));

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += series[i];
      sumXY += i * series[i];
      sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;

    const preds: number[] = [];
    for (let s = 0; s < steps; s++) {
      const val = intercept + slope * (n + s);
      preds.push(Math.max(0, Math.round(val * 100) / 100));
    }
    return preds;
  }

  // Iterative roll-forward for MA and WMA
  const working = [...series];
  const preds: number[] = [];
  for (let s = 0; s < steps; s++) {
    const nextVal = predictNextStep(working, algorithm, windowSize);
    preds.push(nextVal);
    working.push(nextVal);
  }
  return preds;
}

function detectTrend(values: number[]): 'Increasing' | 'Decreasing' | 'Stable' {
  if (values.length < 3) return 'Stable';
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  const mean = sumY / n;
  if (denom === 0 || mean === 0) return 'Stable';
  const slope = (n * sumXY - sumX * sumY) / denom;
  const relativeSlope = slope / mean;
  if (relativeSlope > 0.015) return 'Increasing';
  if (relativeSlope < -0.015) return 'Decreasing';
  return 'Stable';
}

export function runDemandForecast(params: {
  productId: string;
  sales: SaleRecord[];
  algorithm: ForecastAlgorithm;
  aggregation: ForecastAggregation;
  horizonDays: 7 | 30 | 90;
  windowSize?: number;
}): ForecastResult {
  const { productId, sales, algorithm, aggregation, horizonDays, windowSize = 7 } = params;
  const historical = aggregateProductSales(sales, productId, aggregation);

  const horizonPeriods =
    aggregation === 'daily'
      ? horizonDays
      : aggregation === 'weekly'
      ? Math.max(1, Math.ceil(horizonDays / 7))
      : Math.max(1, Math.ceil(horizonDays / 30));

  if (historical.length === 0) {
    const today = new Date();
    const startKey = getBucketKey(today, aggregation);
    const [sy, sm, sd] = startKey.split('-').map(Number);
    let cursor = new Date(Date.UTC(sy, (sm || 1) - 1, sd || 1));
    const zeroPredictions: ForecastPredictionPoint[] = [];
    for (let i = 0; i < horizonPeriods; i++) {
      cursor = advanceBucketDate(cursor, aggregation, 1);
      const key = getBucketKey(cursor, aggregation);
      zeroPredictions.push({
        periodKey: key,
        label: formatBucketLabel(key, aggregation),
        predictedQty: 0,
      });
    }
    return {
      productId,
      algorithm,
      aggregation,
      horizonDays,
      historical: [],
      predictions: zeroPredictions,
      evaluationMetrics: {
        mae: null,
        trainCount: 0,
        testCount: 0,
        totalPeriods: 0,
        limitedHistory: true,
        insufficientData: true,
        trend: 'Stable',
        averageHistoricalDemand: 0,
        note: 'No historical sales records exist for this product yet. Record sales to generate statistical demand forecasts.',
      },
    };
  }

  const values = historical.map((h) => h.actualQty);
  const n = values.length;

  // Strict chronological train/test split for holdout MAE validation
  let mae: number | null = null;
  let trainCount = n;
  let testCount = 0;

  if (n >= 6) {
    testCount = Math.max(2, Math.min(14, Math.floor(n * 0.2)));
    trainCount = n - testCount;
    const trainSeries = values.slice(0, trainCount);
    const testSeries = values.slice(trainCount);

    // One-step-ahead walk-forward evaluation on strictly held-out test periods
    let absErrorSum = 0;
    const expandingTrain = [...trainSeries];
    for (let i = 0; i < testSeries.length; i++) {
      const pred = predictNextStep(expandingTrain, algorithm, windowSize);
      absErrorSum += Math.abs(testSeries[i] - pred);
      expandingTrain.push(testSeries[i]);
    }
    mae = Math.round((absErrorSum / testSeries.length) * 100) / 100;
  }

  const limitedHistory = n < 7;
  const predictedValues = generateMultiStepForecast(values, algorithm, windowSize, horizonPeriods);

  const lastKey = historical[historical.length - 1].periodKey;
  const [ly, lm, ld] = lastKey.split('-').map(Number);
  let cursor = new Date(Date.UTC(ly, (lm || 1) - 1, ld || 1));

  const predictions: ForecastPredictionPoint[] = predictedValues.map((qty) => {
    cursor = advanceBucketDate(cursor, aggregation, 1);
    const key = getBucketKey(cursor, aggregation);
    return {
      periodKey: key,
      label: formatBucketLabel(key, aggregation),
      predictedQty: qty,
    };
  });

  const avgDemand = Math.round((values.reduce((a, b) => a + b, 0) / n) * 100) / 100;
  const trend = detectTrend(values);

  let note = 'Forecast estimates expected demand from historical patterns and is not guaranteed.';
  if (limitedHistory) {
    note = `Limited history (${n} period${n === 1 ? '' : 's'}): holdout MAE requires at least 6 historical periods. Treat predictions as directional estimates.`;
  } else if (mae !== null) {
    note = `MAE (${mae} units) was measured on ${testCount} held-out historical periods using a strict chronological split. Estimates are directional and not guaranteed.`;
  }

  return {
    productId,
    algorithm,
    aggregation,
    horizonDays,
    historical,
    predictions,
    evaluationMetrics: {
      mae,
      trainCount,
      testCount,
      totalPeriods: n,
      limitedHistory,
      insufficientData: false,
      trend,
      averageHistoricalDemand: avgDemand,
      note,
    },
  };
}
