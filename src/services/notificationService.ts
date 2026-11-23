import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import type { NotificationType } from '../types';

export async function createDeduplicatedNotification(params: {
  ownerId: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  conditionKey: string;
}): Promise<void> {
  const path = 'notifications';
  try {
    const existingQ = query(
      collection(db, path),
      where('ownerId', '==', params.ownerId)
    );
    const snap = await getDocs(existingQ);
    const alreadyExists = snap.docs.some((d) => {
      const data = d.data();
      return data.conditionKey === params.conditionKey && data.isRead === false;
    });
    if (alreadyExists) {
      return; // Avoid duplicate alerts for the same unresolved condition
    }

    const notificationId = generateId('notif');
    await setDoc(doc(db, path, notificationId), {
      notificationId,
      ownerId: params.ownerId,
      title: params.title.slice(0, 140),
      message: params.message.slice(0, 400),
      notificationType: params.notificationType,
      conditionKey: params.conditionKey.slice(0, 160),
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Notification creation skipped:', error);
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsAsRead(
  ownerId: string,
  notificationIds: string[]
): Promise<void> {
  if (notificationIds.length === 0) return;
  try {
    for (let i = 0; i < notificationIds.length; i += 400) {
      const chunk = notificationIds.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.update(doc(db, 'notifications', id), { isRead: true });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${ownerId}`);
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
