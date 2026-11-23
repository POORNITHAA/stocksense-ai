import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';
import { ensureStoreSettings } from '../services/settingsService';
import { seedDemoDataIfNeeded } from '../services/demoSeeder';
import { toDate } from '../utils/format';
import type {
  AppNotification,
  DataSourceFilter,
  ForecastRecord,
  Product,
  PurchaseOrder,
  Sale,
  StockMovement,
  StoreSettings,
  Supplier,
} from '../types';

interface DataContextValue {
  loadingData: boolean;
  seedingDemo: boolean;
  dataError: string | null;
  dismissDataError: () => void;
  retrySync: () => void;
  dataSourceFilter: DataSourceFilter;
  setDataSourceFilter: (filter: DataSourceFilter) => void;
  globalSearch: string;
  setGlobalSearch: (term: string) => void;
  allProducts: Product[];
  products: Product[];
  suppliers: Supplier[];
  allSuppliers: Supplier[];
  sales: Sale[];
  allSales: Sale[];
  stockMovements: StockMovement[];
  purchaseOrders: PurchaseOrder[];
  forecasts: ForecastRecord[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  settings: StoreSettings | null;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, authReady, isVerified } = useAuth();
  const { setTheme } = useTheme();

  const [loadingData, setLoadingData] = useState(true);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [syncNonce, setSyncNonce] = useState(0);
  const [dataSourceFilter, setDataSourceFilter] = useState<DataSourceFilter>('all');
  const [globalSearch, setGlobalSearch] = useState('');

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [allMovements, setAllMovements] = useState<StockMovement[]>([]);
  const [allPurchaseOrders, setAllPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [allForecasts, setAllForecasts] = useState<ForecastRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  const dismissDataError = () => setDataError(null);
  const retrySync = () => {
    setDataError(null);
    setSyncNonce((n) => n + 1);
  };

  useEffect(() => {
    if (!authReady || !firebaseUser || !isVerified) {
      setAllProducts([]);
      setAllSuppliers([]);
      setAllSales([]);
      setAllMovements([]);
      setAllPurchaseOrders([]);
      setAllForecasts([]);
      setNotifications([]);
      setSettings(null);
      setDataError(null);
      setLoadingData(false);
      return;
    }

    const uid = firebaseUser.uid;
    let cancelled = false;
    setLoadingData(true);
    setDataError(null);

    const reportSyncError = (err: unknown, operationType: OperationType, path: string) => {
      if (cancelled) return;
      const errMessage = err instanceof Error ? err.message : String(err);
      try {
        handleFirestoreError(err, operationType, path);
      } catch {
        // Logged via handleFirestoreError; surface safely through React state instead of uncaught async throw
      }
      setDataError(
        `Unable to sync ${path} from Firestore (${errMessage}). Check your connection or permissions and retry.`
      );
      setLoadingData(false);
    };

    // Initialize store settings and idempotently seed demo supermarket dataset on first login
    (async () => {
      try {
        const s = await ensureStoreSettings(uid);
        if (!cancelled && s.theme) {
          setTheme(s.theme);
        }
        if (!s.demoSeeded) {
          if (!cancelled) setSeedingDemo(true);
          await seedDemoDataIfNeeded(uid);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to initialize store settings or demo dataset.';
          console.error('Initialization/seeding error:', err);
          setDataError(msg);
          setLoadingData(false);
        }
      } finally {
        if (!cancelled) setSeedingDemo(false);
      }
    })();

    const ownerQuery = (colName: string) =>
      query(collection(db, colName), where('ownerId', '==', uid));

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        ownerQuery('products'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as Product)
            .sort((a, b) => a.name.localeCompare(b.name));
          setAllProducts(list);
          setLoadingData(false);
        },
        (err) => reportSyncError(err, OperationType.LIST, 'products')
      )
    );

    unsubs.push(
      onSnapshot(
        ownerQuery('suppliers'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as Supplier)
            .sort((a, b) => a.company.localeCompare(b.company));
          setAllSuppliers(list);
        },
        (err) => reportSyncError(err, OperationType.LIST, 'suppliers')
      )
    );

    unsubs.push(
      onSnapshot(
        ownerQuery('sales'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as Sale)
            .sort((a, b) => (toDate(b.saleDate)?.getTime() ?? 0) - (toDate(a.saleDate)?.getTime() ?? 0));
          setAllSales(list);
        },
        (err) => reportSyncError(err, OperationType.LIST, 'sales')
      )
    );

    unsubs.push(
      onSnapshot(
        ownerQuery('stockMovements'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as StockMovement)
            .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
          setAllMovements(list);
        },
        (err) => reportSyncError(err, OperationType.LIST, 'stockMovements')
      )
    );

    unsubs.push(
      onSnapshot(
        ownerQuery('purchaseOrders'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as PurchaseOrder)
            .sort((a, b) => (toDate(b.orderDate)?.getTime() ?? 0) - (toDate(a.orderDate)?.getTime() ?? 0));
          setAllPurchaseOrders(list);
        },
        (err) => reportSyncError(err, OperationType.LIST, 'purchaseOrders')
      )
    );

    unsubs.push(
      onSnapshot(
        ownerQuery('forecasts'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as ForecastRecord)
            .sort((a, b) => (toDate(b.generatedAt)?.getTime() ?? 0) - (toDate(a.generatedAt)?.getTime() ?? 0));
          setAllForecasts(list);
        },
        (err) => reportSyncError(err, OperationType.LIST, 'forecasts')
      )
    );

    unsubs.push(
      onSnapshot(
        ownerQuery('notifications'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as AppNotification)
            .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
          setNotifications(list);
        },
        (err) => reportSyncError(err, OperationType.LIST, 'notifications')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'settings', uid),
        (snap) => {
          if (snap.exists()) {
            setSettings(snap.data() as StoreSettings);
          }
        },
        (err) => reportSyncError(err, OperationType.GET, `settings/${uid}`)
      )
    );

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, isVerified, setTheme, syncNonce]);

  const filterSource = <T extends { dataSource: 'sample' | 'real' }>(items: T[]): T[] => {
    if (dataSourceFilter === 'all') return items;
    return items.filter((i) => i.dataSource === dataSourceFilter);
  };

  const products = useMemo(() => filterSource(allProducts), [allProducts, dataSourceFilter]);
  const suppliers = useMemo(() => filterSource(allSuppliers), [allSuppliers, dataSourceFilter]);
  const sales = useMemo(() => filterSource(allSales), [allSales, dataSourceFilter]);
  const stockMovements = useMemo(() => filterSource(allMovements), [allMovements, dataSourceFilter]);
  const purchaseOrders = useMemo(() => filterSource(allPurchaseOrders), [allPurchaseOrders, dataSourceFilter]);
  const forecasts = useMemo(() => filterSource(allForecasts), [allForecasts, dataSourceFilter]);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  return (
    <DataContext.Provider
      value={{
        loadingData,
        seedingDemo,
        dataError,
        dismissDataError,
        retrySync,
        dataSourceFilter,
        setDataSourceFilter,
        globalSearch,
        setGlobalSearch,
        allProducts,
        products,
        suppliers,
        allSuppliers,
        sales,
        allSales,
        stockMovements,
        purchaseOrders,
        forecasts,
        notifications,
        unreadNotificationCount,
        settings,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
