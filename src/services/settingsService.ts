import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { StoreSettings } from '../types';

export async function ensureStoreSettings(ownerId: string): Promise<StoreSettings> {
  const path = `settings/${ownerId}`;
  try {
    const ref = doc(db, 'settings', ownerId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as StoreSettings;
    }

    const defaults = {
      ownerId,
      storeName: 'FreshMart Superstore',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      defaultSafetyStock: 15,
      defaultLeadTimeDays: 5,
      lowStockThreshold: 20,
      theme: 'light' as const,
      demoSeeded: false,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, defaults);
    const created = await getDoc(ref);
    return created.data() as StoreSettings;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateStoreSettings(
  ownerId: string,
  updates: Partial<
    Pick<
      StoreSettings,
      | 'storeName'
      | 'currency'
      | 'timezone'
      | 'defaultSafetyStock'
      | 'defaultLeadTimeDays'
      | 'lowStockThreshold'
      | 'theme'
      | 'demoSeeded'
    >
  >
): Promise<void> {
  const path = `settings/${ownerId}`;
  try {
    await updateDoc(doc(db, 'settings', ownerId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
