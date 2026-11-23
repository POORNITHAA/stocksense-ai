import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';

export interface SupplierInput {
  name: string;
  company: string;
  email: string;
  phone: string;
  address?: string;
  suppliedProducts: string[];
  leadTimeDays: number;
  status: 'active' | 'inactive';
}

function validateSupplierInput(input: SupplierInput): void {
  if (!input.name.trim()) throw new Error('Contact name is required.');
  if (!input.company.trim()) throw new Error('Company name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new Error('Please enter a valid supplier email address.');
  }
  if (input.phone.trim().length < 7) {
    throw new Error('Please enter a valid supplier phone number.');
  }
  if (!Number.isFinite(input.leadTimeDays) || input.leadTimeDays < 1 || input.leadTimeDays > 365) {
    throw new Error('Lead time must be between 1 and 365 days.');
  }
}

export async function createSupplier(
  ownerId: string,
  input: SupplierInput,
  mappedProductIds: string[] = []
): Promise<string> {
  validateSupplierInput(input);
  const supplierId = generateId('sup');
  const path = `suppliers/${supplierId}`;

  try {
    const payload: Record<string, unknown> = {
      supplierId,
      ownerId,
      name: input.name.trim().slice(0, 120),
      company: input.company.trim().slice(0, 160),
      email: input.email.trim().slice(0, 200),
      phone: input.phone.trim().slice(0, 32),
      suppliedProducts: input.suppliedProducts.slice(0, 100),
      leadTimeDays: Number(input.leadTimeDays),
      status: input.status,
      dataSource: 'real',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.address?.trim()) {
      payload.address = input.address.trim().slice(0, 300);
    }
    await setDoc(doc(db, 'suppliers', supplierId), payload);

    if (mappedProductIds.length > 0) {
      await syncSupplierProductLinks(supplierId, mappedProductIds, []);
    }
    return supplierId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSupplier(
  supplierId: string,
  input: SupplierInput,
  mappedProductIds?: string[],
  currentlyMappedIds?: string[]
): Promise<void> {
  validateSupplierInput(input);
  const path = `suppliers/${supplierId}`;

  try {
    await updateDoc(doc(db, 'suppliers', supplierId), {
      name: input.name.trim().slice(0, 120),
      company: input.company.trim().slice(0, 160),
      email: input.email.trim().slice(0, 200),
      phone: input.phone.trim().slice(0, 32),
      address: input.address?.trim() ? input.address.trim().slice(0, 300) : '',
      suppliedProducts: input.suppliedProducts.slice(0, 100),
      leadTimeDays: Number(input.leadTimeDays),
      status: input.status,
      updatedAt: serverTimestamp(),
    });

    if (mappedProductIds && currentlyMappedIds) {
      await syncSupplierProductLinks(supplierId, mappedProductIds, currentlyMappedIds);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function syncSupplierProductLinks(
  supplierId: string,
  nextIds: string[],
  prevIds: string[]
): Promise<void> {
  const nextSet = new Set(nextIds);
  const prevSet = new Set(prevIds);
  const toLink = nextIds.filter((id) => !prevSet.has(id));
  const toUnlink = prevIds.filter((id) => !nextSet.has(id));
  if (toLink.length === 0 && toUnlink.length === 0) return;

  const batch = writeBatch(db);
  for (const pid of toLink) {
    batch.update(doc(db, 'products', pid), {
      supplierId,
      updatedAt: serverTimestamp(),
    });
  }
  for (const pid of toUnlink) {
    batch.update(doc(db, 'products', pid), {
      supplierId: '',
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function deleteSupplier(
  supplierId: string,
  currentlyMappedProductIds: string[] = []
): Promise<void> {
  const path = `suppliers/${supplierId}`;
  try {
    if (currentlyMappedProductIds.length > 0) {
      const batch = writeBatch(db);
      for (const pid of currentlyMappedProductIds) {
        batch.update(doc(db, 'products', pid), {
          supplierId: '',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    await deleteDoc(doc(db, 'suppliers', supplierId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
