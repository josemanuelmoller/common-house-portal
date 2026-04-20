/**
 * GET /api/google/callback
 *
 * Admin-only. Completes the OAuth consent exchange.
 * Receives ?code from Google, exchanges it for tokens, and renders a minimal
 * HTML page showing the new refresh token so Jose can paste it into Vercel.
 *
 * Security:
 *   - adminGuardApi enforces the same Clerk admin check as other admin routes
 *   - The refresh token is rendered in the response HTML only; NOT logged
 *   - No auto-persistence: intentional — env vars must be written in Vercel
 *     with printf to avoid newline corruption
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { GOOGLE_SCOPES_ALL } from "@/lib/google-scopes";

export const dynamic = "force-dynamic";

function resolveRedirectUri(req: NextRequest): string {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  return `${req.nextUrl.origin}/api/google/callback`;
}

function renderHtml(body: string, title = "Google consent — Common House Portal"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font: 14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif; max-width: 680px; margin: 48px auto; padding: 0 20px; color:#131218; background:#EFEFEA; }
  h1 { font-size: 20px; margin-bottom: 6px; }
  .ok { color: #0a7f3f; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-size: 11px; }
  .err { color: #b42318; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-size: 11px; }
  code { background:#fff; border:1px solid #E0E0D8; padding:2px 6px; border-radius:4px; font-size: 12px; }
  pre { background:#131218; color:#c8f55a; padding:16px; border-radius:8px; overflow:auto; font-size: 12px; }
  ol li { margin: 6px 0; }
  .muted { color:#131218aa; font-size: 12px; }
</style></head><body>${body}</body></html>`;
}

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const code  = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      renderHtml(`<p class="err">Consent declined or failed</p>
        <h1>Google returned: <code>${error}</code></h1>
        <p><a href="/api/google/auth">Try again</a></p>`),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  if (!code) {
    return new NextResponse(
      renderHtml(`<p class="err">Missing code</p>
        <h1>No authorization code in the callback URL.</h1>
        <p>Start from <a href="/api/google/auth">/api/google/auth</a>.</p>`),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "missing_env" }, { status: 500 });
  }

  const redirectUri = resolveRedirectUri(req);
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    const refreshToken = tokens.refresh_token ?? "";
    const grantedScope = tokens.scope ?? "";
    const accessToken  = tokens.access_token ?? "";

    // Sanity: which scopes actually came back?
    const grantedSet = new Set(grantedScope.split(/\s+/));
    const missing = GOOGLE_SCOPES_ALL.filter(s => !grantedSet.has(s));

    if (!refreshToken) {
      // Google only returns refresh_token on first consent unless prompt=consent.
      // If it's missing, the user likely revoked+re-granted in a weird state.
      return new NextResponse(
        renderHtml(`<p class="err">No refresh token returned</p>
          <h1>Google did not return a refresh_token.</h1>
          <p>This usually means the consent screen skipped the "choose account" step. Fix:</p>
          <ol>
            <li>Go to <a target="_blank" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a></li>
            <li>Revoke access for the Common House Portal client</li>
            <li>Restart the flow from <a href="/api/google/auth">/api/google/auth</a></li>
          </ol>
          <p class="muted">Granted scopes (access token only): <code>${grantedScope || "—"}</code></p>`),
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    // Never log the token. Render it only.
    const scopeList = [...grantedSet].filter(Boolean).map(s => `<li><code>${s}</code></li>`).join("");
    const missingList = missing.length
      ? `<p class="err">Warning — scopes missing from the grant:</p><ul>${missing.map(s => `<li><code>${s}</code></li>`).join("")}</ul>
         <p class="muted">If any scope is missing, the corresponding feature will fail. Re-run the flow if needed.</p>`
      : `<p class="ok">All required scopes granted</p>`;

    return new NextResponse(
      renderHtml(`<p class="ok">Consent complete</p>
        <h1>New Google refresh token minted.</h1>
        ${missingList}

        <p><strong>Next step — update Vercel production env var:</strong></p>
        <ol>
          <li>Open the Vercel project that serves <code>portal.wearecommonhouse.com</code></li>
          <li>Settings → Environment Variables → edit <code>GMAIL_REFRESH_TOKEN</code> (Production)</li>
          <li>Paste the value below, save, then redeploy (or it will pick up on next build)</li>
          <li>If you use the CLI, prefer <code>printf "%s"</code> so no trailing newline is added</li>
        </ol>

        <p><strong>New refresh token (copy once, then close this page):</strong></p>
        <pre id="rt">${refreshToken}</pre>
        <button onclick="navigator.clipboard.writeText(document.getElementById('rt').innerText);this.textContent='Copied ✓'">Copy to clipboard</button>

        <details style="margin-top:24px">
          <summary class="muted">Granted scopes</summary>
          <ul>${scopeList}</ul>
          <p class="muted">Access token (short-lived, for debug only): <code>${accessToken.slice(0, 16)}…</code></p>
        </details>

        <p class="muted" style="margin-top:32px">After saving the env var in Vercel, return to <a href="/admin">/admin</a> and reload. Suggested Time Blocks will activate automatically.</p>`),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      renderHtml(`<p class="err">Token exchange failed</p>
        <h1>Google rejected the authorization code.</h1>
        <pre>${message.replace(/</g, "&lt;")}</pre>
        <p>Common causes:</p>
        <ul>
          <li>Redirect URI in Google Cloud Console does not match exactly <code>${resolveRedirectUri(req)}</code></li>
          <li>The OAuth client's publishing status is "Testing" and your email is not on the test-users list</li>
          <li>You clicked back/forward during the flow; restart from <a href="/api/google/auth">/api/google/auth</a></li>
        </ul>`),
      { status: 502, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}
