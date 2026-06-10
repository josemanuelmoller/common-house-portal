/**
 * GET /api/xero/callback
 *
 * Admin-only. Completes the Xero OAuth consent exchange:
 *   1. verifies the `state` cookie set by /api/xero/auth (CSRF guard)
 *   2. exchanges ?code for an access + refresh token set
 *   3. reads /connections to discover the org (tenant) to sync
 *   4. PERSISTS the token set into public.integration_oauth_tokens
 *
 * Unlike the Google callback (which renders the refresh token for manual paste),
 * Xero's token is auto-persisted because it rotates on every refresh — there is
 * nothing for the user to copy. The page just confirms which org connected.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { exchangeCodeForToken, fetchConnections, persistInitialToken } from "@/lib/xero-auth";

export const dynamic = "force-dynamic";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

function renderHtml(body: string, title = "Xero connect — Common House Portal"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font: 14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif; max-width: 680px; margin: 48px auto; padding: 0 20px; color:#131218; background:#EFEFEA; }
  h1 { font-size: 20px; margin-bottom: 6px; }
  .ok { color: #0a7f3f; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-size: 11px; }
  .err { color: #b42318; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-size: 11px; }
  code { background:#fff; border:1px solid #E0E0D8; padding:2px 6px; border-radius:4px; font-size: 12px; }
  ol li { margin: 6px 0; }
  .muted { color:#131218aa; font-size: 12px; }
</style></head><body>${body}</body></html>`;
}

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(renderHtml(body), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function resolveRedirectUri(req: NextRequest): string {
  return process.env.XERO_OAUTH_REDIRECT_URI || `${req.nextUrl.origin}/api/xero/callback`;
}

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("xero_oauth_state")?.value;

  if (error) {
    return htmlResponse(`<p class="err">Consent declined or failed</p>
      <h1>Xero returned: <code>${escapeHtml(error)}</code></h1>
      <p><a href="/api/xero/auth">Try again</a></p>`);
  }
  if (!code) {
    return htmlResponse(
      `<p class="err">Missing code</p>
       <h1>No authorization code in the callback URL.</h1>
       <p>Start from <a href="/api/xero/auth">/api/xero/auth</a>.</p>`,
      400
    );
  }
  if (!state || !cookieState || state !== cookieState) {
    return htmlResponse(
      `<p class="err">State mismatch</p>
       <h1>CSRF check failed — the state value did not match.</h1>
       <p>Restart from <a href="/api/xero/auth">/api/xero/auth</a> in the same browser.</p>`,
      400
    );
  }

  const redirectUri = resolveRedirectUri(req);
  try {
    const raw = await exchangeCodeForToken(code, redirectUri);
    const connections = await fetchConnections(raw.access_token);
    const org = connections.find((c) => c.tenantType === "ORGANISATION") ?? connections[0] ?? null;

    await persistInitialToken(
      raw,
      org ? { tenant_id: org.tenantId, tenant_name: org.tenantName } : null
    );

    const otherOrgs =
      connections.length > 1
        ? `<p class="muted">${connections.length} orgs authorized; syncing <strong>${escapeHtml(
            org?.tenantName ?? "—"
          )}</strong>. Multi-org sync is a later phase.</p>`
        : "";

    const res = htmlResponse(`<p class="ok">Xero connected</p>
      <h1>Connected to <code>${escapeHtml(org?.tenantName ?? "Unknown org")}</code></h1>
      <p>Token set persisted to <code>integration_oauth_tokens</code>. It will refresh
         automatically — nothing to copy.</p>
      ${otherOrgs}
      <p><strong>Next:</strong> the nightly <code>compute-kpi</code> run (03:15) will pull
         invoices into <code>revenue_events</code>. To sync now, trigger
         <code>/api/xero/sync</code> while signed in as admin.</p>
      <p class="muted" style="margin-top:24px">Tenant id: <code>${escapeHtml(
        org?.tenantId ?? "—"
      )}</code></p>
      <p class="muted">Return to <a href="/admin/plan">/admin/plan</a>.</p>`);

    // Consume the one-time state cookie.
    res.cookies.set("xero_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return htmlResponse(
      `<p class="err">Token exchange failed</p>
       <h1>Xero rejected the authorization.</h1>
       <pre style="background:#131218;color:#c8f55a;padding:16px;border-radius:8px;overflow:auto;font-size:12px">${escapeHtml(
         message
       )}</pre>
       <ul>
         <li>Redirect URI registered in the Xero app must match exactly <code>${escapeHtml(
           resolveRedirectUri(req)
         )}</code></li>
         <li>Restart from <a href="/api/xero/auth">/api/xero/auth</a></li>
       </ul>`,
      502
    );
  }
}
