# Drive OAuth setup for plan-master-agent regeneration

The `POST /api/plan/artifacts/[id]/regenerate` endpoint uploads v{N+1} of an artifact into the same Drive folder as v1. It authenticates as **José** (not the service account) so uploaded files are owned by the user and appear in their My Drive — consistent with the v1 files created via the Drive MCP.

This is a **one-time setup**. Once the refresh token is in the environment, regenerations sync to Drive automatically.

## Prerequisites

- A Google Cloud project with the **Drive API enabled**
- An OAuth 2.0 Client ID of type **Web application** (the same one used for Gmail is fine — can be reused if you add the Drive scope to its consent screen)

## Steps

### 1. Add Drive scope to the OAuth consent screen

Google Cloud Console → APIs & Services → OAuth consent screen → Edit app → add scope:

```
https://www.googleapis.com/auth/drive
```

(If you want the narrower scope that only touches files the app creates, use `https://www.googleapis.com/auth/drive.file` — but that will not let the agent write into existing folders like `CH OS/Plan/2026-Q2/...`, so use full `/drive`.)

### 2. Obtain a refresh token

Run a one-time local OAuth dance. The simplest tool is `get_refresh_token.js` below. Create it locally:

```js
// save as tools/get-drive-refresh-token.js
import { google } from "googleapis";
import readline from "readline";

const CLIENT_ID     = process.env.DRIVE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.DRIVE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI  = "urn:ietf:wg:oauth:2.0:oob";

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/drive"],
});

console.log("\n1. Open this URL in a browser (signed in as josemanuel@wearecommonhouse.com):\n");
console.log(url);
console.log("\n2. Paste the authorization code here:");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("code: ", async (code) => {
  const { tokens } = await oauth2.getToken(code.trim());
  console.log("\nRefresh token:\n", tokens.refresh_token);
  rl.close();
});
```

Run it:

```bash
DRIVE_OAUTH_CLIENT_ID=xxx DRIVE_OAUTH_CLIENT_SECRET=yyy node tools/get-drive-refresh-token.js
```

Copy the printed refresh token.

> NOTE: the redirect URI `urn:ietf:wg:oauth:2.0:oob` is the "copy/paste" flow and is being deprecated. If Google refuses it, use a localhost redirect (`http://localhost:3000/oauth2-callback`) and host a tiny handler for the duration of the OAuth dance. Any implementation gives the same result — a refresh token string.

### 3. Set the three env vars

In **Vercel → Project → Settings → Environment Variables** (production):

```
DRIVE_OAUTH_CLIENT_ID       = <client id>
DRIVE_OAUTH_CLIENT_SECRET   = <client secret>
DRIVE_OAUTH_REFRESH_TOKEN   = <refresh token from step 2>
```

Use `printf "%s"` (not `echo`) if piping via CLI — `echo` adds trailing newlines that corrupt the token.

### 4. Redeploy

New env vars are only picked up after a deploy.

### 5. Verify

In `/admin/plan/artifacts`, answer 3+ questions on a draft and hit "Regenerate". On success the response body includes `drive_uploaded: true`, and the new version card in the UI shows "Drive →" instead of "Drive sync pending".

## Failure modes

- **Env vars missing** → regeneration still works, content lives in DB, UI shows "Drive sync pending". `drive_uploaded: false` in response.
- **Refresh token invalid/expired** → Drive API returns 401. The endpoint catches, logs, and continues — DB state is consistent, user sees "Drive sync pending". Re-run the OAuth dance to mint a new token.
- **Folder not shared with OAuth user** → cannot happen today because v1 was created by the same user, so their OAuth has access. Would only break if a folder was created by a different identity.

## Rotation

Refresh tokens expire if:
- User password changes
- User revokes the app from their Google account
- 6 months of inactivity (rare — the regenerate loop keeps it active)

When that happens, repeat step 2 and update the env var.
