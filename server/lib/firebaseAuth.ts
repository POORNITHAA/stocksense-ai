import fs from 'fs';
import path from 'path';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const config = loadFirebaseConfig();

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: config.projectId });

const adminAuth = getAuth(adminApp);

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  return adminAuth.verifyIdToken(idToken);
}

// Decode Firestore REST Value into plain JS value
function decodeFirestoreValue(val: Record<string, unknown>): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = val.arrayValue as { values?: Record<string, unknown>[] };
    return (arr.values ?? []).map(decodeFirestoreValue);
  }
  if ('mapValue' in val) {
    const map = val.mapValue as { fields?: Record<string, Record<string, unknown>> };
    const out: Record<string, unknown> = {};
    if (map.fields) {
      for (const [k, v] of Object.entries(map.fields)) {
        out[k] = decodeFirestoreValue(v);
      }
    }
    return out;
  }
  return null;
}

function decodeFirestoreDoc(doc: { name?: string; fields?: Record<string, Record<string, unknown>> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (doc.name) {
    const parts = doc.name.split('/');
    out._docId = parts[parts.length - 1];
  }
  if (doc.fields) {
    for (const [k, v] of Object.entries(doc.fields)) {
      out[k] = decodeFirestoreValue(v);
    }
  }
  return out;
}

export async function queryOwnerCollection(
  idToken: string,
  ownerId: string,
  collectionId: string,
  limitCount = 500
): Promise<Record<string, unknown>[]> {
  const databaseId = config.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    config.projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents:runQuery`;

  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'ownerId' },
          op: 'EQUAL',
          value: { stringValue: ownerId },
        },
      },
      limit: limitCount,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore REST query failed (${resp.status}): ${text}`);
  }

  const rows = (await resp.json()) as Array<{ document?: { name?: string; fields?: Record<string, Record<string, unknown>> } }>;
  return rows
    .filter((row) => Boolean(row.document))
    .map((row) => decodeFirestoreDoc(row.document!));
}
