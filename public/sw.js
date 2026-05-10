/* Common House — Service Worker
 * Phase 1: minimal handler for PWA installability + scaffolds for later phases.
 * Phase 2 will extend with offline capture queue + share target receiver.
 * Phase 5 will extend with push + notification action handlers.
 * Bump SW_VERSION when shipping a behavioral change so old SW is replaced.
 */
const SW_VERSION = "ch-sw-v1";

self.addEventListener("install", (event) => {
  // Activate the new SW immediately on install (no waiting for tabs to close).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of any open clients on first install.
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler — present for installability criteria.
// Intentionally no respondWith(): the browser handles every request normally.
// Stays this thin until Phase 2 adds the offline capture queue.
self.addEventListener("fetch", () => {
  // no-op
});

// --- Phase 5 scaffolds (no-op until VAPID + subscribe flow ships) ---
self.addEventListener("push", () => {
  // intentional no-op
});

self.addEventListener("notificationclick", () => {
  // intentional no-op
});

// Allow the page to nudge the SW to update without reloading.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
