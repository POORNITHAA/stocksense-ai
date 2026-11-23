import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import { createDeduplicatedNotification } from './notificationService';

export async function recordStockMovement(params: {
  ownerId: string;
  productId: string;
  operation: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';
  quantityOrNewStock: number;
  reason: string;
}): Promise<{ previousStock: number; newStock: number }> {
  const { ownerId, productId, operation, quantityOrNewStock, reason } = params;
  if (!reason.trim()) throw new Error('A reason is required for stock operations.');
  if (!Number.isFinite(quantityOrNewStock) || quantityOrNewStock < 0) {
    throw new Error('Quantity must be zero or positive.');
  }
  if (operation !== 'ADJUSTMENT' && quantityOrNewStock <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  const productRef = doc(db, 'products', productId);
  const movementId = generateId('mov');
  let result = { previousStock: 0, newStock: 0, productName: '', minimumStock: 0 };

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists()) throw new Error('Selected product not found.');
      const data = snap.data();
      if (data.ownerId !== ownerId) throw new Error('Unauthorized product access.');

      const prevStock = Number(data.quantity) || 0;
      let nextStock = prevStock;
      let deltaQty = quantityOrNewStock;

      if (operation === 'STOCK_IN') {
        nextStock = prevStock + quantityOrNewStock;
      } else if (operation === 'STOCK_OUT') {
        if (prevStock < quantityOrNewStock) {
          throw new Error(
            `Insufficient stock for ${data.name}. Available: ${prevStock}, Requested: ${quantityOrNewStock}.`
          );
        }
        nextStock = prevStock - quantityOrNewStock;
      } else {
        nextStock = quantityOrNewStock;
        deltaQty = Math.abs(nextStock - prevStock);
      }

      tx.update(productRef, {
        quantity: nextStock,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'stockMovements', movementId), {
        movementId,
        ownerId,
        productId,
        productName: String(data.name).slice(0, 160),
        movementType: operation,
        quantity: deltaQty,
        previousStock: prevStock,
        newStock: nextStock,
        reason: reason.trim().slice(0, 300),
        dataSource: 'real',
        createdAt: serverTimestamp(),
      });

      result = {
        previousStock: prevStock,
        newStock: nextStock,
        productName: String(data.name),
        minimumStock: Number(data.minimumStock) || 0,
      };
    });

    // Fire deduplicated stock alert if low or out of stock
    if (result.newStock === 0) {
      await createDeduplicatedNotification({
        ownerId,
        title: `Out of Stock: ${result.productName}`,
        message: `${result.productName} reached 0 units after ${operation.replace('_', ' ')}. Immediate reorder advised.`,
        notificationType: 'OUT_OF_STOCK',
        conditionKey: `oos_${productId}`,
      });
    } else if (result.newStock <= result.minimumStock) {
      await createDeduplicatedNotification({
        ownerId,
        title: `Low Stock Alert: ${result.productName}`,
        message: `${result.productName} is at ${result.newStock} units (below minimum ${result.minimumStock}).`,
        notificationType: 'LOW_STOCK',
        conditionKey: `low_${productId}`,
      });
    }

    return { previousStock: result.previousStock, newStock: result.newStock };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient stock') ||
        error.message.includes('not found') ||
        error.message.includes('required') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('must be'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `products/${productId}`);
  }
}
