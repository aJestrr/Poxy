const DB_NAME = 'pokemon-tcg-arena';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sets')) db.createObjectStore('sets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('setCards')) db.createObjectStore('setCards', { keyPath: 'setId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSet(store, items) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  for (const item of items) tx.objectStore(store).put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedSetCards(setId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('setCards', 'readonly');
    const req = tx.objectStore('setCards').get(setId);
    req.onsuccess = () => resolve(req.result?.cardIds ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSetCardIds(setId, cardIds) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('setCards', 'readwrite');
    tx.objectStore('setCards').put({ setId, cardIds, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedCard(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cards', 'readonly');
    const req = tx.objectStore('cards').get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
