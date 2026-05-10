/* Common House — Service Worker
 * Phase 1: minimal handler for PWA installability.
 * Phase 2: offline capture queue (IndexedDB) + Background Sync.
 * Phase 5 will extend with push + notification action handlers.
 *
 * Bump SW_VERSION when shipping a behavioral change so old SW is replaced.
 */
const SW_VERSION = "ch-sw-v2";
const QUEUE_DB = "ch-inbox-queue";
const QUEUE_STORE = "pending";
const SYNC_TAG = "inbox-flush";
const QUICK_CAPTURE_URL = "/api/inbox/quick-capture";

self.addEventListener("install", () => {
  // Activate the new SW immediately on install.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler — present for installability criteria.
self.addEventListener("fetch", () => {
  // no-op: browser handles every request normally.
});

// --- Phase 5 scaffolds (no-op until VAPID + subscribe flow ships) ---
self.addEventListener("push", () => {
  // intentional no-op
});

self.addEventListener("notificationclick", () => {
  // intentional no-op
});

// ---------- Offline capture queue (Phase 2) ----------
//
// Client writes pending captures into IndexedDB(QUEUE_DB > QUEUE_STORE) when
// the network call to /api/inbox/quick-capture fails. Each row:
//   { id: clientCaptureId, fields: { ...form fields }, photoBlob?, audioBlob?, createdAt }
//
// The client also registers a Background Sync with tag SYNC_TAG. When the
// browser detects network connectivity, it fires the sync event and the SW
// flushes the queue.
//
// Manual flush is also available via postMessage("FLUSH_INBOX_QUEUE").

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllQueued(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function deleteQueued(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueue() {
  let db;
  try {
    db = await openQueueDb();
  } catch {
    return;
  }
  const items = await getAllQueued(db);
  if (items.length === 0) return;

  // Single failure aborts the batch — Background Sync will retry the whole
  // event, and dedup on client_capture_id keeps it safe.
  for (const item of items) {
    const fd = new FormData();
    fd.append("client_capture_id", item.id);
    if (item.fields) {
      for (const [k, v] of Object.entries(item.fields)) {
        if (v !== null && v !== undefined && v !== "") fd.append(k, String(v));
      }
    }
    if (item.photoBlob) {
      fd.append("photo", item.photoBlob, item.photoName || "photo.jpg");
    }
    if (item.audioBlob) {
      fd.append("audio", item.audioBlob, item.audioName || "audio.webm");
    }

    const res = await fetch(QUICK_CAPTURE_URL, {
      method: "POST",
      body: fd,
      credentials: "include",
    });

    if (res.ok) {
      await deleteQueued(db, item.id);
    } else if (res.status === 401 || res.status === 403) {
      // Auth failed — leave in queue. User must reopen the PWA.
      throw new Error(`auth ${res.status}`);
    } else {
      // Server error — leave in queue, sync retries later.
      throw new Error(`server ${res.status}`);
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushQueue());
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "FLUSH_INBOX_QUEUE") {
    event.waitUntil(flushQueue().catch(() => {}));
  }
});
