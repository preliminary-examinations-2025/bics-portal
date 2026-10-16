/**
 * offlineDb.js: Native IndexedDB storage layer for BICS OT Examination Terminal.
 * Provides high-capacity, non-blocking offline persistence for:
 * 1. Pending offline exam submissions (bypassing 5MB localStorage quota)
 * 2. Queued proctoring event telemetry during network outages
 * 3. Offline proctoring evidence snapshots (base64 images)
 * 4. Autosaved code & answer drafts
 */

const DB_NAME = 'BICS_OFFLINE_DB';
const DB_VERSION = 1;

let dbPromise = null;

function getDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this browser environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Pending Submissions store (keyed by submissionId)
      if (!db.objectStoreNames.contains('submissions')) {
        db.createObjectStore('submissions', { keyPath: 'submissionId' });
      }

      // 2. Offline Proctoring Events store
      if (!db.objectStoreNames.contains('proctoringEvents')) {
        const eventStore = db.createObjectStore('proctoringEvents', { keyPath: 'id', autoIncrement: true });
        eventStore.createIndex('submissionId', 'submissionId', { unique: false });
      }

      // 3. Offline Proctoring Evidence Snapshots store
      if (!db.objectStoreNames.contains('proctoringSnapshots')) {
        const snapStore = db.createObjectStore('proctoringSnapshots', { keyPath: 'id', autoIncrement: true });
        snapStore.createIndex('submissionId', 'submissionId', { unique: false });
      }

      // 4. Answer / Code Drafts store (keyed by draftKey)
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Initialization error:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

// Helper generic transaction runner
async function performTx(storeName, mode, callback) {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      let result;
      try {
        result = callback(store);
      } catch (err) {
        reject(err);
        return;
      }

      tx.oncomplete = () => resolve(result);
      tx.onerror = (e) => reject(e.target.error);
      tx.onabort = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB Tx Error] Store: ${storeName}:`, err);
    throw err;
  }
}

/**
 * Submissions Store Methods
 */
export async function saveOfflineSubmission(payload) {
  if (!payload || !payload.submissionId) return;
  return performTx('submissions', 'readwrite', (store) => {
    store.put({
      ...payload,
      updatedAt: new Date().toISOString()
    });
  });
}

export async function getOfflineSubmission(submissionId) {
  if (!submissionId) return null;
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDb();
      const tx = db.transaction('submissions', 'readonly');
      const store = tx.objectStore('submissions');
      const req = store.get(String(submissionId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function deleteOfflineSubmission(submissionId) {
  if (!submissionId) return;
  return performTx('submissions', 'readwrite', (store) => {
    store.delete(String(submissionId));
  });
}

/**
 * Proctoring Events Store Methods
 */
export async function saveOfflineEvent(eventObj) {
  if (!eventObj || !eventObj.submissionId) return;
  return performTx('proctoringEvents', 'readwrite', (store) => {
    store.add({
      ...eventObj,
      queuedAt: new Date().toISOString()
    });
  });
}

export async function getOfflineEvents(submissionId) {
  return new Promise(async (resolve) => {
    try {
      const db = await getDb();
      const tx = db.transaction('proctoringEvents', 'readonly');
      const store = tx.objectStore('proctoringEvents');
      const index = store.index('submissionId');
      const req = index.getAll(String(submissionId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function clearOfflineEvents(submissionId) {
  return new Promise(async (resolve) => {
    try {
      const db = await getDb();
      const tx = db.transaction('proctoringEvents', 'readwrite');
      const store = tx.objectStore('proctoringEvents');
      const index = store.index('submissionId');
      const req = index.openKeyCursor(IDBKeyRange.only(String(submissionId)));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Proctoring Snapshots Store Methods
 */
export async function saveOfflineSnapshot(snapshotObj) {
  if (!snapshotObj || !snapshotObj.submissionId) return;
  return performTx('proctoringSnapshots', 'readwrite', (store) => {
    store.add({
      ...snapshotObj,
      savedAt: new Date().toISOString()
    });
  });
}

export async function getOfflineSnapshots(submissionId) {
  return new Promise(async (resolve) => {
    try {
      const db = await getDb();
      const tx = db.transaction('proctoringSnapshots', 'readonly');
      const store = tx.objectStore('proctoringSnapshots');
      const index = store.index('submissionId');
      const req = index.getAll(String(submissionId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function clearOfflineSnapshots(submissionId) {
  return new Promise(async (resolve) => {
    try {
      const db = await getDb();
      const tx = db.transaction('proctoringSnapshots', 'readwrite');
      const store = tx.objectStore('proctoringSnapshots');
      const index = store.index('submissionId');
      const req = index.openKeyCursor(IDBKeyRange.only(String(submissionId)));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Drafts Store Methods
 */
export async function saveOfflineDraft(key, data) {
  if (!key) return;
  return performTx('drafts', 'readwrite', (store) => {
    store.put({ key, data, updatedAt: new Date().toISOString() });
  });
}

export async function getOfflineDraft(key) {
  if (!key) return null;
  return new Promise(async (resolve) => {
    try {
      const db = await getDb();
      const tx = db.transaction('drafts', 'readonly');
      const store = tx.objectStore('drafts');
      const req = store.get(String(key));
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteOfflineDraft(key) {
  if (!key) return;
  return performTx('drafts', 'readwrite', (store) => {
    store.delete(String(key));
  });
}
