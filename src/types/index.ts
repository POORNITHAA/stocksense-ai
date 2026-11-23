import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'ADMIN' | 'INVENTORY_MANAGER';
export type DataSource = 'sample' | 'real';
export type DataSourceFilter = 'all' | 'sample' | 'real';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  photoUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Product {
  productId: string;
  ownerId: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  description?: string;
  imageUrl?: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minimumStock: number;
  safetyStock: number;
  supplierId?: string;
  unit: string;
  isActive: boolean;
  dataSource: DataSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Supplier {
  supplierId: string;
  ownerId: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address?: string;
  suppliedProducts: string[];
  leadTimeDays: number;
  status: 'active' | 'inactive';
  dataSource: DataSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
}

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Credit';

export interface Sale {
  saleId: string;
  ownerId: string;
  invoiceNumber: string;
  items: SaleItem[];
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  paymentMethod: PaymentMethod;
  saleDate: Timestamp;
  dataSource: DataSource;
  createdAt: Timestamp;
}

export type MovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'ADJUSTMENT'
  | 'SALE'
  | 'PURCHASE_RECEIPT';

export interface StockMovement {
  movementId: string;
  ownerId: string;
  productId: string;
  productName: string;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  reason: string;
  dataSource: DataSource;
  createdAt: Timestamp;
}

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Pending'
  | 'Approved'
  | 'Ordered'
  | 'Partially Received'
  | 'Received'
  | 'Cancelled';

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  subtotal: number;
}

export interface PurchaseOrder {
  purchaseOrderId: string;
  ownerId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  orderStatus: PurchaseOrderStatus;
  orderDate: Timestamp;
  expectedDeliveryDate: Timestamp;
  receivedDate?: Timestamp;
  receiptIds?: string[];
  dataSource: DataSource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ForecastAlgorithm =
  | 'MOVING_AVERAGE'
  | 'WEIGHTED_MOVING_AVERAGE'
  | 'LINEAR_REGRESSION';

export type ForecastAggregation = 'daily' | 'weekly' | 'monthly';

export interface ForecastPredictionPoint {
  periodKey: string;
  label: string;
  predictedQty: number;
}

export interface ForecastHistoricalPoint {
  periodKey: string;
  label: string;
  actualQty: number;
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

export interface ForecastRecord {
  forecastId: string;
  ownerId: string;
  productId: string;
  productName: string;
  algorithm: ForecastAlgorithm;
  aggregation: ForecastAggregation;
  forecastHorizon: 7 | 30 | 90;
  predictions: ForecastPredictionPoint[];
  evaluationMetrics: ForecastEvaluationMetrics;
  generatedAt: Timestamp;
  dataSource: DataSource;
}

export interface ForecastApiResponse {
  productId: string;
  algorithm: ForecastAlgorithm;
  aggregation: ForecastAggregation;
  horizonDays: 7 | 30 | 90;
  historical: ForecastHistoricalPoint[];
  predictions: ForecastPredictionPoint[];
  evaluationMetrics: ForecastEvaluationMetrics;
}

export type NotificationType =
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'REORDER'
  | 'PURCHASE_ORDER'
  | 'FORECAST';

export interface AppNotification {
  notificationId: string;
  ownerId: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  conditionKey: string;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface StoreSettings {
  ownerId: string;
  storeName: string;
  currency: string;
  timezone: string;
  defaultSafetyStock: number;
  defaultLeadTimeDays: number;
  lowStockThreshold: number;
  theme: 'light' | 'dark';
  demoSeeded: boolean;
  updatedAt: Timestamp;
}

export interface AssistantMessageRecord {
  messageId: string;
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  dataSourceFilter: DataSourceFilter;
  metricsTimestamp?: string;
  createdAt: Timestamp;
}

export interface AssistantReorderProposal {
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
}
