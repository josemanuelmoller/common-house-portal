/**
 * GET /api/google/auth
 *
 * Admin-only. Redirects to Google's OAuth consent screen with:
 *   - access_type=offline  → returns a refresh_token
 *   - prompt=consent       → forces a fresh refresh_token even if user has consented before
 *   - All scopes the app needs (Gmail + Calendar) bundled together so one
 *     refresh token unlocks everything. See src/lib/google-scopes.ts.
 *
 * After Jose approves, Google redirects to /api/google/callback with a
 * short-lived `code` which that route exchanges for tokens.
 *
 * Setup requirement (one-time, done in Google Cloud Console):
 *   Add this redirect URI to the OAuth client (GMAIL_CLIENT_ID):
 *     https://portal.wearecommonhouse.com/api/google/callback
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { GOOGLE_SCOPES_ALL } from "@/lib/google-scopes";

export const dynamic = "force-dynamic";

function resolveRedirectUri(req: NextRequest): string {
  // Prefer explicit env; otherwise derive from the request origin.
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  const origin = req.nextUrl.origin;
  return `${origin}/api/google/callback`;
}

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "missing_env", missing: [
        ...(clientId     ? [] : ["GMAIL_CLIENT_ID"]),
        ...(clientSecret ? [] : ["GMAIL_CLIENT_SECRET"]),
      ] },
      { status: 500 }
    );
  }

  const redirectUri = resolveRedirectUri(req);
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const url = oauth2.generateAuthUrl({
    access_type:             "offline",
    prompt:                  "consent",         // force new refresh_token
    include_granted_scopes:  true,
    scope:                   [...GOOGLE_SCOPES_ALL],
  });

  return NextResponse.redirect(url);
}
