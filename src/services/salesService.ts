import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import type { PaymentMethod, SaleItem } from '../types';
import { createDeduplicatedNotification } from './notificationService';

export interface CreateSaleLineInput {
  productId: string;
  quantity: number;
}

export async function createSaleTransaction(params: {
  ownerId: string;
  saleId: string; // Pre-generated idempotency key per checkout modal
  items: CreateSaleLineInput[];
  paymentMethod: PaymentMethod;
  saleDate?: Date;
}): Promise<{ saleId: string; invoiceNumber: string; totalAmount: number }> {
  const { ownerId, saleId, items, paymentMethod, saleDate } = params;
  if (!items.length) throw new Error('Add at least one product to complete a sale.');

  // Consolidate duplicate product lines
  const consolidated = new Map<string, number>();
  for (const item of items) {
    if (item.quantity <= 0 || !Number.isFinite(item.quantity)) {
      throw new Error('Item quantities must be greater than zero.');
    }
    consolidated.set(
      item.productId,
      (consolidated.get(item.productId) ?? 0) + Number(item.quantity)
    );
  }

  const saleRef = doc(db, 'sales', saleId);
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${saleId.slice(-5).toUpperCase()}`;

  const alertsToCreate: Array<{
    productId: string;
    name: string;
    newStock: number;
    minStock: number;
  }> = [];

  let finalTotal = 0;

  try {
    await runTransaction(db, async (tx) => {
      // Idempotency guard against duplicate submissions
      const existingSale = await tx.get(saleRef);
      if (existingSale.exists()) {
        throw new Error('This sale transaction has already been recorded.');
      }

      const productRefs = Array.from(consolidated.keys()).map((pid) =>
        doc(db, 'products', pid)
      );
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

      const saleItems: SaleItem[] = [];
      let totalAmount = 0;
      let totalCost = 0;

      for (let i = 0; i < productSnaps.length; i++) {
        const snap = productSnaps[i];
        if (!snap.exists()) {
          throw new Error('One or more selected products no longer exist.');
        }
        const p = snap.data();
        if (p.ownerId !== ownerId) {
          throw new Error('Unauthorized product reference.');
        }
        if (p.isActive === false) {
          throw new Error(`Product "${p.name}" is inactive and cannot be sold.`);
        }

        const pid = String(p.productId);
        const qty = consolidated.get(pid) ?? 0;
        const currentStock = Number(p.quantity) || 0;
        if (currentStock < qty) {
          throw new Error(
            `Insufficient stock for "${p.name}". Available: ${currentStock}, Requested: ${qty}.`
          );
        }

        const unitPrice = Number(p.sellingPrice) || 0;
        const unitCost = Number(p.purchasePrice) || 0;
        const subtotal = Math.round(unitPrice * qty * 100) / 100;
        const costSubtotal = Math.round(unitCost * qty * 100) / 100;
        const newStock = Math.round((currentStock - qty) * 100) / 100;

        totalAmount += subtotal;
        totalCost += costSubtotal;

        saleItems.push({
          productId: pid,
          productName: String(p.name).slice(0, 160),
          quantity: qty,
          unitPrice,
          unitCost,
          subtotal,
        });

        tx.update(productRefs[i], {
          quantity: newStock,
          updatedAt: serverTimestamp(),
        });

        const movementId = generateId('mov');
        tx.set(doc(db, 'stockMovements', movementId), {
          movementId,
          ownerId,
          productId: pid,
          productName: String(p.name).slice(0, 160),
          movementType: 'SALE',
          quantity: qty,
          previousStock: currentStock,
          newStock,
          referenceId: invoiceNumber,
          reason: `POS Sale ${invoiceNumber}`,
          dataSource: 'real',
          createdAt: serverTimestamp(),
        });

        const minStock = Number(p.minimumStock) || 0;
        if (newStock === 0 || newStock <= minStock) {
          alertsToCreate.push({
            productId: pid,
            name: String(p.name),
            newStock,
            minStock,
          });
        }
      }

      totalAmount = Math.round(totalAmount * 100) / 100;
      totalCost = Math.round(totalCost * 100) / 100;
      const totalProfit = Math.round((totalAmount - totalCost) * 100) / 100;
      finalTotal = totalAmount;

      tx.set(saleRef, {
        saleId,
        ownerId,
        invoiceNumber,
        items: saleItems,
        totalAmount,
        totalCost,
        totalProfit,
        paymentMethod,
        saleDate: Timestamp.fromDate(saleDate ?? new Date()),
        dataSource: 'real',
        createdAt: serverTimestamp(),
      });
    });

    for (const alert of alertsToCreate) {
      if (alert.newStock === 0) {
        await createDeduplicatedNotification({
          ownerId,
          title: `Out of Stock: ${alert.name}`,
          message: `${alert.name} just sold out (0 remaining). Create a purchase order to restock.`,
          notificationType: 'OUT_OF_STOCK',
          conditionKey: `oos_${alert.productId}`,
        });
      } else {
        await createDeduplicatedNotification({
          ownerId,
          title: `Low Stock Alert: ${alert.name}`,
          message: `${alert.name} dropped to ${alert.newStock} units (minimum: ${alert.minStock}).`,
          notificationType: 'LOW_STOCK',
          conditionKey: `low_${alert.productId}`,
        });
      }
    }

    return { saleId, invoiceNumber, totalAmount: finalTotal };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient stock') ||
        error.message.includes('already been recorded') ||
        error.message.includes('inactive') ||
        error.message.includes('no longer exist') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('Add at least one') ||
        error.message.includes('must be greater than zero'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `sales/${saleId}`);
  }
}
