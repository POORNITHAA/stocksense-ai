import { deleteDoc, doc, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import type { PurchaseOrderItem, PurchaseOrderStatus } from '../types';
import { createDeduplicatedNotification } from './notificationService';

export interface CreatePurchaseOrderInput {
  supplierId: string;
  supplierName: string;
  expectedDeliveryDate: Date;
  initialStatus?: 'Draft' | 'Pending' | 'Approved' | 'Ordered';
  items: Array<{
    productId: string;
    productName: string;
    orderedQty: number;
    unitCost: number;
  }>;
}

export async function createPurchaseOrder(
  ownerId: string,
  input: CreatePurchaseOrderInput
): Promise<{ purchaseOrderId: string; poNumber: string }> {
  if (!input.supplierId) throw new Error('Supplier is required.');
  if (!input.items.length) throw new Error('Add at least one item to the purchase order.');

  const purchaseOrderId = generateId('po');
  const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${purchaseOrderId.slice(-5).toUpperCase()}`;
  const path = `purchaseOrders/${purchaseOrderId}`;

  // Consolidate duplicate product rows so every productId appears once per PO
  const lineMap = new Map<string, PurchaseOrderItem>();
  for (const item of input.items) {
    const qty = Number(item.orderedQty);
    const cost = Number(item.unitCost);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Invalid quantity for ${item.productName}.`);
    }
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error(`Invalid unit cost for ${item.productName}.`);
    }
    const existing = lineMap.get(item.productId);
    if (existing) {
      const combinedQty = existing.orderedQty + qty;
      lineMap.set(item.productId, {
        ...existing,
        orderedQty: combinedQty,
        unitCost: cost,
        subtotal: Math.round(combinedQty * cost * 100) / 100,
      });
    } else {
      lineMap.set(item.productId, {
        productId: item.productId,
        productName: item.productName.slice(0, 160),
        orderedQty: qty,
        receivedQty: 0,
        unitCost: cost,
        subtotal: Math.round(qty * cost * 100) / 100,
      });
    }
  }
  const items: PurchaseOrderItem[] = Array.from(lineMap.values());

  const totalAmount = Math.round(
    items.reduce((acc, i) => acc + i.subtotal, 0) * 100
  ) / 100;

  try {
    await setDoc(doc(db, 'purchaseOrders', purchaseOrderId), {
      purchaseOrderId,
      ownerId,
      poNumber,
      supplierId: input.supplierId,
      supplierName: input.supplierName.slice(0, 160),
      items,
      totalAmount,
      orderStatus: input.initialStatus ?? 'Pending',
      orderDate: Timestamp.fromDate(new Date()),
      expectedDeliveryDate: Timestamp.fromDate(input.expectedDeliveryDate),
      receiptIds: [],
      dataSource: 'real',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createDeduplicatedNotification({
      ownerId,
      title: `Purchase Order Created: ${poNumber}`,
      message: `Created ${poNumber} for ${input.supplierName} (${items.length} items). Inventory will update only upon goods receipt.`,
      notificationType: 'PURCHASE_ORDER',
      conditionKey: `po_created_${purchaseOrderId}`,
    });

    return { purchaseOrderId, poNumber };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePurchaseOrderStatus(
  ownerId: string,
  purchaseOrderId: string,
  poNumber: string,
  nextStatus: Exclude<PurchaseOrderStatus, 'Partially Received' | 'Received'>
): Promise<void> {
  const path = `purchaseOrders/${purchaseOrderId}`;
  try {
    await updateDoc(doc(db, 'purchaseOrders', purchaseOrderId), {
      orderStatus: nextStatus,
      updatedAt: serverTimestamp(),
    });

    await createDeduplicatedNotification({
      ownerId,
      title: `PO ${poNumber} ${nextStatus}`,
      message: `Purchase order ${poNumber} status updated to ${nextStatus}.`,
      notificationType: 'PURCHASE_ORDER',
      conditionKey: `po_status_${purchaseOrderId}_${nextStatus}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePurchaseOrder(purchaseOrderId: string): Promise<void> {
  const path = `purchaseOrders/${purchaseOrderId}`;
  try {
    await deleteDoc(doc(db, 'purchaseOrders', purchaseOrderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function receivePurchaseOrderItems(params: {
  ownerId: string;
  purchaseOrderId: string;
  receiptId: string; // Idempotency key preventing duplicate receiving
  receivedQuantities: Record<string, number>; // productId -> newly received qty
}): Promise<{ newStatus: PurchaseOrderStatus; totalUnitsReceived: number }> {
  const { ownerId, purchaseOrderId, receiptId, receivedQuantities } = params;
  const poRef = doc(db, 'purchaseOrders', purchaseOrderId);
  let newStatus: PurchaseOrderStatus = 'Partially Received';
  let totalUnitsReceived = 0;
  let poNumber = '';

  try {
    await runTransaction(db, async (tx) => {
      const poSnap = await tx.get(poRef);
      if (!poSnap.exists()) throw new Error('Purchase order not found.');
      const po = poSnap.data();
      if (po.ownerId !== ownerId) throw new Error('Unauthorized purchase order access.');

      if (po.orderStatus === 'Received' || po.orderStatus === 'Cancelled') {
        throw new Error(`Cannot receive goods for a ${po.orderStatus} purchase order.`);
      }

      const existingReceiptIds: string[] = Array.isArray(po.receiptIds) ? po.receiptIds : [];
      if (existingReceiptIds.includes(receiptId)) {
        throw new Error('This goods receipt batch was already processed.');
      }

      const currentItems = (po.items as PurchaseOrderItem[]) ?? [];
      const toReceive = currentItems.filter((item) => (receivedQuantities[item.productId] ?? 0) > 0);
      if (toReceive.length === 0) {
        throw new Error('Enter at least one received quantity greater than zero.');
      }

      // Read all affected products first (Firestore transaction requirement: all reads before writes)
      const productSnaps = await Promise.all(
        toReceive.map((item) => tx.get(doc(db, 'products', item.productId)))
      );

      const productMap = new Map<string, { currentQty: number; name: string }>();
      for (let i = 0; i < toReceive.length; i++) {
        const snap = productSnaps[i];
        if (!snap.exists()) {
          throw new Error(`Product "${toReceive[i].productName}" was not found.`);
        }
        const pData = snap.data();
        if (pData.ownerId !== ownerId) {
          throw new Error('Unauthorized product update.');
        }
        productMap.set(toReceive[i].productId, {
          currentQty: Number(pData.quantity) || 0,
          name: String(pData.name),
        });
      }

      const updatedItems: PurchaseOrderItem[] = currentItems.map((item) => {
        const incomingQty = Number(receivedQuantities[item.productId] ?? 0);
        if (incomingQty <= 0) return item;

        const remaining = Math.max(0, item.orderedQty - item.receivedQty);
        if (incomingQty > remaining) {
          throw new Error(
            `Cannot receive ${incomingQty} of "${item.productName}" — only ${remaining} remaining.`
          );
        }
        totalUnitsReceived += incomingQty;
        return {
          ...item,
          receivedQty: item.receivedQty + incomingQty,
        };
      });

      const allReceived = updatedItems.every((i) => i.receivedQty >= i.orderedQty);
      newStatus = allReceived ? 'Received' : 'Partially Received';
      poNumber = String(po.poNumber);

      // Update product stocks and record stock movements atomically
      for (const item of toReceive) {
        const incomingQty = Number(receivedQuantities[item.productId] ?? 0);
        const prodInfo = productMap.get(item.productId)!;
        const nextQty = Math.round((prodInfo.currentQty + incomingQty) * 100) / 100;

        tx.update(doc(db, 'products', item.productId), {
          quantity: nextQty,
          updatedAt: serverTimestamp(),
        });

        const movementId = generateId('mov');
        tx.set(doc(db, 'stockMovements', movementId), {
          movementId,
          ownerId,
          productId: item.productId,
          productName: prodInfo.name.slice(0, 160),
          movementType: 'PURCHASE_RECEIPT',
          quantity: incomingQty,
          previousStock: prodInfo.currentQty,
          newStock: nextQty,
          referenceId: poNumber,
          reason: `Goods received for ${poNumber} (${receiptId.slice(-6)})`,
          dataSource: 'real',
          createdAt: serverTimestamp(),
        });
      }

      const poUpdates: Record<string, unknown> = {
        items: updatedItems,
        orderStatus: newStatus,
        receiptIds: [...existingReceiptIds, receiptId].slice(-50),
        updatedAt: serverTimestamp(),
      };
      if (allReceived) {
        poUpdates.receivedDate = serverTimestamp();
      }
      tx.update(poRef, poUpdates);
    });

    await createDeduplicatedNotification({
      ownerId,
      title: `Goods Received: ${poNumber}`,
      message: `Received ${totalUnitsReceived} units for ${poNumber}. Status is now ${newStatus}.`,
      notificationType: 'PURCHASE_ORDER',
      conditionKey: `po_recv_${purchaseOrderId}_${receiptId}`,
    });

    return { newStatus, totalUnitsReceived };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Cannot receive') ||
        error.message.includes('already processed') ||
        error.message.includes('Enter at least one') ||
        error.message.includes('not found') ||
        error.message.includes('Unauthorized'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `purchaseOrders/${purchaseOrderId}`);
  }
}
