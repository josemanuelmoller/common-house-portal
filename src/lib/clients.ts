/**
 * Client registry — maps work email → project config
 * Add one entry per client. Notion project ID = the page ID in CH Projects [OS v2]
 * When you have 20+ clients, migrate this to a Supabase table.
 */
type ClientConfig = {
  projectId: string;
  driveUrl?: string;        // Google Drive root folder URL (view link)
  driveFolderId?: string;   // Google Drive root folder ID (for uploads)
};

const CLIENT_REGISTRY: Record<string, ClientConfig> = {
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
