// Tiny IndexedDB wrapper used to persist FileSystem directory handles
// (which are not JSON-serialisable) so recent local folders can be reopened.

const DB_NAME = 'moronide';
const STORE = 'handles';
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idbGet = (key) => tx('readonly', (s) => s.get(key));
export const idbSet = (key, val) => tx('readwrite', (s) => s.put(val, key));
export const idbDel = (key) => tx('readwrite', (s) => s.delete(key));

export async function saveRecentFolder(handle) {
  const list = (await idbGet('recent')) || [];
  const key = handle.name + '::' + (list.length);
  // De-dupe by name (best effort — handles aren't comparable by identity).
  const filtered = [];
  for (const item of list) {
    let same = false;
    try { same = await item.handle.isSameEntry(handle); } catch { same = item.name === handle.name; }
    if (!same) filtered.push(item);
  }
  filtered.unshift({ name: handle.name, handle, at: Date.now() });
  await idbSet('recent', filtered.slice(0, 8));
}

export async function getRecentFolders() {
  return (await idbGet('recent')) || [];
}

export async function clearRecentFolders() {
  await idbDel('recent');
}
