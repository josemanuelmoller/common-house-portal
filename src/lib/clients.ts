/**
 * Client registry — maps work email → project config
 * Add one entry per client. Notion project ID = the page ID in CH Projects [OS v2]
 * When you have 20+ clients, migrate this to a Supabase table.
 *
 * ── CLIENT ACTIVATION CHECKLIST (complete ALL before uncommenting any entry) ──
 *
 * B1. Clerk keys
 *     □ Rotate NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local
 *       from pk_test_* / sk_test_* to production keys (pk_live_* / sk_live_*)
 *     □ Update Clerk dashboard → Allowlist to include the client's email domain
 *     □ Test sign-in with production keys before enabling any client
 *
 * B2. Notion project IDs
 *     For each client entry below, verify the projectId is live in Notion:
 *     □ Open CH Projects [OS v2] in Notion
 *     □ Find the project record, copy the page ID (32-char hex, no dashes)
 *     □ Confirm it matches the commented-out projectId value
 *       (The IDs below were captured from Notion but should be re-verified
 *        before enabling — pages can be duplicated or renamed)
 *
 * B3. Google Drive folder IDs
 *     □ Confirm driveFolderId matches the actual folder the client uploads to
 *     □ Confirm the service account (GOOGLE_SERVICE_ACCOUNT_EMAIL) has Viewer
 *       access to the Drive root folder listed in driveUrl
 *     □ Test: getClientConfig(email).driveFolderId should resolve via the
 *       Google Drive API without a 403
 *
 * B4. Route and auth isolation risks (test before activating any client)
 *     □ Client user can only see /dashboard — NOT /admin/* routes
 *       (isAdminUser() must return false for client Clerk user IDs)
 *     □ getProjectIdForUser(email) returns ONLY that client's project ID,
 *       not other projects
 *     □ Notion queries in /dashboard and related routes filter by projectId —
 *       confirm no cross-project data leaks if two clients are active
 *     □ Upload API creates Source records linked only to the client's project
 *     □ ADMIN_USER_IDS env var must NOT include any client Clerk user IDs
 *
 * ── MINIMUM EXACT DATA NEEDED TO ENABLE ONE CLIENT ────────────────────────
 *     1. Production Clerk keys (pk_live_* / sk_live_*)
 *     2. Client's exact work email address (must match what they use to sign in)
 *     3. Verified Notion page ID for their project in CH Projects [OS v2]
 *     4. Verified Google Drive folder ID (and confirmed service account access)
 *     5. Confirmation that their Clerk user ID is NOT in ADMIN_USER_IDS
 *
 * ── RECOMMENDED FIRST CLIENT ─────────────────────────────────────────────
 *     Auto Mercado — project ID is already in the registry below.
 *     Verify the Notion page ID before uncommenting.
 */
type ClientConfig = {
  projectId: string;
  driveUrl?: string;        // Google Drive root folder URL (view link)
  driveFolderId?: string;   // Google Drive root folder ID (for uploads)
};

const CLIENT_REGISTRY: Record<string, ClientConfig> = {
  // ── INTERNAL PILOT ONLY ───────────────────────────────────────────────────
  // Separate Clerk test account for end-to-end client-flow validation.
  // Uses Clerk TEST keys (pk_test_*). NOT a real client activation.
  // josemanuelmoller@gmail.com (admin identity) is intentionally NOT listed here.
  // REMOVE this entry before activating any real external client.
  // Notion project ID verified live 2026-04-11. Drive access requires runtime check.
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
