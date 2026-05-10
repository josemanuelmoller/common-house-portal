/**
 * inbox-client.ts — browser-side helpers for Quick Capture (Fase 3).
 *
 * Mirrors the queue logic in public/sw.js. The two share the same
 * IndexedDB(QUEUE_DB > QUEUE_STORE) so the client can write while
 * online or offline, and the SW Background Sync drains it.
 *
 * IMPORTANT: This file must be safe to import from "use client" components.
 * No server imports.
 */

const QUEUE_DB = "ch-inbox-queue";
const QUEUE_STORE = "pending";
const SYNC_TAG = "inbox-flush";

export type QueuedCapture = {
  id: string; // client_capture_id (UUID)
  createdAt: number;
  fields: Record<string, string | undefined>;
  photoBlob?: Blob;
  photoName?: string;
  audioBlob?: Blob;
  audioName?: string;
};

function openQueueDb(): Promise<IDBDatabase> {
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

export async function enqueueCapture(item: QueuedCapture): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countQueued(): Promise<number> {
  try {
    const db = await openQueueDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const req = tx.objectStore(QUEUE_STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Register a Background Sync tag so the SW will flush the queue when
 * connectivity returns. Falls back to immediate manual flush via SW
 * postMessage when Background Sync isn't available (Firefox, Safari).
 */
export async function requestQueueFlush(): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (reg.sync) {
      await reg.sync.register(SYNC_TAG);
      return;
    }
  } catch {
    // fall through to manual postMessage
  }

  // Manual fallback: ask the active SW to flush now
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage("FLUSH_INBOX_QUEUE");
  } catch {
    // SW not available — capture stays queued for next session
  }
}

/** Generate a UUID v4. Uses crypto.randomUUID() when available. */
export function newCaptureId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (very rare in 2026 browsers)
  return "ch-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
