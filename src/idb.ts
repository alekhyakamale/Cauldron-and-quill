// A tiny key-value store on IndexedDB. Unlike localStorage (about 5 MB), IndexedDB can hold
// hundreds of MB, so photo thumbnails no longer fill the phone's storage for this app.
const DB = 'cauldron-and-quill';
const STORE = 'kv';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => (opening = null); // the browser may close it; reopen next time
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is blocked by another tab'));
    });
    opening.catch(() => (opening = null));
  }
  return opening;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Every value whose key starts with prefix */
export async function idbGetPrefix<T>(prefix: string): Promise<T[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Writes and deletes several keys in one transaction: all of them land, or none do */
export async function idbWrite(puts: [string, unknown][], deletes: string[] = []): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [key, value] of puts) store.put(value, key);
    for (const key of deletes) store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Save was cancelled'));
  });
}
