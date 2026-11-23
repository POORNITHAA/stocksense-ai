import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { UserProfile, UserRole } from '../types';

const BOOTSTRAPPED_ADMIN_EMAIL = 'poornithaap@gmail.com';

export async function ensureUserProfile(params: {
  uid: string;
  name: string;
  email: string;
  photoUrl?: string;
}): Promise<UserProfile> {
  const path = `users/${params.uid}`;
  try {
    const ref = doc(db, 'users', params.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const defaultRole: UserRole =
      params.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
        ? 'ADMIN'
        : 'INVENTORY_MANAGER';

    const payload: Record<string, unknown> = {
      uid: params.uid,
      name: (params.name || params.email.split('@')[0] || 'Store User').slice(0, 120),
      email: params.email.slice(0, 200),
      role: defaultRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.photoUrl && params.photoUrl.length <= 500) {
      payload.photoUrl = params.photoUrl;
    }

    await setDoc(ref, payload);
    const created = await getDoc(ref);
    return created.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateUserProfileName(uid: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name cannot be empty.');
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      name: trimmed.slice(0, 120),
      updatedAt: serverTimestamp(),
    });
    if (auth.currentUser && auth.currentUser.uid === uid) {
      await updateProfile(auth.currentUser, { displayName: trimmed.slice(0, 120) });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      role,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
