import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Product } from '../types';

export function buildSkuIndexId(ownerId: string, sku: string): string {
  const normalized = sku.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  return `${ownerId}__${normalized}`.slice(0, 128);
}

export interface ProductInput {
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
}

function validateProductInput(input: ProductInput, isCreate: boolean): void {
  if (!input.name.trim()) throw new Error('Product name is required.');
  if (!input.sku.trim()) throw new Error('SKU is required.');
  if (!input.category.trim()) throw new Error('Category is required.');
  if (!input.unit.trim()) throw new Error('Unit is required.');
  if (!Number.isFinite(input.purchasePrice) || input.purchasePrice < 0) {
    throw new Error('Purchase price must be a non-negative number.');
  }
  if (!Number.isFinite(input.sellingPrice) || input.sellingPrice < 0) {
    throw new Error('Selling price must be a non-negative number.');
  }
  if (isCreate && (!Number.isFinite(input.quantity) || input.quantity < 0)) {
    throw new Error('Initial quantity must be non-negative.');
  }
  if (!Number.isFinite(input.minimumStock) || input.minimumStock < 0) {
    throw new Error('Minimum stock must be non-negative.');
  }
  if (!Number.isFinite(input.safetyStock) || input.safetyStock < 0) {
    throw new Error('Safety stock must be non-negative.');
  }
  if (input.imageUrl && input.imageUrl.trim().length > 65536) {
    throw new Error('Product image exceeds the 64KB limit.');
  }
}

export async function createProduct(ownerId: string, input: ProductInput): Promise<string> {
  validateProductInput(input, true);

  const productId = generateId('prod');
  const skuUpper = input.sku.trim().toUpperCase();
  const skuIndexId = buildSkuIndexId(ownerId, skuUpper);
  const path = `products/${productId}`;

  try {
    await runTransaction(db, async (tx) => {
      const skuRef = doc(db, 'skuIndex', skuIndexId);
      const skuSnap = await tx.get(skuRef);
      if (skuSnap.exists()) {
        throw new Error(`A product with SKU "${skuUpper}" already exists.`);
      }

      const productRef = doc(db, 'products', productId);
      const payload: Record<string, unknown> = {
        productId,
        ownerId,
        name: input.name.trim().slice(0, 160),
        sku: skuUpper.slice(0, 64),
        category: input.category.trim().slice(0, 80),
        purchasePrice: Number(input.purchasePrice),
        sellingPrice: Number(input.sellingPrice),
        quantity: Number(input.quantity),
        minimumStock: Number(input.minimumStock),
        safetyStock: Number(input.safetyStock),
        unit: input.unit.trim().slice(0, 32),
        isActive: true,
        dataSource: 'real',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (input.barcode?.trim()) payload.barcode = input.barcode.trim().slice(0, 64);
      if (input.description?.trim()) payload.description = input.description.trim().slice(0, 1000);
      if (input.imageUrl?.trim()) payload.imageUrl = input.imageUrl.trim();
      if (input.supplierId?.trim()) payload.supplierId = input.supplierId.trim().slice(0, 128);

      tx.set(skuRef, {
        ownerId,
        sku: skuUpper.slice(0, 64),
        productId,
        createdAt: serverTimestamp(),
      });
      tx.set(productRef, payload);

      if (Number(input.quantity) > 0) {
        const movementId = generateId('mov');
        tx.set(doc(db, 'stockMovements', movementId), {
          movementId,
          ownerId,
          productId,
          productName: input.name.trim().slice(0, 160),
          movementType: 'STOCK_IN',
          quantity: Number(input.quantity),
          previousStock: 0,
          newStock: Number(input.quantity),
          referenceId: productId,
          reason: 'Initial product opening stock',
          dataSource: 'real',
          createdAt: serverTimestamp(),
        });
      }
    });
    return productId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProduct(
  ownerId: string,
  existingProduct: Product,
  input: Omit<ProductInput, 'quantity'>
): Promise<void> {
  validateProductInput({ ...input, quantity: existingProduct.quantity }, false);
  const newSkuUpper = input.sku.trim().toUpperCase();
  const oldSkuUpper = existingProduct.sku.trim().toUpperCase();
  const path = `products/${existingProduct.productId}`;

  try {
    await runTransaction(db, async (tx) => {
      const productRef = doc(db, 'products', existingProduct.productId);
      if (newSkuUpper !== oldSkuUpper) {
        const oldIdxRef = doc(db, 'skuIndex', buildSkuIndexId(ownerId, oldSkuUpper));
        const newIdxRef = doc(db, 'skuIndex', buildSkuIndexId(ownerId, newSkuUpper));
        const newIdxSnap = await tx.get(newIdxRef);
        if (newIdxSnap.exists()) {
          throw new Error(`SKU "${newSkuUpper}" is already assigned to another product.`);
        }
        tx.delete(oldIdxRef);
        tx.set(newIdxRef, {
          ownerId,
          sku: newSkuUpper.slice(0, 64),
          productId: existingProduct.productId,
          createdAt: serverTimestamp(),
        });
      }

      const updates: Record<string, unknown> = {
        name: input.name.trim().slice(0, 160),
        sku: newSkuUpper.slice(0, 64),
        category: input.category.trim().slice(0, 80),
        purchasePrice: Number(input.purchasePrice),
        sellingPrice: Number(input.sellingPrice),
        minimumStock: Number(input.minimumStock),
        safetyStock: Number(input.safetyStock),
        unit: input.unit.trim().slice(0, 32),
        barcode: input.barcode?.trim() ? input.barcode.trim().slice(0, 64) : '',
        description: input.description?.trim() ? input.description.trim().slice(0, 1000) : '',
        imageUrl: input.imageUrl?.trim() ? input.imageUrl.trim() : '',
        supplierId: input.supplierId?.trim() ? input.supplierId.trim().slice(0, 128) : '',
        updatedAt: serverTimestamp(),
      };
      tx.update(productRef, updates);
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already assigned')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleProductActive(
  productId: string,
  isActive: boolean
): Promise<void> {
  const path = `products/${productId}`;
  try {
    await updateDoc(doc(db, 'products', productId), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProduct(ownerId: string, product: Product): Promise<void> {
  const path = `products/${product.productId}`;
  const skuIndexId = buildSkuIndexId(ownerId, product.sku);
  try {
    await runTransaction(db, async (tx) => {
      const productRef = doc(db, 'products', product.productId);
      const skuRef = doc(db, 'skuIndex', skuIndexId);
      const [prodSnap, skuSnap] = await Promise.all([tx.get(productRef), tx.get(skuRef)]);
      if (!prodSnap.exists()) return;
      if (skuSnap.exists() && skuSnap.data().productId === product.productId) {
        tx.delete(skuRef);
      }
      tx.delete(productRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
