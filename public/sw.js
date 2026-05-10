/* Common House — Service Worker
 * Phase 1: minimal handler for PWA installability.
 * Phase 2: offline capture queue (IndexedDB) + Background Sync.
 * Phase 5 will extend with push + notification action handlers.
 *
 * Bump SW_VERSION when shipping a behavioral change so old SW is replaced.
 */
const SW_VERSION = "ch-sw-v3";
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

// ---------- Phase 5: Web Push ----------
//
// Server payload (see src/lib/push-notify.ts) is JSON:
//   { title, body, url?, tag?, actions?, data? }
//
// We:
//   - parse the payload
//   - show a notification with default badge/icon
//   - on click: focus an existing portal tab if open, else open a new one to `url`
//   - on action click: route to action-specific URL (e.g. snooze posts to /api/push/action/...)

const DEFAULT_BADGE = "/icons/icon-192.png";
const DEFAULT_ICON = "/icons/icon-192.png";

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Common House", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: payload.tag || "ch-default",
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url || "/admin", ...(payload.data || {}) },
    actions: Array.isArray(payload.actions) ? payload.actions : undefined,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Common House", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action || "default";
  const baseUrl = (event.notification.data && event.notification.data.url) || "/admin";

  // Action-specific routing.
  let target = baseUrl;
  if (action.startsWith("snooze-")) {
    // Fire-and-forget snooze, then keep tab closed.
    const tag = event.notification.tag || "";
    event.waitUntil(
      fetch(`/api/push/action/snooze?action=${encodeURIComponent(action)}&tag=${encodeURIComponent(tag)}`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {})
    );
    return;
  }
  if (action === "open" || action === "default") {
    target = baseUrl;
  }

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Try to focus an existing tab on the same origin.
      for (const c of all) {
        const u = new URL(c.url);
        if (u.origin === self.location.origin) {
          await c.focus();
          // If it's not already on the target, navigate it.
          if (u.pathname + u.search !== target) {
            try { await c.navigate(target); } catch { /* some browsers block */ }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
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
