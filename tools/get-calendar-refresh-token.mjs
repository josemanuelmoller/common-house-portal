#!/usr/bin/env node
/**
 * One-time Calendar OAuth dance (Phase 7 of the normalization architecture).
 *
 * Gmail + Calendar share the same refresh token because the OAuth client is
 * configured for the whole workspace user (josemanuel@wearecommonhouse.com),
 * not per-service (see src/lib/google-auth.ts header). To add Calendar scope
 * we re-authorize with BOTH scopes at once — the resulting refresh token
 * REPLACES the existing GMAIL_REFRESH_TOKEN in Vercel.
 *
 * Run:
 *   node tools/get-calendar-refresh-token.mjs
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET present in .env.local
 *   - Google Calendar API enabled on the same Google Cloud project
 *     (Console → APIs & Services → Library → Google Calendar API → Enable)
 *   - http://localhost:53682/oauth2-callback in the OAuth client's
 *     Authorized redirect URIs (already added for Drive setup — reused)
 */

import { google } from "googleapis";
import { createServer } from "http";
import { readFileSync } from "fs";
import { URL } from "url";
import { spawn } from "child_process";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
    }
    return env;
  } catch (err) {
    console.error("Could not read .env.local:", err.message);
    process.exit(1);
  }
}

const env = loadEnv();
const CLIENT_ID = env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET missing from .env.local.");
  process.exit(1);
}

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2-callback`;

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// BOTH scopes — Gmail (existing) + Calendar (new). The issued token replaces
// the current GMAIL_REFRESH_TOKEN.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
  // Drive kept for compatibility if the same token gets reused elsewhere
  "https://www.googleapis.com/auth/drive",
].join(" ");

const authParams = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPES,
  access_type: "offline",
  prompt: "select_account consent",
  login_hint: "josemanuel@wearecommonhouse.com",
  include_granted_scopes: "true",
});
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2-callback")) {
    res.writeHead(404);
    return res.end();
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");

  if (err) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h1>Authorization denied</h1><p>${err}</p>`);
    console.error("Authorization denied:", err);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400);
    return res.end("Missing code");
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <html>
      <head><title>Success</title></head>
      <body style="font-family: system-ui; padding: 40px; max-width: 600px;">
        <h1 style="color: #1F5200;">✓ Authorized</h1>
        <p>New refresh token generated (Gmail + Calendar + Drive scopes).</p>
        <p>Return to your terminal — it will print the token and exit.</p>
        <p style="color: #6B6B60; font-size: 14px;">You can close this tab.</p>
      </body>
      </html>
    `);

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("New GMAIL_REFRESH_TOKEN (replaces existing):");
    console.log(tokens.refresh_token);
    console.log("═══════════════════════════════════════════════════════════════\n");
    console.log("Scopes granted by this token:");
    console.log("  - gmail.modify");
    console.log("  - calendar.events");
    console.log("  - drive\n");
    console.log("Next steps:");
    console.log("1. Copy the refresh token above.");
    console.log("2. Update .env.local locally: replace GMAIL_REFRESH_TOKEN value.");
    console.log("3. Update Vercel: Settings → Environment Variables → Production →");
    console.log("   edit GMAIL_REFRESH_TOKEN with the new value.");
    console.log("4. Redeploy (vercel --prod --yes) so the new env var takes effect.");
    console.log("5. Smoke test: curl https://portal.wearecommonhouse.com/api/ingest/calendar?dry_run=1");
    console.log("   → should return ok:true instead of 'insufficient authentication scopes'.\n");

    server.close();
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    console.error("Token exchange failed:", e.message);
    res.writeHead(500);
    res.end("Token exchange failed — see terminal");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("Calendar OAuth — step 1 of 1");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("Opening Google in your browser. Sign in as josemanuel@wearecommonhouse.com");
  console.log("and click Allow. You will see three scopes:");
  console.log("  - Gmail (read/modify)");
  console.log("  - Calendar (events)");
  console.log("  - Drive\n");
  console.log("If the browser does not open, paste this URL manually:\n");
  console.log(authUrl, "\n");

  const opener =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", authUrl]]
      : process.platform === "darwin"
        ? ["open", [authUrl]]
        : ["xdg-open", [authUrl]];
  try {
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
  } catch {
    // fall back to manual paste
  }
});
