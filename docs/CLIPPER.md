# Common House Clipper (Chrome extension)

Web clippings → `CH Sources [OS v2]` with `Source Type = Clipping`, `Source Platform = Web`.

## Architecture

```
Chrome extension (MV3)  ──►  POST /api/clipper  ──►  Notion CH Sources [OS v2]
  popup.html  (Clip UI)       Bearer CLIPPER_TOKEN
  options.html (settings)     dedup by sha256(url + selection)
```

- **Extension:** `chrome-extension/clipper/` — loads unpacked into Chrome.
- **API:** `src/app/api/clipper/route.ts` — accepts `Authorization: Bearer <CLIPPER_TOKEN>` OR a Clerk admin session as fallback.
- **Dedup:** Same URL + same selection (first 500 chars) → same `Dedup Key` → returns existing record instead of duplicating.

## One-time setup

### 1. Provision the token

Pick a long random string (e.g. `openssl rand -hex 32`) and add it to each environment:

```bash
# Local dev
printf "CLIPPER_TOKEN=%s\n" "<your-token>" >> .env.local

# Vercel production (use printf — echo adds newline)
printf "%s" "<your-token>" | vercel env add CLIPPER_TOKEN production
```

Restart the dev server after editing `.env.local`.

### 2. Load the extension in Chrome

1. Open `chrome://extensions/`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** → select `chrome-extension/clipper/`.
4. Pin the **Common House Clipper** icon to the toolbar.

### 3. Configure the extension

1. Right-click the extension icon → **Options**.
2. Paste the `CLIPPER_TOKEN` into the **Clipper token** field.
3. Set **API URL**:
   - Production: `https://portal.wearecommonhouse.com/api/clipper` (default)
   - Local dev: `http://localhost:3000/api/clipper`
4. Click **Save**, then **Test connection** — a successful response creates a probe clipping with URL `example.invalid/clipper-test-<timestamp>`.

## Daily use — web pages

1. On any web page, optionally select the text you want to save.
2. Click the extension icon.
3. Either edit the selection manually, or click **Grab full page** to auto-extract the main article text (drops navs, footers, cookie banners, sidebars, ads). Edit to taste.
4. Add a short note on **why** this matters (optional but useful).
5. Click **Clip**.
6. The clipping lands in CH Sources with status `Ingested`. Downstream pipelines (`extract-meeting-evidence`, `evidence-to-knowledge`) pick it up on the next run.

## Daily use — WhatsApp Web conversations (v0.4.0+)

When the active tab is `web.whatsapp.com`, the popup automatically switches
to conversation mode.

1. Open the chat you want to capture in WhatsApp Web.
2. Click the extension icon.
3. Click **Clip conversation**. The extension auto-scrolls to the top of the
   chat, harvesting messages as WhatsApp lazy-loads them. Progress is shown
   as a status line; expect 2–10 seconds for chats of a few hundred
   messages, up to ~60s for very long chats (hard cap).
4. Review the extracted conversation in the Selection textarea — each line
   is formatted as `[HH:MM, DD/M/YYYY] Sender: text`. Edit or trim if
   needed.
5. Add a note on why the conversation matters.
6. Click **Clip**.

**Media messages** (images, audio, video, stickers, documents) are recorded
as placeholders like `[image]`, `[audio]` — the media itself is not
uploaded. If you need the media, take a screenshot and use the regular
clipping flow on that screenshot's hosting page.

**Privacy:** you are capturing your own authenticated chat. Content of
other participants enters the CH knowledge layer. Only clip conversations
you have the right to share with the CH system.

**Known limits of v0.4.0:**
- Captures only the currently-open conversation (not multiple chats).
- Relies on `data-pre-plain-text` attribute being present — this is stable
  across WhatsApp Web versions, but system/deleted messages without it are
  skipped.
- Auto-scroll timeout is 60s; in chats with thousands of messages, older
  history may be truncated. The status line says "scroll timed out" in
  that case.

## Fields written to `CH Sources [OS v2]`

| Notion field        | Value                                          |
|---------------------|------------------------------------------------|
| Source Title        | Page `<title>` (capped at 180 chars)           |
| Source Type         | `Clipping`                                     |
| Source Platform     | `Web`                                          |
| Source URL          | Page URL                                       |
| Processing Status   | `Ingested`                                     |
| Source Date         | Today                                          |
| Dedup Key           | `clipping:<sha256(url + selection).slice(0,32)>` |
| Processed Summary   | `<selection>\n— Notes —\n<notes>` (max 1900)   |
| Linked Projects     | Only if `projectId` passed in payload (not yet set from UI) |

On first use you may need to add the `Clipping` option to the **Source Type** select in Notion, and `Web` to **Source Platform** — Notion usually auto-creates new select options via the API, but verify after the first clip.

## Upgrade paths (not built yet)

- **Per-user tokens:** today a single `CLIPPER_TOKEN` is shared across admins. Replace with per-user tokens (stored in Supabase `clipper_tokens` table, validated by API) when more than a handful of people use the extension.
- **Right-click context menu:** quick-clip without opening the popup — add `"contextMenus"` permission and a `background.js` service worker.
- **Project picker:** the popup doesn't yet expose a project selector. Hit `/api/hall-data` or similar to list projects and let the user attach a clipping to a specific project.
- **Firefox/Safari:** MV3 manifest is close to cross-browser; Safari needs Xcode wrapping, Firefox supports MV3 natively.

## Troubleshooting

| Symptom                          | Likely cause                                     |
|----------------------------------|--------------------------------------------------|
| `401 Unauthorized`               | Wrong `CLIPPER_TOKEN` in extension settings, or env var not loaded by the server. Restart dev server after editing `.env.local`. |
| `Valid http(s) url required`     | Extension sent an empty URL — usually because the active tab is a `chrome://` page. |
| "Network error" in popup         | API URL wrong or server down. Check the URL in settings. |
| Clipping created but not linked to a project | Project linking is not yet wired in the popup — see upgrade path above. |
| Success but no record in Notion  | Check Vercel runtime logs for a 500 from the Notion API (bad `Dedup Key` accessor, bad select option, etc.). |
