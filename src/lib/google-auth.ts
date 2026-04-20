/**
 * google-auth.ts
 *
 * Shared Google OAuth2 client for all Google Workspace integrations.
 * One auth layer; service-specific factories live in google-gmail.ts and
 * google-calendar.ts.
 *
 * Env source of truth (shared across Gmail + Calendar because they must
 * authenticate the same Google account — the Common House workspace user):
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN
 *
 * The GMAIL_ prefix is a legacy artefact — the refresh token is the workspace
 * user's, not the Gmail service's. Rather than mass-rename env keys and break
 * existing deploys, we treat these names as the shared Google credentials.
 *
 * Scope requirements by service (must be granted on the refresh token):
 *   Gmail read/send      → https://www.googleapis.com/auth/gmail.modify
 *   Calendar read/write  → https://www.googleapis.com/auth/calendar.events
 *
 * If a required scope is missing, API calls throw with messages containing
 * "insufficient" / "scope" / "invalid_grant". Callers are expected to surface
 * this cleanly to the user — never silently fall back.
 */

import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export type GoogleAuthStatus =
  | { ok: true;  client: OAuth2Client }
  | { ok: false; reason: "missing_env"; missing: string[] };

/**
 * Returns the shared authenticated OAuth2 client, or a structured error if
 * required env vars are missing. Never throws.
 */
export function getGoogleAuthClient(): GoogleAuthStatus {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  const missing: string[] = [];
  if (!clientId)     missing.push("GMAIL_CLIENT_ID");
  if (!clientSecret) missing.push("GMAIL_CLIENT_SECRET");
  if (!refreshToken) missing.push("GMAIL_REFRESH_TOKEN");
  if (missing.length) return { ok: false, reason: "missing_env", missing };

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return { ok: true, client: auth };
}

/**
 * Classify a thrown error from a Google API call into one of three known
 * failure modes so routes can map each to a stable error code.
 */
export function classifyGoogleError(err: unknown): "scope_missing" | "auth_revoked" | "other" {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("insufficient") || msg.includes("scope")) return "scope_missing";
  if (msg.includes("invalid_grant") || msg.includes("unauthorized") || msg.includes("401")) return "auth_revoked";
  return "other";
}
