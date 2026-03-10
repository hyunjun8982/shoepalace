// 브라우저 IndexedDB 기반 인증서 저장소 (기기별 분리)

export interface StoredCert {
  id: string; // auto-generated
  cert_name: string;
  cert_type: string;
  issuer_cn: string;
  not_after: string | null;
  der_base64: string;
  key_base64: string;
  created_at: string;
}

const DB_NAME = 'card-app-certs';
const STORE_NAME = 'certificates';
const DB_VERSION = 1;

// crypto.randomUUID는 secure context(HTTPS)에서만 동작하므로 폴백 사용
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 폴백: Math.random 기반 UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCerts(): Promise<StoredCert[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function addCert(cert: Omit<StoredCert, 'id' | 'created_at'>): Promise<StoredCert> {
  const db = await openDB();
  const newCert: StoredCert = {
    ...cert,
    id: generateId(),
    created_at: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(newCert);
    tx.oncomplete = () => { db.close(); resolve(newCert); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function deleteCert(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getCert(id: string): Promise<StoredCert | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
