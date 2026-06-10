/**
 * xero-auth.ts
 *
 * Xero OAuth2 (confidential Authorization Code flow) for the Phase A revenue
 * integration. Mirrors the shape of google-auth.ts but with one critical
 * difference:
 *
 *   Xero ROTATES its refresh token on every refresh and invalidates the prior
 *   one (and the refresh token expires after 60 days of non-use). It therefore
 *   CANNOT live in an env var the way GMAIL_REFRESH_TOKEN does. The token set is
 *   persisted in public.integration_oauth_tokens and rewritten after every
 *   refresh. If you "simplify" this to an env var, the integration breaks within
 *   ~30 minutes (one access-token lifetime).
 *
 * We use the confidential client flow (client_id + client_secret via HTTP Basic
 * on the token endpoint) — NOT PKCE — because the secret is held server-side,
 * exactly like the Google flow. PKCE is for public clients that cannot hold a
 * secret.
 *
 * Env (set in the Vercel project that serves portal.wearecommonhouse.com):
 *   XERO_CLIENT_ID
 *   XERO_CLIENT_SECRET
 *   XERO_OAUTH_REDIRECT_URI   (optional override; defaults to <origin>/api/xero/callback)
 */

import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

const PROVIDER = "xero";

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

// offline_access → mints a refresh token. The rest are read-only Accounting
// scopes — Phase A never writes to Xero.
export const XERO_SCOPES = [
  "offline_access",
  "accounting.transactions.read",
  "accounting.contacts.read",
  "accounting.settings.read",
];

export type XeroEnv =
  | { ok: true; clientId: string; clientSecret: string }
  | { ok: false; missing: string[] };

export function getXeroEnv(): XeroEnv {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const missing: string[] = [];
  if (!clientId) missing.push("XERO_CLIENT_ID");
  if (!clientSecret) missing.push("XERO_CLIENT_SECRET");
  if (missing.length) return { ok: false, missing };
  return { ok: true, clientId: clientId as string, clientSecret: clientSecret as string };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function expiryIso(expiresInSec: number): string {
  return new Date(Date.now() + expiresInSec * 1000).toISOString();
}

type RawTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (Xero access tokens last 30 min)
  token_type: string;
  scope?: string;
};

export type XeroConnection = {
  id: string;
  tenantId: string;
  tenantType: string; // "ORGANISATION"
  tenantName: string;
};

// ─── Token endpoint calls ────────────────────────────────────────────────────

async function postToken(body: URLSearchParams): Promise<RawTokenResponse> {
  const env = getXeroEnv();
  if (!env.ok) throw new Error(`xero env missing: ${env.missing.join(", ")}`);
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env.clientId, env.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`xero token endpoint ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as RawTokenResponse;
}

export function exchangeCodeForToken(code: string, redirectUri: string): Promise<RawTokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  );
}

function refreshAccessToken(refresh_token: string): Promise<RawTokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
    })
  );
}

export async function fetchConnections(accessToken: string): Promise<XeroConnection[]> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`xero connections ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as XeroConnection[];
}

// ─── Token store (public.integration_oauth_tokens) ───────────────────────────

/** Persist the initial token set after the OAuth code exchange. */
export async function persistInitialToken(
  raw: RawTokenResponse,
  tenant: { tenant_id: string; tenant_name: string } | null
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("integration_oauth_tokens").upsert(
    {
      provider: PROVIDER,
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at: expiryIso(raw.expires_in),
      scopes: raw.scope ?? XERO_SCOPES.join(" "),
      tenant_id: tenant?.tenant_id ?? null,
      tenant_name: tenant?.tenant_name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );
  if (error) throw new Error(`persistInitialToken: ${error.message}`);
}

export type XeroAccess =
  | { ok: true; accessToken: string; tenantId: string; tenantName: string | null }
  | { ok: false; reason: "not_connected" | "no_tenant" | "refresh_failed"; detail?: string };

/**
 * Returns a valid access token + tenant, refreshing and re-persisting the
 * (rotated) refresh token when the stored access token is within 60s of expiry.
 * Never throws — callers branch on `ok`.
 */
export async function getXeroAccess(): Promise<XeroAccess> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("integration_oauth_tokens")
    .select("access_token, refresh_token, expires_at, scopes, tenant_id, tenant_name")
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) return { ok: false, reason: "refresh_failed", detail: error.message };
  if (!data) return { ok: false, reason: "not_connected" };
  if (!data.tenant_id) return { ok: false, reason: "no_tenant" };

  const expiresAtMs = new Date(data.expires_at as string).getTime();
  const stillValid = Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > 60_000;
  if (stillValid) {
    return {
      ok: true,
      accessToken: data.access_token as string,
      tenantId: data.tenant_id as string,
      tenantName: (data.tenant_name as string | null) ?? null,
    };
  }

  try {
    const refreshed = await refreshAccessToken(data.refresh_token as string);
    const { error: upErr } = await db
      .from("integration_oauth_tokens")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token, // rotated — must persist the new one
        expires_at: expiryIso(refreshed.expires_in),
        scopes: refreshed.scope ?? data.scopes,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", PROVIDER);
    if (upErr) return { ok: false, reason: "refresh_failed", detail: upErr.message };
    return {
      ok: true,
      accessToken: refreshed.access_token,
      tenantId: data.tenant_id as string,
      tenantName: (data.tenant_name as string | null) ?? null,
    };
  } catch (e) {
    return { ok: false, reason: "refresh_failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function getLastSyncedAt(): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("integration_oauth_tokens")
    .select("last_synced_at")
    .eq("provider", PROVIDER)
    .maybeSingle();
  return (data?.last_synced_at as string | null) ?? null;
}

export async function markSynced(): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from("integration_oauth_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("provider", PROVIDER);
}
