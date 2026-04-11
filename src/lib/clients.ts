/**
 * Client registry — maps work email → project config
 * Add one entry per client. Notion project ID = the page ID in CH Projects [OS v2]
 * When you have 20+ clients, migrate this to a Supabase table.
 *
 * ── CLIENT ACTIVATION CHECKLIST ──────────────────────────────────────────────
 *
 * B1. Clerk keys                                          STATUS: ⚠ PENDING
 *     ✗ Rotate NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local
 *       from pk_test_* / sk_test_* to production keys (pk_live_* / sk_live_*)
 *       → Get from: https://dashboard.clerk.com → API Keys → Live keys
 *     ✗ Add client email to Clerk Allowlist (or enable open sign-up)
 *       → Clerk dashboard → User & Authentication → Allowlist
 *     ✗ Confirm sign-in works with production keys before enabling any client
 *
 * B2. Notion project IDs                                  STATUS: ✓ VERIFIED
 *     ✓ josemanuel@algramo.com → 33d45e5b-6633-81ba-8784-ea132f0a57ca
 *       Verified live in CH Projects [OS v2] on 2026-04-11
 *
 * B3. Google Drive folder IDs                             STATUS: ✓ IN REGISTRY
 *     ✓ Drive folder ID in registry: 1_fY95oUqhI1QSB_9uy4DtpVIaz06h9Gy
 *     □ Confirm service account has Viewer access (test via Drive API, no 403)
 *
 * B4. Route and auth isolation                            STATUS: ✓ VERIFIED
 *     ✓ Client sees /hall (primary), /workroom, /dashboard — NOT /admin/*
 *     ✓ Non-admin users who attempt /admin/* are redirected to /hall
 *     ✓ getProjectIdForUser(email) scoped to that client's project only
 *     ✓ ADMIN_USER_IDS does not include any client Clerk user IDs
 *     ✓ No cross-project access in Hall, Workroom, or dashboard
 *
 * ── MINIMUM EXACT STEPS TO GO LIVE ───────────────────────────────────────────
 *     1. Get live Clerk keys (pk_live_* / sk_live_*) from dashboard.clerk.com
 *     2. Update .env.local: replace pk_test_* / sk_test_* with pk_live_* / sk_live_*
 *     3. Add josemanuel@algramo.com to Clerk Allowlist (or enable open sign-up)
 *     4. Deploy or restart the dev server
 *     5. Test sign-in with josemanuel@algramo.com → expect landing on /hall
 *     6. Confirm The Workroom link appears in sidebar → /workroom loads
 *     ── Everything else is already in place ──
 *
 * ── ROLLBACK ─────────────────────────────────────────────────────────────────
 *     To revert to test mode: swap back pk_test_* / sk_test_* in .env.local.
 *     The registry entry for josemanuel@algramo.com remains and can be re-used.
 */
type ClientConfig = {
  projectId: string;
  driveUrl?: string;        // Google Drive root folder URL (view link)
  driveFolderId?: string;   // Google Drive root folder ID (for uploads)

  // ── HOUSE ARCHITECTURE ────────────────────────────────────────────────────
  // Workspace assignment is NOT stored here. It lives in Notion:
  //   CH Projects [OS v2] → "Primary Workspace" (hall | garage | workroom)
  //   CH Projects [OS v2] → "Engagement Stage"  (pre-sale | active)
  //   CH Projects [OS v2] → "Engagement Model"  (startup | delivery)
  //   CH Projects [OS v2] → "Workroom Mode"     (corporate | implementation | city | initiative | partnership)
  //
  // The portal reads these via notion.ts → Project.primaryWorkspace etc.
  // Routing stub lives in src/app/hall/page.tsx.
  // Full architecture documentation: src/types/house.ts
};

const CLIENT_REGISTRY: Record<string, ClientConfig> = {
  // ── Auto Mercado - Fase 2 (FIRST LIVE CLIENT) ────────────────────────────
  // Client user: josemanuel@algramo.com
  // Project: Auto Mercado - Fase 2 | Primary Workspace: workroom | Mode: implementation
  // Notion ID verified live 2026-04-11.
  // BLOCKED ON: Clerk live keys (pk_live_* / sk_live_*) — see checklist above.
  "josemanuel@algramo.com": {
    projectId:     "33d45e5b-6633-81ba-8784-ea132f0a57ca",
    driveUrl:      "https://drive.google.com/drive/folders/1_fY95oUqhI1QSB_9uy4DtpVIaz06h9Gy",
    driveFolderId: "1_fY95oUqhI1QSB_9uy4DtpVIaz06h9Gy",
  },

  // ── Auto Mercado - Fase 2 ──────────────────────────────────────────────────
  // "client@automercado.com": {
  //   projectId:     "33d45e5b-6633-81ba-8784-ea132f0a57ca",
  //   driveUrl:      "https://drive.google.com/drive/folders/1_fY95oUqhI1QSB_9uy4DtpVIaz06h9Gy",
  //   driveFolderId: "1_fY95oUqhI1QSB_9uy4DtpVIaz06h9Gy",
  // },

  // ── COP31 ─────────────────────────────────────────────────────────────────
  // "client@cop31.com": {
  //   projectId:     "33d45e5b-6633-8189-8c56-ebb45bb5d68d",
  //   driveUrl:      "https://drive.google.com/drive/folders/1NTGoGHay5bU3SmyjZdWrXrD1-7lBL2FS",
  //   driveFolderId: "1NTGoGHay5bU3SmyjZdWrXrD1-7lBL2FS",
  // },

  // ── Paper vs PLA Positioning in Chile ─────────────────────────────────────
  // "client@papervspla.com": {
  //   projectId:     "33d45e5b-6633-8170-a61d-f3d77537517d",
  //   driveUrl:      "https://drive.google.com/drive/folders/1opcuiyIKyjRH_YmxZqNiIaOt-h38EK6s",
  //   driveFolderId: "1opcuiyIKyjRH_YmxZqNiIaOt-h38EK6s",
  // },

  // ── Reuse for All ─────────────────────────────────────────────────────────
  // "client@reuseforall.com": {
  //   projectId:     "33d45e5b-6633-81e6-b266-e1a9cd06099f",
  //   driveUrl:      "https://drive.google.com/drive/folders/1w7K5VowvRm0Nq_kr2CrME3EVOJFHvLuw",
  //   driveFolderId: "1w7K5VowvRm0Nq_kr2CrME3EVOJFHvLuw",
  // },

  // ── ZWF Forum 2026 ────────────────────────────────────────────────────────
  // "client@zwfforum.com": {
  //   projectId:     "33d45e5b-6633-81b5-9119-e98c11b7b4c2",
  //   driveUrl:      "https://drive.google.com/drive/folders/1RMHpl4brg7chIbg8VDu8kW9OIigpUiH7",
  //   driveFolderId: "1RMHpl4brg7chIbg8VDu8kW9OIigpUiH7",
  // },
};

export function getProjectIdForUser(email: string): string | null {
  return CLIENT_REGISTRY[email.toLowerCase()]?.projectId ?? null;
}

export function getClientConfig(email: string): ClientConfig | null {
  return CLIENT_REGISTRY[email.toLowerCase()] ?? null;
}

export function isAdminUser(userId: string): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim());
  return adminIds.includes(userId);
}
