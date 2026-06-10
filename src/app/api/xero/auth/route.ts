/**
 * GET /api/xero/auth
 *
 * Admin-only. Begins the Xero OAuth2 confidential Authorization Code flow:
 * redirects the admin to Xero's consent screen. A random `state` is set in an
 * httpOnly cookie and verified in the callback (CSRF guard).
 *
 * After consent, Xero redirects back to /api/xero/callback with ?code.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminGuardApi } from "@/lib/require-admin";
import { getXeroEnv, XERO_AUTHORIZE_URL, XERO_SCOPES } from "@/lib/xero-auth";

export const dynamic = "force-dynamic";

function resolveRedirectUri(req: NextRequest): string {
  return process.env.XERO_OAUTH_REDIRECT_URI || `${req.nextUrl.origin}/api/xero/callback`;
}

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const env = getXeroEnv();
  if (!env.ok) {
    return NextResponse.json({ error: "missing_env", missing: env.missing }, { status: 500 });
  }

  const state = randomUUID();
  const redirectUri = resolveRedirectUri(req);

  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", XERO_SCOPES.join(" "));
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min to complete consent
  });
  return res;
}
