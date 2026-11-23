import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { authorizedPost } from '../lib/api';
import { db, generateId, handleFirestoreError, OperationType } from '../lib/firebase';
import { toDate } from '../utils/format';
import type {
  AssistantMessageRecord,
  AssistantReorderProposal,
  DataSourceFilter,
} from '../types';

export interface AssistantChatResponse {
  reply: string;
  metricsTimestamp: string;
  dataSourceFilter: DataSourceFilter;
  reorderProposals?: AssistantReorderProposal[];
}

export async function askAssistant(params: {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  dataSourceFilter: DataSourceFilter;
}): Promise<AssistantChatResponse> {
  return authorizedPost<AssistantChatResponse>('/api/assistant/chat', params);
}

export async function saveAssistantMessage(params: {
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  dataSourceFilter: DataSourceFilter;
  metricsTimestamp?: string;
}): Promise<string> {
  const messageId = generateId('msg');
  const path = `assistantMessages/${messageId}`;
  const trimmed = params.content.trim().slice(0, 12000);
  if (!trimmed) return messageId;

  const payload: Record<string, unknown> = {
    messageId,
    ownerId: params.ownerId,
    role: params.role,
    content: trimmed,
    dataSourceFilter: params.dataSourceFilter,
    createdAt: serverTimestamp(),
  };

  if (params.metricsTimestamp) {
    payload.metricsTimestamp = params.metricsTimestamp.slice(0, 64);
  }

  try {
    await setDoc(doc(db, 'assistantMessages', messageId), payload);
    return messageId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeAssistantMessages(
  ownerId: string,
  onMessages: (messages: AssistantMessageRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'assistantMessages'),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as AssistantMessageRecord)
        .sort((a, b) => {
          const ta = toDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const tb = toDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          if (ta !== tb) return ta - tb;
          return a.messageId.localeCompare(b.messageId);
        });
      onMessages(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'assistantMessages')
  );
}

export async function clearAssistantConversation(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  try {
    for (let i = 0; i < messageIds.length; i += 400) {
      const chunk = messageIds.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, 'assistantMessages', id));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'assistantMessages');
  }
}
