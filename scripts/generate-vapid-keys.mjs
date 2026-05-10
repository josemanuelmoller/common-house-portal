// One-time script: generate a VAPID key pair for Web Push.
//
// Run from repo root:
//   node scripts/generate-vapid-keys.mjs
//
// Then set the printed values as Vercel env vars (Production + Preview):
//   VAPID_PUBLIC_KEY        — used by server when sending push
//   VAPID_PRIVATE_KEY       — used by server when signing
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY — same public key, exposed to the browser
//                                  for PushManager.subscribe()
//
// VAPID_SUBJECT — set to a mailto:/URL that identifies this app to push services.
// Default: mailto:portal@wearecommonhouse.com (override to whatever you prefer).
//
// IMPORTANT: only run this once. Regenerating keys invalidates every existing
// browser push subscription — every device must re-subscribe.

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("");
console.log("=== VAPID keys generated. Copy to Vercel env (Production + Preview): ===");
console.log("");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_SUBJECT=mailto:portal@wearecommonhouse.com`);
console.log("");
console.log("After setting, redeploy. Then visit /admin/capture and tap the");
console.log("'Activar push' button on your Android.");
