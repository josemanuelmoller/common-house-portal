/**
 * GET /api/google/auth
 *
 * DIAGNOSTIC MODE — temporarily returns the generated OAuth URL and all
 * inputs used to construct it as JSON, instead of redirecting. This is so we
 * can see exactly what redirect_uri is being sent to Google and compare it
 * to what is registered in Google Cloud Console.
 *
 * Add ?go=1 to actually redirect (after diagnosis).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { GOOGLE_SCOPES_ALL } from "@/lib/google-scopes";

export const dynamic = "force-dynamic";

type DiagnosticInputs = {
  env_override_present:       boolean;
  env_override_value:         string | null;
  env_override_length:        number | null;
  req_nextUrl_origin:         string;
  req_nextUrl_href:           string;
  req_nextUrl_protocol:       string;
  req_nextUrl_host:           string;
  req_url:                    string;
  header_host:                string | null;
  header_x_forwarded_host:    string | null;
  header_x_forwarded_proto:   string | null;
  header_referer:             string | null;
  vercel_url_env:             string | null;
  node_env:                   string | null;
  computed_redirect_uri:      string;
  redirect_uri_char_codes:    number[];  // to catch invisible chars / trailing whitespace
  client_id_suffix_last_12:   string;    // avoid printing full client id
};

function resolveRedirectUri(req: NextRequest): { uri: string; diagnostics: DiagnosticInputs } {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? null;

  const origin   = req.nextUrl.origin;
  const derived  = `${origin}/api/google/callback`;
  const uri      = explicit || derived;

  const diagnostics: DiagnosticInputs = {
    env_override_present:       !!explicit,
    env_override_value:         explicit,
    env_override_length:        explicit ? explicit.length : null,
    req_nextUrl_origin:         origin,
    req_nextUrl_href:           req.nextUrl.href,
    req_nextUrl_protocol:       req.nextUrl.protocol,
    req_nextUrl_host:           req.nextUrl.host,
    req_url:                    req.url,
    header_host:                req.headers.get("host"),
    header_x_forwarded_host:    req.headers.get("x-forwarded-host"),
    header_x_forwarded_proto:   req.headers.get("x-forwarded-proto"),
    header_referer:             req.headers.get("referer"),
    vercel_url_env:             process.env.VERCEL_URL ?? null,
    node_env:                   process.env.NODE_ENV ?? null,
    computed_redirect_uri:      uri,
    redirect_uri_char_codes:    Array.from(uri).map(c => c.charCodeAt(0)),
    client_id_suffix_last_12:   (process.env.GMAIL_CLIENT_ID ?? "").slice(-12),
  };

  return { uri, diagnostics };
}

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: "missing_env",
        missing: [
          ...(clientId     ? [] : ["GMAIL_CLIENT_ID"]),
          ...(clientSecret ? [] : ["GMAIL_CLIENT_SECRET"]),
        ],
      },
      { status: 500 }
    );
  }

  const { uri: redirectUri, diagnostics } = resolveRedirectUri(req);
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const scopes = [...GOOGLE_SCOPES_ALL];
  const auth_url = oauth2.generateAuthUrl({
    access_type:             "offline",
    prompt:                  "consent",
    include_granted_scopes:  true,
    scope:                   scopes,
  });

  // Parse what the googleapis lib actually put into the URL so we can see it
  // round-trip (catches any normalization the library performs).
  let parsed_redirect_uri_from_auth_url: string | null = null;
  let parsed_client_id_suffix_last_12:   string | null = null;
  let parsed_scope_param:                string | null = null;
  try {
    const u = new URL(auth_url);
    parsed_redirect_uri_from_auth_url = u.searchParams.get("redirect_uri");
    const parsedCid = u.searchParams.get("client_id") ?? "";
    parsed_client_id_suffix_last_12   = parsedCid.slice(-12);
    parsed_scope_param                = u.searchParams.get("scope");
  } catch { /* noop */ }

  // Also emit a structured log line (appears in Vercel function logs).
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    scope: "hall",
    source: "google-auth",
    type: "oauth_auth_url_built",
    ...diagnostics,
    parsed_redirect_uri_from_auth_url,
    parsed_client_id_suffix_last_12,
    parsed_scope_param,
  }));

  // Allow ?go=1 to actually redirect (so we can complete the flow once we
  // have verified the values). Default is diagnostic JSON.
  if (req.nextUrl.searchParams.get("go") === "1") {
    return NextResponse.redirect(auth_url);
  }

  return NextResponse.json(
    {
      mode: "diagnostic",
      note: "Add ?go=1 to actually redirect to Google.",
      inputs: {
        oauth_params: {
          access_type:            "offline",
          prompt:                 "consent",
          include_granted_scopes: true,
          scopes,
        },
        env: {
          env_override_present:   diagnostics.env_override_present,
          env_override_value:     diagnostics.env_override_value,
          env_override_length:    diagnostics.env_override_length,
          vercel_url_env:         diagnostics.vercel_url_env,
          node_env:               diagnostics.node_env,
        },
        request: {
          req_nextUrl_origin:       diagnostics.req_nextUrl_origin,
          req_nextUrl_href:         diagnostics.req_nextUrl_href,
          req_nextUrl_protocol:     diagnostics.req_nextUrl_protocol,
          req_nextUrl_host:         diagnostics.req_nextUrl_host,
          req_url:                  diagnostics.req_url,
          header_host:              diagnostics.header_host,
          header_x_forwarded_host:  diagnostics.header_x_forwarded_host,
          header_x_forwarded_proto: diagnostics.header_x_forwarded_proto,
          header_referer:           diagnostics.header_referer,
        },
        credentials: {
          client_id_suffix_last_12: diagnostics.client_id_suffix_last_12,
        },
      },
      computed: {
        redirect_uri:             diagnostics.computed_redirect_uri,
        redirect_uri_char_codes:  diagnostics.redirect_uri_char_codes,  // detects stray chars
      },
      round_trip_check: {
        parsed_redirect_uri_from_auth_url,
        parsed_client_id_suffix_last_12,
        parsed_scope_param,
        matches_computed:
          parsed_redirect_uri_from_auth_url === diagnostics.computed_redirect_uri,
      },
      auth_url,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
