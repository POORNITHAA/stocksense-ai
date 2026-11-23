import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { authorizedPost } from '../lib/api';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  DataSourceFilter,
  ForecastAggregation,
  ForecastAlgorithm,
  ForecastApiResponse,
  Product,
  Sale,
  Supplier,
} from '../types';
import { toDate } from '../utils/format';
import { createDeduplicatedNotification } from './notificationService';

export async function runBackendForecast(params: {
  productId: string;
  algorithm: ForecastAlgorithm;
  aggregation: ForecastAggregation;
  horizonDays: 7 | 30 | 90;
  windowSize?: number;
  dataSourceFilter: DataSourceFilter;
}): Promise<ForecastApiResponse> {
  return authorizedPost<ForecastApiResponse>('/api/forecasting/run', params);
}

export async function compareAllForecastAlgorithms(params: {
  productId: string;
  aggregation: ForecastAggregation;
  horizonDays: 7 | 30 | 90;
  windowSize?: number;
  dataSourceFilter: DataSourceFilter;
}): Promise<ForecastApiResponse[]> {
  const algorithms: ForecastAlgorithm[] = [
    'MOVING_AVERAGE',
    'WEIGHTED_MOVING_AVERAGE',
    'LINEAR_REGRESSION',
  ];
  return Promise.all(
    algorithms.map((algorithm) =>
      runBackendForecast({
        ...params,
        algorithm,
      })
    )
  );
}

export async function saveForecastRecord(params: {
  ownerId: string;
  productName: string;
  forecast: ForecastApiResponse;
}): Promise<string> {
  const forecastId = generateId('fc');
  const path = `forecasts/${forecastId}`;
  try {
    await setDoc(doc(db, 'forecasts', forecastId), {
      forecastId,
      ownerId: params.ownerId,
      productId: params.forecast.productId,
      productName: params.productName.slice(0, 160),
      algorithm: params.forecast.algorithm,
      aggregation: params.forecast.aggregation,
      forecastHorizon: params.forecast.horizonDays,
      predictions: params.forecast.predictions.slice(0, 90),
      evaluationMetrics: params.forecast.evaluationMetrics,
      generatedAt: serverTimestamp(),
      dataSource: 'real',
    });

    await createDeduplicatedNotification({
      ownerId: params.ownerId,
      title: `Forecast Saved: ${params.productName}`,
      message: `${params.forecast.horizonDays}-day ${params.forecast.algorithm.replace(/_/g, ' ')} forecast completed (${params.forecast.evaluationMetrics.trend} trend).`,
      notificationType: 'FORECAST',
      conditionKey: `fc_${params.forecast.productId}_${params.forecast.algorithm}_${params.forecast.horizonDays}`,
    });

    return forecastId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteForecastRecord(forecastId: string): Promise<void> {
  const path = `forecasts/${forecastId}`;
  try {
    await deleteDoc(doc(db, 'forecasts', forecastId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface ReorderRecommendationRow {
  product: Product;
  supplier: Supplier | null;
  leadTimeDays: number;
  usingDefaultLeadTime: boolean;
  avgDailyDemand: number;
  expectedLeadTimeDemand: number;
  safetyStock: number;
  reorderPoint: number;
  computedTargetStock: number;
  targetStock: number;
  suggestedQuantity: number;
  estimatedPurchaseCost: number;
  hasSufficientHistory: boolean;
  observedSaleDays: number;
  explanation: string;
  status: 'Critical' | 'Reorder Needed' | 'Healthy';
}

export function computeSmartReorderRecommendations(params: {
  products: Product[];
  sales: Sale[];
  suppliers: Supplier[];
  defaultLeadTimeDays: number;
  leadTimeOverrides?: Record<string, number>;
  safetyStockOverrides?: Record<string, number>;
  targetStockOverrides?: Record<string, number>;
  reviewCycleDays?: number;
}): ReorderRecommendationRow[] {
  const {
    products,
    sales,
    suppliers,
    defaultLeadTimeDays,
    leadTimeOverrides = {},
    safetyStockOverrides = {},
    targetStockOverrides = {},
    reviewCycleDays = 7,
  } = params;

  const supplierMap = new Map<string, Supplier>();
  for (const s of suppliers) {
    supplierMap.set(s.supplierId, s);
  }

  // Compute daily sales per product across the last 30 days
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const recentUnitsByProduct = new Map<string, number>();
  const firstSaleByProduct = new Map<string, number>();
  const activeDaysByProduct = new Map<string, Set<string>>();

  for (const sale of sales) {
    const dt = toDate(sale.saleDate);
    if (!dt) continue;
    const ms = dt.getTime();
    if (now - ms <= thirtyDaysMs) {
      const dayKey = dt.toISOString().slice(0, 10);
      for (const item of sale.items ?? []) {
        const pid = item.productId;
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;

        recentUnitsByProduct.set(pid, (recentUnitsByProduct.get(pid) ?? 0) + qty);
        const prevFirst = firstSaleByProduct.get(pid);
        if (prevFirst === undefined || ms < prevFirst) {
          firstSaleByProduct.set(pid, ms);
        }
        const daySet = activeDaysByProduct.get(pid) ?? new Set<string>();
        daySet.add(dayKey);
        activeDaysByProduct.set(pid, daySet);
      }
    }
  }

  return products
    .filter((p) => p.isActive)
    .map((product) => {
      const pid = product.productId;
      const supplier = product.supplierId ? supplierMap.get(product.supplierId) ?? null : null;
      const leadOverride = leadTimeOverrides[pid];
      const hasSupplierLead = Boolean(supplier && supplier.leadTimeDays > 0);
      const leadTimeDays =
        leadOverride !== undefined && Number.isFinite(leadOverride) && leadOverride >= 1
          ? Math.round(leadOverride)
          : hasSupplierLead
          ? supplier!.leadTimeDays
          : defaultLeadTimeDays;

      const total30dUnits = recentUnitsByProduct.get(pid) ?? 0;
      const firstMs = firstSaleByProduct.get(pid);
      const observedSpanDays = firstMs
        ? Math.max(1, Math.min(30, Math.ceil((now - firstMs) / (24 * 60 * 60 * 1000))))
        : 0;
      const observedSaleDays = activeDaysByProduct.get(pid)?.size ?? 0;
      const hasSufficientHistory = total30dUnits > 0 && observedSpanDays >= 3;

      const avgDailyDemand =
        observedSpanDays > 0
          ? Math.round((total30dUnits / observedSpanDays) * 100) / 100
          : 0;
      const expectedLeadTimeDemand = Math.round(avgDailyDemand * leadTimeDays * 100) / 100;

      const safetyOverride = safetyStockOverrides[pid];
      const safetyStock =
        safetyOverride !== undefined && Number.isFinite(safetyOverride) && safetyOverride >= 0
          ? Math.round(safetyOverride)
          : Number(product.safetyStock) || 0;

      const reorderPoint = Math.round((expectedLeadTimeDemand + safetyStock) * 100) / 100;

      // Computed target covers lead-time demand + safety stock + review buffer (with minimumStock fallback)
      const computedTargetStock = Math.max(
        Math.ceil(reorderPoint + avgDailyDemand * reviewCycleDays),
        Math.ceil(product.minimumStock * 2)
      );

      const targetOverride = targetStockOverrides[pid];
      const targetStock =
        targetOverride !== undefined && Number.isFinite(targetOverride) && targetOverride >= 0
          ? Math.round(targetOverride)
          : computedTargetStock;

      // Trigger reorder if below ROP, below minStock, or below custom target stock
      const triggerThreshold =
        targetOverride !== undefined ? targetStock : Math.max(reorderPoint, product.minimumStock);
      const needsReorder = product.quantity <= triggerThreshold;
      const suggestedQuantity = needsReorder
        ? Math.max(0, Math.ceil(targetStock - product.quantity))
        : 0;
      const estimatedPurchaseCost =
        Math.round(suggestedQuantity * product.purchasePrice * 100) / 100;

      const status: ReorderRecommendationRow['status'] =
        product.quantity === 0
          ? 'Critical'
          : suggestedQuantity > 0
          ? 'Reorder Needed'
          : 'Healthy';

      const leadSource =
        leadOverride !== undefined
          ? 'custom lead time'
          : hasSupplierLead
          ? `${supplier!.company} lead time`
          : 'default store lead time';

      let explanation = '';
      if (total30dUnits === 0) {
        explanation =
          suggestedQuantity > 0
            ? `No 30-day sales recorded (insufficient velocity data). Using minimum threshold (${product.minimumStock}) & Target Stock (${targetStock}): Target ${targetStock} − Current ${product.quantity} = reorder ${suggestedQuantity} ${product.unit}.`
            : `No 30-day sales recorded; current stock (${product.quantity} ${product.unit}) covers minimum threshold (${product.minimumStock}) and Target Stock (${targetStock}).`;
      } else {
        const limitedTag = !hasSufficientHistory
          ? `Limited history (${observedSpanDays}d window); `
          : '';
        if (product.quantity === 0) {
          explanation = `${limitedTag}Out of stock (0 ${product.unit}). Avg demand ${avgDailyDemand}/day × ${leadTimeDays}d (${leadSource}) = ${expectedLeadTimeDemand} lead demand + ${safetyStock} safety = ROP ${reorderPoint}. Target ${targetStock} − 0 = urgent ${suggestedQuantity} ${product.unit}.`;
        } else if (suggestedQuantity > 0) {
          explanation = `${limitedTag}Current (${product.quantity}) ≤ trigger (${Math.round(triggerThreshold * 100) / 100}). Lead demand ${avgDailyDemand}/day × ${leadTimeDays}d (${leadSource}) = ${expectedLeadTimeDemand} + ${safetyStock} safety = ROP ${reorderPoint}. Target ${targetStock} − ${product.quantity} = reorder ${suggestedQuantity} ${product.unit}.`;
        } else {
          explanation = `${limitedTag}Healthy buffer: Current (${product.quantity} ${product.unit}) exceeds ROP ${reorderPoint} (${expectedLeadTimeDemand} lead demand + ${safetyStock} safety) and Target Stock (${targetStock}).`;
        }
      }

      return {
        product,
        supplier,
        leadTimeDays,
        usingDefaultLeadTime: !hasSupplierLead && leadOverride === undefined,
        avgDailyDemand,
        expectedLeadTimeDemand,
        safetyStock,
        reorderPoint,
        computedTargetStock,
        targetStock,
        suggestedQuantity,
        estimatedPurchaseCost,
        hasSufficientHistory,
        observedSaleDays,
        explanation,
        status,
      };
    })
    .sort((a, b) => b.suggestedQuantity - a.suggestedQuantity);
}
