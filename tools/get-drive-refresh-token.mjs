#!/usr/bin/env node
/**
 * One-time Drive OAuth dance.
 *
 * Reuses the Gmail OAuth client from .env.local (GMAIL_CLIENT_ID /
 * GMAIL_CLIENT_SECRET). Requests Drive scope only — Gmail continues to
 * use its existing refresh token. The new refresh token printed at the
 * end goes into Vercel as DRIVE_OAUTH_REFRESH_TOKEN.
 *
 * Run:
 *   node tools/get-drive-refresh-token.mjs
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET present in .env.local
 *   - Drive API enabled on the same Google Cloud project that owns that
 *     OAuth client (Console → APIs & Services → Library → Google Drive API)
 */

import { google } from "googleapis";
import { createServer } from "http";
import { readFileSync } from "fs";
import { URL } from "url";
import { spawn } from "child_process";

// ─── Load credentials from .env.local ────────────────────────────────────────

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
  console.error("Set them first (they are the OAuth 2.0 client credentials from");
  console.error("Google Cloud Console for the same project you use for Gmail).");
  process.exit(1);
}

// ─── Local callback server (port 53682) ──────────────────────────────────────

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2-callback`;

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Build auth URL manually — avoids any library version quirks where
// response_type doesn't get serialised into the final URL.
const authParams = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/drive",
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
    res.end(`<h1>Authorization denied</h1><p>${err}</p><p>You can close this tab.</p>`);
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
        <p>Refresh token generated. Return to your terminal — it will print the token and exit.</p>
        <p style="color: #6B6B60; font-size: 14px;">You can close this tab.</p>
      </body>
      </html>
    `);

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("DRIVE_OAUTH_REFRESH_TOKEN:");
    console.log(tokens.refresh_token);
    console.log("═══════════════════════════════════════════════════════════════\n");
    console.log("Next steps:");
    console.log("1. Copy the refresh token above.");
    console.log("2. Go to Vercel → project → Settings → Environment Variables.");
    console.log("3. Add (Production scope) — using the SAME values as GMAIL for the first two:");
    console.log("   DRIVE_OAUTH_CLIENT_ID       = <same as GMAIL_CLIENT_ID>");
    console.log("   DRIVE_OAUTH_CLIENT_SECRET   = <same as GMAIL_CLIENT_SECRET>");
    console.log("   DRIVE_OAUTH_REFRESH_TOKEN   = <the token printed above>");
    console.log("4. Redeploy. Regenerations will sync to Drive automatically.\n");

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
  console.log("Drive OAuth — step 1 of 1");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("Opening Google in your browser. Sign in as josemanuel@wearecommonhouse.com");
  console.log("and click Allow.\n");
  console.log("If the browser does not open, paste this URL manually:\n");
  console.log(authUrl, "\n");

  // Try to open the browser automatically (Windows)
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
