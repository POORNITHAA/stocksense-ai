import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { buildSkuIndexId } from './productService';

interface BatchOp {
  type: 'set' | 'delete' | 'update';
  ref: ReturnType<typeof doc>;
  data?: Record<string, unknown>;
}

async function commitInChunks(ops: BatchOp[], chunkSize = 350): Promise<void> {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'set' && op.data) {
        batch.set(op.ref, op.data);
      } else if (op.type === 'update' && op.data) {
        batch.update(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    }
    await batch.commit();
  }
}

interface SampleProductDef {
  idx: number;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minimumStock: number;
  safetyStock: number;
  supplierIdx: number;
  unit: string;
  pattern: 'steady' | 'growing' | 'weekend' | 'declining';
  baseDailyRate: number;
}

const SAMPLE_SUPPLIERS = [
  {
    idx: 1,
    name: 'Rajesh Sharma',
    company: 'Deccan Agro Grains Pvt Ltd',
    email: 'orders@deccanagro.in',
    phone: '+91 98450 11204',
    address: 'APMC Yard, Yeshwanthpur, Bengaluru 560022',
    leadTimeDays: 4,
  },
  {
    idx: 2,
    name: 'Meenakshi Iyer',
    company: 'Nilgiri Beverages & Foods',
    email: 'supply@nilgiribev.in',
    phone: '+91 98401 33490',
    address: 'SIDCO Industrial Estate, Chennai 600032',
    leadTimeDays: 5,
  },
  {
    idx: 3,
    name: 'Vikram Patel',
    company: 'Anand Fresh Dairy Co-op',
    email: 'dispatch@ananddairy.in',
    phone: '+91 98250 77812',
    address: 'GIDC Estate, Anand, Gujarat 388001',
    leadTimeDays: 2,
  },
  {
    idx: 4,
    name: 'Kavita Deshmukh',
    company: 'Sahyadri Personal Care Distributors',
    email: 'b2b@sahyadricare.in',
    phone: '+91 98204 55190',
    address: 'MIDC Turbhe, Navi Mumbai 400705',
    leadTimeDays: 6,
  },
  {
    idx: 5,
    name: 'Suresh Nair',
    company: 'Kaveri Household Essentials',
    email: 'sales@kaverihome.in',
    phone: '+91 98470 62318',
    address: 'Kalamassery Logistics Park, Kochi 683104',
    leadTimeDays: 7,
  },
];

const SAMPLE_PRODUCTS: SampleProductDef[] = [
  // Groceries (8 items)
  { idx: 1, name: 'India Gate Basmati Rice 5kg', sku: 'GRO-RICE-5K', barcode: '890123400101', category: 'Groceries', purchasePrice: 440, sellingPrice: 545, quantity: 64, minimumStock: 20, safetyStock: 18, supplierIdx: 1, unit: 'bag', pattern: 'steady', baseDailyRate: 4.2 },
  { idx: 2, name: 'Aashirvaad Whole Wheat Flour 10kg', sku: 'GRO-ATTA-10K', barcode: '890123400102', category: 'Groceries', purchasePrice: 365, sellingPrice: 440, quantity: 14, minimumStock: 20, safetyStock: 15, supplierIdx: 1, unit: 'bag', pattern: 'steady', baseDailyRate: 3.8 }, // Low stock
  { idx: 3, name: 'Refined Cane Sugar 1kg', sku: 'GRO-SUGR-1K', barcode: '890123400103', category: 'Groceries', purchasePrice: 38, sellingPrice: 48, quantity: 110, minimumStock: 30, safetyStock: 25, supplierIdx: 1, unit: 'pack', pattern: 'steady', baseDailyRate: 6.5 },
  { idx: 4, name: 'Fortune Sunlite Cooking Oil 1L', sku: 'GRO-OIL-1L', barcode: '890123400104', category: 'Groceries', purchasePrice: 122, sellingPrice: 148, quantity: 82, minimumStock: 25, safetyStock: 20, supplierIdx: 1, unit: 'pouch', pattern: 'steady', baseDailyRate: 5.4 },
  { idx: 5, name: 'Organic Toor Dal 1kg', sku: 'GRO-TDAL-1K', barcode: '890123400105', category: 'Groceries', purchasePrice: 132, sellingPrice: 165, quantity: 0, minimumStock: 18, safetyStock: 14, supplierIdx: 1, unit: 'pack', pattern: 'steady', baseDailyRate: 2.9 }, // Out of stock
  { idx: 6, name: 'Britannia Digestive Biscuits 400g', sku: 'GRO-BISC-400', barcode: '890123400106', category: 'Groceries', purchasePrice: 64, sellingPrice: 85, quantity: 94, minimumStock: 25, safetyStock: 20, supplierIdx: 2, unit: 'pack', pattern: 'growing', baseDailyRate: 5.0 },
  { idx: 7, name: 'Extra Virgin Olive Oil 500ml', sku: 'GRO-OLIV-500', barcode: '890123400107', category: 'Groceries', purchasePrice: 410, sellingPrice: 525, quantity: 28, minimumStock: 12, safetyStock: 10, supplierIdx: 1, unit: 'bottle', pattern: 'growing', baseDailyRate: 1.8 },
  { idx: 8, name: 'Tata Iodized Salt 1kg', sku: 'GRO-SALT-1K', barcode: '890123400108', category: 'Groceries', purchasePrice: 20, sellingPrice: 28, quantity: 145, minimumStock: 35, safetyStock: 25, supplierIdx: 1, unit: 'pack', pattern: 'steady', baseDailyRate: 7.2 },

  // Beverages (6 items)
  { idx: 9, name: 'Bru Gold Filter Coffee 200g', sku: 'BEV-COFF-200', barcode: '890123400201', category: 'Beverages', purchasePrice: 245, sellingPrice: 315, quantity: 42, minimumStock: 15, safetyStock: 12, supplierIdx: 2, unit: 'jar', pattern: 'growing', baseDailyRate: 2.8 },
  { idx: 10, name: 'Tata Tea Gold Leaf 500g', sku: 'BEV-TEA-500', barcode: '890123400202', category: 'Beverages', purchasePrice: 215, sellingPrice: 275, quantity: 11, minimumStock: 18, safetyStock: 15, supplierIdx: 2, unit: 'pack', pattern: 'steady', baseDailyRate: 3.1 }, // Low stock
  { idx: 11, name: 'Bisleri Mineral Water 1L (Pack of 12)', sku: 'BEV-WATR-12L', barcode: '890123400203', category: 'Beverages', purchasePrice: 155, sellingPrice: 210, quantity: 76, minimumStock: 25, safetyStock: 20, supplierIdx: 2, unit: 'case', pattern: 'weekend', baseDailyRate: 4.5 },
  { idx: 12, name: 'Real Mixed Fruit Juice 1L', sku: 'BEV-JUIC-1L', barcode: '890123400204', category: 'Beverages', purchasePrice: 92, sellingPrice: 120, quantity: 58, minimumStock: 20, safetyStock: 15, supplierIdx: 2, unit: 'tetra', pattern: 'weekend', baseDailyRate: 3.4 },
  { idx: 13, name: 'Tetley Green Tea Lemon (25 Bags)', sku: 'BEV-GTEA-25', barcode: '890123400205', category: 'Beverages', purchasePrice: 118, sellingPrice: 155, quantity: 39, minimumStock: 12, safetyStock: 10, supplierIdx: 2, unit: 'box', pattern: 'growing', baseDailyRate: 2.1 },
  { idx: 14, name: 'Sparkling Cola 750ml', sku: 'BEV-COLA-750', barcode: '890123400206', category: 'Beverages', purchasePrice: 30, sellingPrice: 42, quantity: 120, minimumStock: 30, safetyStock: 24, supplierIdx: 2, unit: 'bottle', pattern: 'weekend', baseDailyRate: 6.0 },

  // Dairy (5 items)
  { idx: 15, name: 'Amul Taaza Toned Milk 1L', sku: 'DAI-MILK-1L', barcode: '890123400301', category: 'Dairy', purchasePrice: 56, sellingPrice: 68, quantity: 95, minimumStock: 35, safetyStock: 30, supplierIdx: 3, unit: 'tetra', pattern: 'steady', baseDailyRate: 11.5 },
  { idx: 16, name: 'Harvest Gold Whole Wheat Bread 400g', sku: 'DAI-BRED-400', barcode: '890123400302', category: 'Dairy', purchasePrice: 36, sellingPrice: 48, quantity: 12, minimumStock: 25, safetyStock: 20, supplierIdx: 3, unit: 'loaf', pattern: 'steady', baseDailyRate: 8.4 }, // Low stock
  { idx: 17, name: 'Amul Pasteurised Butter 500g', sku: 'DAI-BUTR-500', barcode: '890123400303', category: 'Dairy', purchasePrice: 238, sellingPrice: 285, quantity: 46, minimumStock: 15, safetyStock: 12, supplierIdx: 3, unit: 'pack', pattern: 'weekend', baseDailyRate: 2.6 },
  { idx: 18, name: 'Fresh Malai Paneer 200g', sku: 'DAI-PANR-200', barcode: '890123400304', category: 'Dairy', purchasePrice: 72, sellingPrice: 95, quantity: 34, minimumStock: 15, safetyStock: 12, supplierIdx: 3, unit: 'pack', pattern: 'weekend', baseDailyRate: 4.1 },
  { idx: 19, name: 'Greek Natural Curd 400g', sku: 'DAI-CURD-400', barcode: '890123400305', category: 'Dairy', purchasePrice: 52, sellingPrice: 70, quantity: 0, minimumStock: 15, safetyStock: 12, supplierIdx: 3, unit: 'tub', pattern: 'growing', baseDailyRate: 3.3 }, // Out of stock

  // Personal Care (5 items)
  { idx: 20, name: 'Dove Cream Beauty Bathing Bar (Pack of 4)', sku: 'PER-SOAP-4P', barcode: '890123400401', category: 'Personal Care', purchasePrice: 188, sellingPrice: 240, quantity: 52, minimumStock: 15, safetyStock: 12, supplierIdx: 4, unit: 'pack', pattern: 'steady', baseDailyRate: 2.4 },
  { idx: 21, name: 'Head & Shoulders Anti-Dandruff Shampoo 340ml', sku: 'PER-SHMP-340', barcode: '890123400402', category: 'Personal Care', purchasePrice: 265, sellingPrice: 345, quantity: 9, minimumStock: 14, safetyStock: 10, supplierIdx: 4, unit: 'bottle', pattern: 'growing', baseDailyRate: 1.9 }, // Low stock
  { idx: 22, name: 'Colgate Strong Teeth Toothpaste 200g', sku: 'PER-PAST-200', barcode: '890123400403', category: 'Personal Care', purchasePrice: 94, sellingPrice: 125, quantity: 78, minimumStock: 20, safetyStock: 15, supplierIdx: 4, unit: 'tube', pattern: 'steady', baseDailyRate: 3.2 },
  { idx: 23, name: 'Dettol Original Handwash Refill 750ml', sku: 'PER-HWSH-750', barcode: '890123400404', category: 'Personal Care', purchasePrice: 112, sellingPrice: 149, quantity: 44, minimumStock: 15, safetyStock: 12, supplierIdx: 4, unit: 'pouch', pattern: 'declining', baseDailyRate: 1.7 },
  { idx: 24, name: 'Nivea Soft Light Moisturiser 200ml', sku: 'PER-MOIS-200', barcode: '890123400405', category: 'Personal Care', purchasePrice: 195, sellingPrice: 260, quantity: 31, minimumStock: 10, safetyStock: 8, supplierIdx: 4, unit: 'jar', pattern: 'growing', baseDailyRate: 1.5 },

  // Household Items (4 items)
  { idx: 25, name: 'Surf Excel Matic Liquid Detergent 2L', sku: 'HOU-DETR-2L', barcode: '890123400501', category: 'Household Items', purchasePrice: 335, sellingPrice: 425, quantity: 36, minimumStock: 14, safetyStock: 12, supplierIdx: 5, unit: 'bottle', pattern: 'weekend', baseDailyRate: 2.2 },
  { idx: 26, name: 'Vim Concentrated Dishwash Gel 750ml', sku: 'HOU-DISH-750', barcode: '890123400502', category: 'Household Items', purchasePrice: 132, sellingPrice: 175, quantity: 62, minimumStock: 18, safetyStock: 14, supplierIdx: 5, unit: 'bottle', pattern: 'steady', baseDailyRate: 2.7 },
  { idx: 27, name: 'Lizol Citrus Disinfectant Floor Cleaner 2L', sku: 'HOU-FLOR-2L', barcode: '890123400503', category: 'Household Items', purchasePrice: 268, sellingPrice: 349, quantity: 10, minimumStock: 15, safetyStock: 12, supplierIdx: 5, unit: 'bottle', pattern: 'steady', baseDailyRate: 2.0 }, // Low stock
  { idx: 28, name: 'Origami Soft Kitchen Towel Rolls (Pack of 4)', sku: 'HOU-TOWL-4P', barcode: '890123400504', category: 'Household Items', purchasePrice: 145, sellingPrice: 195, quantity: 48, minimumStock: 15, safetyStock: 10, supplierIdx: 5, unit: 'pack', pattern: 'weekend', baseDailyRate: 2.3 },
];

// Deterministic pseudo-random helper so seeded numbers are realistic and reproducible
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export async function seedDemoDataIfNeeded(
  ownerId: string,
  forceSeed = false
): Promise<boolean> {
  try {
    const settingsRef = doc(db, 'settings', ownerId);
    const settingsSnap = await getDoc(settingsRef);
    if (!forceSeed && settingsSnap.exists() && settingsSnap.data().demoSeeded === true) {
      return false;
    }

    // Double check if sample products already exist for this user
    if (!forceSeed) {
      const existingSampleQ = query(
        collection(db, 'products'),
        where('ownerId', '==', ownerId)
      );
      const existingSnap = await getDocs(existingSampleQ);
      const hasSample = existingSnap.docs.some((d) => d.data().dataSource === 'sample');
      if (hasSample) {
        if (settingsSnap.exists()) {
          await commitInChunks([
            { type: 'update', ref: settingsRef, data: { demoSeeded: true, updatedAt: serverTimestamp() } },
          ]);
        }
        return false;
      }
    } else {
      // Clear any leftover sample docs first so immutable collections (sales, movements, forecasts, skuIndex)
      // do not trigger update-denied errors during restore
      await clearSampleData(ownerId);
    }

    // Check existing skuIndex docs for this owner to avoid colliding with real products using a sample SKU
    const existingSkuSnap = await getDocs(
      query(collection(db, 'skuIndex'), where('ownerId', '==', ownerId))
    );
    const existingSkuIds = new Set(existingSkuSnap.docs.map((d) => d.id));

    const uidShort = ownerId.slice(0, 8);
    const foundationOps: BatchOp[] = [];
    const dependentOps: BatchOp[] = [];

    // 1. Suppliers
    const supplierIdMap = new Map<number, string>();
    const supplierProductsMap = new Map<number, string[]>();
    for (const p of SAMPLE_PRODUCTS) {
      const list = supplierProductsMap.get(p.supplierIdx) ?? [];
      list.push(p.name);
      supplierProductsMap.set(p.supplierIdx, list);
    }

    for (const s of SAMPLE_SUPPLIERS) {
      const supplierId = `sample_sup_${uidShort}_${String(s.idx).padStart(2, '0')}`;
      supplierIdMap.set(s.idx, supplierId);
      foundationOps.push({
        type: 'set',
        ref: doc(db, 'suppliers', supplierId),
        data: {
          supplierId,
          ownerId,
          name: s.name,
          company: s.company,
          email: s.email,
          phone: s.phone,
          address: s.address,
          suppliedProducts: supplierProductsMap.get(s.idx) ?? [],
          leadTimeDays: s.leadTimeDays,
          status: 'active',
          dataSource: 'sample',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }

    // 2. Products + SKU index
    const productIdMap = new Map<number, string>();
    for (const p of SAMPLE_PRODUCTS) {
      const productId = `sample_prod_${uidShort}_${String(p.idx).padStart(2, '0')}`;
      productIdMap.set(p.idx, productId);
      const supplierId = supplierIdMap.get(p.supplierIdx) ?? '';
      const skuIndexId = buildSkuIndexId(ownerId, p.sku);

      if (!existingSkuIds.has(skuIndexId)) {
        foundationOps.push({
          type: 'set',
          ref: doc(db, 'skuIndex', skuIndexId),
          data: {
            ownerId,
            sku: p.sku,
            productId,
            createdAt: serverTimestamp(),
          },
        });
      }

      foundationOps.push({
        type: 'set',
        ref: doc(db, 'products', productId),
        data: {
          productId,
          ownerId,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category,
          description: `${p.name} — stocked in ${p.category} aisle (${p.unit}).`,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          quantity: p.quantity,
          minimumStock: p.minimumStock,
          safetyStock: p.safetyStock,
          supplierId,
          unit: p.unit,
          isActive: true,
          dataSource: 'sample',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }

    // 3. 90 Days of Historical Sales (2 invoices/day = 180 historical sales covering all 90 days)
    const paymentMethods = ['UPI', 'Cash', 'Card', 'UPI', 'Card', 'Credit'] as const;
    const now = new Date();
    const totalDays = 90;

    for (let dayOffset = totalDays - 1; dayOffset >= 0; dayOffset--) {
      const dayDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const dayOfWeek = dayDate.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const progress = (totalDays - 1 - dayOffset) / totalDays; // 0 -> 1 chronologically

      // Generate 2 baskets per day (morning & evening) so every day has realistic sales
      for (let shift = 0; shift < 2; shift++) {
        const saleIndex = (totalDays - 1 - dayOffset) * 2 + shift + 1;
        const saleId = `sample_sale_${uidShort}_${String(saleIndex).padStart(3, '0')}`;
        const basketDate = new Date(dayDate);
        basketDate.setHours(shift === 0 ? 10 : 18, Math.floor(pseudoRandom(saleIndex) * 50), 0, 0);

        const items: Array<{
          productId: string;
          productName: string;
          quantity: number;
          unitPrice: number;
          unitCost: number;
          subtotal: number;
        }> = [];

        let totalAmount = 0;
        let totalCost = 0;

        // Pick 5 to 7 products per shift deterministically across the catalog
        const startSlot = (saleIndex * 5) % SAMPLE_PRODUCTS.length;
        for (let k = 0; k < 6; k++) {
          const p = SAMPLE_PRODUCTS[(startSlot + k * 4) % SAMPLE_PRODUCTS.length];
          const pid = productIdMap.get(p.idx)!;
          if (items.some((i) => i.productId === pid)) continue;

          let multiplier = 1;
          if (p.pattern === 'growing') {
            multiplier = 0.65 + progress * 0.9; // Clear upward demand trend
          } else if (p.pattern === 'declining') {
            multiplier = 1.3 - progress * 0.55;
          } else if (p.pattern === 'weekend') {
            multiplier = isWeekend ? 1.65 : 0.75;
          }

          const noise = 0.75 + pseudoRandom(saleIndex * 31 + p.idx) * 0.5;
          const qty = Math.max(1, Math.round(p.baseDailyRate * multiplier * noise * 0.65));
          const subtotal = Math.round(qty * p.sellingPrice * 100) / 100;
          const costSub = Math.round(qty * p.purchasePrice * 100) / 100;

          items.push({
            productId: pid,
            productName: p.name,
            quantity: qty,
            unitPrice: p.sellingPrice,
            unitCost: p.purchasePrice,
            subtotal,
          });
          totalAmount += subtotal;
          totalCost += costSub;
        }

        totalAmount = Math.round(totalAmount * 100) / 100;
        totalCost = Math.round(totalCost * 100) / 100;
        const totalProfit = Math.round((totalAmount - totalCost) * 100) / 100;
        const pm = paymentMethods[saleIndex % paymentMethods.length];

        dependentOps.push({
          type: 'set',
          ref: doc(db, 'sales', saleId),
          data: {
            saleId,
            ownerId,
            invoiceNumber: `INV-SMP-${String(saleIndex).padStart(4, '0')}`,
            items,
            totalAmount,
            totalCost,
            totalProfit,
            paymentMethod: pm,
            saleDate: Timestamp.fromDate(basketDate),
            dataSource: 'sample',
            createdAt: serverTimestamp(),
          },
        });
      }
    }

    // 4. Stock Movements (realistic opening, restock, and adjustment entries)
    const sampleMovements = [
      { idx: 1, prodIdx: 1, type: 'STOCK_IN', qty: 80, prev: 20, next: 100, reason: 'Monthly grain restock from Deccan Agro' },
      { idx: 2, prodIdx: 15, type: 'STOCK_IN', qty: 120, prev: 15, next: 135, reason: 'Morning chilled dairy van receipt' },
      { idx: 3, prodIdx: 5, type: 'STOCK_OUT', qty: 18, prev: 18, next: 0, reason: 'Bulk wholesale counter dispatch' },
      { idx: 4, prodIdx: 19, type: 'STOCK_OUT', qty: 15, prev: 15, next: 0, reason: 'Weekend rush depletion' },
      { idx: 5, prodIdx: 16, type: 'ADJUSTMENT', qty: 3, prev: 15, next: 12, reason: 'Physical shelf count reconciliation' },
      { idx: 6, prodIdx: 21, type: 'STOCK_IN', qty: 24, prev: 5, next: 29, reason: 'PO delivery batch #1' },
      { idx: 7, prodIdx: 9, type: 'STOCK_IN', qty: 30, prev: 12, next: 42, reason: 'Nilgiri Beverages restock' },
      { idx: 8, prodIdx: 27, type: 'STOCK_OUT', qty: 8, prev: 18, next: 10, reason: 'Store housekeeping & bulk sale' },
    ] as const;

    for (const m of sampleMovements) {
      const movementId = `sample_mov_${uidShort}_${String(m.idx).padStart(2, '0')}`;
      const p = SAMPLE_PRODUCTS.find((x) => x.idx === m.prodIdx)!;
      dependentOps.push({
        type: 'set',
        ref: doc(db, 'stockMovements', movementId),
        data: {
          movementId,
          ownerId,
          productId: productIdMap.get(m.prodIdx)!,
          productName: p.name,
          movementType: m.type,
          quantity: m.qty,
          previousStock: m.prev,
          newStock: m.next,
          referenceId: `REF-SMP-${m.idx}`,
          reason: m.reason,
          dataSource: 'sample',
          createdAt: serverTimestamp(),
        },
      });
    }

    // 5. Purchase Orders across workflow statuses
    const poConfigs = [
      {
        idx: 1,
        poNumber: 'PO-SMP-1001',
        supplierIdx: 1,
        status: 'Ordered',
        daysAgo: 2,
        etaDays: 2,
        items: [
          { prodIdx: 2, orderedQty: 40, receivedQty: 0 },
          { prodIdx: 5, orderedQty: 50, receivedQty: 0 },
        ],
      },
      {
        idx: 2,
        poNumber: 'PO-SMP-1002',
        supplierIdx: 3,
        status: 'Pending',
        daysAgo: 1,
        etaDays: 1,
        items: [
          { prodIdx: 16, orderedQty: 45, receivedQty: 0 },
          { prodIdx: 19, orderedQty: 35, receivedQty: 0 },
        ],
      },
      {
        idx: 3,
        poNumber: 'PO-SMP-1003',
        supplierIdx: 4,
        status: 'Partially Received',
        daysAgo: 5,
        etaDays: 1,
        items: [
          { prodIdx: 21, orderedQty: 30, receivedQty: 15 },
          { prodIdx: 20, orderedQty: 25, receivedQty: 25 },
        ],
      },
      {
        idx: 4,
        poNumber: 'PO-SMP-1004',
        supplierIdx: 2,
        status: 'Received',
        daysAgo: 12,
        etaDays: -7,
        items: [
          { prodIdx: 9, orderedQty: 30, receivedQty: 30 },
          { prodIdx: 11, orderedQty: 40, receivedQty: 40 },
        ],
      },
    ] as const;

    for (const po of poConfigs) {
      const poId = `sample_po_${uidShort}_${String(po.idx).padStart(2, '0')}`;
      const sup = SAMPLE_SUPPLIERS.find((s) => s.idx === po.supplierIdx)!;
      const items = po.items.map((line) => {
        const prod = SAMPLE_PRODUCTS.find((p) => p.idx === line.prodIdx)!;
        return {
          productId: productIdMap.get(line.prodIdx)!,
          productName: prod.name,
          orderedQty: line.orderedQty,
          receivedQty: line.receivedQty,
          unitCost: prod.purchasePrice,
          subtotal: Math.round(line.orderedQty * prod.purchasePrice * 100) / 100,
        };
      });
      const totalAmount = Math.round(items.reduce((a, b) => a + b.subtotal, 0) * 100) / 100;
      const orderDate = new Date(now.getTime() - po.daysAgo * 24 * 60 * 60 * 1000);
      const etaDate = new Date(now.getTime() + po.etaDays * 24 * 60 * 60 * 1000);

      const poPayload: Record<string, unknown> = {
        purchaseOrderId: poId,
        ownerId,
        poNumber: po.poNumber,
        supplierId: supplierIdMap.get(po.supplierIdx)!,
        supplierName: sup.company,
        items,
        totalAmount,
        orderStatus: po.status,
        orderDate: Timestamp.fromDate(orderDate),
        expectedDeliveryDate: Timestamp.fromDate(etaDate),
        receiptIds: po.status === 'Received' || po.status === 'Partially Received' ? [`rcpt_${po.idx}`] : [],
        dataSource: 'sample',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (po.status === 'Received') {
        poPayload.receivedDate = Timestamp.fromDate(etaDate);
      }

      dependentOps.push({
        type: 'set',
        ref: doc(db, 'purchaseOrders', poId),
        data: poPayload,
      });
    }

    // 6. Initial deduplicated alerts for out-of-stock & low-stock sample items
    const initialAlerts = [
      {
        id: `sample_notif_${uidShort}_01`,
        title: 'Out of Stock: Organic Toor Dal 1kg',
        message: 'Organic Toor Dal 1kg has 0 packs remaining. Review PO-SMP-1001 or create an urgent order.',
        type: 'OUT_OF_STOCK',
        key: `oos_${productIdMap.get(5)}`,
      },
      {
        id: `sample_notif_${uidShort}_02`,
        title: 'Out of Stock: Greek Natural Curd 400g',
        message: 'Greek Natural Curd 400g has 0 tubs remaining. Daily dairy replenishment needed.',
        type: 'OUT_OF_STOCK',
        key: `oos_${productIdMap.get(19)}`,
      },
      {
        id: `sample_notif_${uidShort}_03`,
        title: 'Low Stock Alert: Aashirvaad Whole Wheat Flour 10kg',
        message: '14 bags remaining (minimum stock threshold: 20 bags).',
        type: 'LOW_STOCK',
        key: `low_${productIdMap.get(2)}`,
      },
    ];

    for (const a of initialAlerts) {
      dependentOps.push({
        type: 'set',
        ref: doc(db, 'notifications', a.id),
        data: {
          notificationId: a.id,
          ownerId,
          title: a.title,
          message: a.message,
          notificationType: a.type,
          conditionKey: a.key,
          isRead: false,
          createdAt: serverTimestamp(),
        },
      });
    }

    // 7. Initial sample forecast records
    const sampleForecastProducts = [
      { idx: 1, prodIdx: 1, algo: 'WEIGHTED_MOVING_AVERAGE', trend: 'Stable', base: 4.3, mae: 1.18 },
      { idx: 2, prodIdx: 9, algo: 'LINEAR_REGRESSION', trend: 'Increasing', base: 3.1, mae: 0.94 },
    ] as const;

    for (const fc of sampleForecastProducts) {
      const p = SAMPLE_PRODUCTS.find((x) => x.idx === fc.prodIdx)!;
      const fcId = `sample_fc_${uidShort}_${String(fc.idx).padStart(2, '0')}`;
      const preds = Array.from({ length: 7 }, (_, i) => {
        const dt = new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
        return {
          periodKey: dt.toISOString().slice(0, 10),
          label: dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          predictedQty: Math.round((fc.base + (fc.trend === 'Increasing' ? i * 0.15 : 0)) * 100) / 100,
        };
      });
      dependentOps.push({
        type: 'set',
        ref: doc(db, 'forecasts', fcId),
        data: {
          forecastId: fcId,
          ownerId,
          productId: productIdMap.get(fc.prodIdx)!,
          productName: p.name,
          algorithm: fc.algo,
          aggregation: 'daily',
          forecastHorizon: 7,
          predictions: preds,
          evaluationMetrics: {
            mae: fc.mae,
            trainCount: 76,
            testCount: 14,
            totalPeriods: 90,
            limitedHistory: false,
            insufficientData: false,
            trend: fc.trend,
            averageHistoricalDemand: fc.base,
            note: 'Baseline seeded forecast validated on chronological holdout split.',
          },
          generatedAt: serverTimestamp(),
          dataSource: 'sample',
        },
      });
    }

    // 8. Mark demoSeeded = true on settings
    if (settingsSnap.exists()) {
      dependentOps.push({
        type: 'update',
        ref: settingsRef,
        data: {
          demoSeeded: true,
          updatedAt: serverTimestamp(),
        },
      });
    } else {
      dependentOps.push({
        type: 'set',
        ref: settingsRef,
        data: {
          ownerId,
          storeName: 'FreshMart Superstore',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          defaultSafetyStock: 15,
          defaultLeadTimeDays: 5,
          lowStockThreshold: 20,
          theme: 'light',
          demoSeeded: true,
          updatedAt: serverTimestamp(),
        },
      });
    }

    // Commit suppliers & products first so Firestore rules validating supplier existence on POs pass
    await commitInChunks(foundationOps);
    await commitInChunks(dependentOps);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'demoSeeder');
  }
}

export async function clearSampleData(ownerId: string): Promise<number> {
  try {
    const collectionsToClean = [
      'products',
      'suppliers',
      'sales',
      'stockMovements',
      'purchaseOrders',
      'forecasts',
    ] as const;

    const ops: BatchOp[] = [];
    const deletedSampleProductIds = new Set<string>();

    for (const colName of collectionsToClean) {
      const q = query(
        collection(db, colName),
        where('ownerId', '==', ownerId)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (d.data().dataSource !== 'sample') continue;
        ops.push({ type: 'delete', ref: d.ref });
        if (colName === 'products') {
          deletedSampleProductIds.add(String(d.data().productId || d.id));
        }
      }
    }

    // Delete only existing skuIndex docs that point to deleted sample products
    if (deletedSampleProductIds.size > 0) {
      const skuSnap = await getDocs(
        query(collection(db, 'skuIndex'), where('ownerId', '==', ownerId))
      );
      for (const d of skuSnap.docs) {
        if (deletedSampleProductIds.has(String(d.data().productId || ''))) {
          ops.push({ type: 'delete', ref: d.ref });
        }
      }
    }

    // Also clean seeded sample notifications without touching real operational alerts
    const notifQ = query(collection(db, 'notifications'), where('ownerId', '==', ownerId));
    const notifSnap = await getDocs(notifQ);
    for (const d of notifSnap.docs) {
      if (String(d.id).startsWith('sample_notif_')) {
        ops.push({ type: 'delete', ref: d.ref });
      }
    }

    const deletedCount = ops.length;
    await commitInChunks(ops);
    return deletedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'clearSampleData');
  }
}
