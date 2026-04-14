# Deploy — portal.wearecommonhouse.com

## Pre-requisites

- Vercel account with this repo connected
- Clerk production keys (`pk_live_*` / `sk_live_*`) -- do not go live with test keys
- DNS access for wearecommonhouse.com

---

## Step 1 -- Deploy to Vercel

```bash
# Option A: Vercel CLI
npx vercel --prod

# Option B: Vercel dashboard
# vercel.com → New Project → Import Git Repository → add env vars → Deploy
```

## Step 2 -- Environment variables

Add all of these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_***` |
| `CLERK_SECRET_KEY` | `sk_live_***` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/hall` |
| `NOTION_API_KEY` | `secret_***` |
| `ADMIN_USER_IDS` | Comma-separated Clerk user IDs |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |
| `SUPER_ADMIN_EMAILS` | Emails with Library ingest access |
| `ANTHROPIC_API_KEY` | Claude API key |
| `CRON_SECRET` | Shared secret for cron + agent-key auth |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google SA email (Drive access) |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google SA private key (newlines as `\n`) |
| `FIREFLIES_API_KEY` | Fireflies GraphQL API key |
| `GMAIL_CLIENT_ID` | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth refresh token |
| `GMAIL_USER_EMAIL` | Gmail address to ingest from |
| `NEXT_PUBLIC_APP_URL` | `https://portal.wearecommonhouse.com` |

Note: `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` is a multiline key. Store the full PEM string with literal `\n` sequences, not newlines.

## Step 3 -- Custom domain

1. Vercel Dashboard → project → Settings → Domains
2. Add: `portal.wearecommonhouse.com`
3. Add a CNAME record with your DNS provider:
   ```
   CNAME  portal  cname.vercel-dns.com
   ```
4. Wait for propagation (2-10 min with Cloudflare, up to 48h with others)

## Step 4 -- Clerk production setup

1. dashboard.clerk.com → your app → User & Authentication → Allowlist
2. Add client emails, or enable open sign-up
3. Confirm the app is using production keys before adding any client

## Step 5 -- Client activation

For each new client, add an entry to `CLIENT_REGISTRY` in `src/lib/clients.ts`:
- `projectId`: the Notion page ID from CH Projects [OS v2]
- `driveFolderId`: the Google Drive root folder ID for this client

Then set these fields in the Notion project record:
- `Primary Workspace`: `hall`, `workroom`, or `garage`
- `Hall Mode`: `live` (once the project is active)

See `src/lib/clients.ts` for the full activation checklist.

## Step 6 -- Smoke test

```
/vitrina              Public marketing page (no auth)
/hall                 Client Hall (sign in first)
/living-room          Community layer
/admin                Control Room main dashboard
/admin/os             Evidence pipeline
/admin/decisions      Decision Center
/admin/agents         Agent queue
/admin/living-room    Living Room curation
/residents            Residents directory
```

---

## Route status reference

| Route | Type | Status | Data source |
|---|---|---|---|
| `/vitrina` | Public | Live | Notion: People |
| `/hall` | Client | Live | Notion: Project, Evidence, Sources, People |
| `/workroom` | Client | Live | Notion: Project, Evidence, Sources |
| `/garage` | Client | Live (no project assigned yet) | Notion: Project, Evidence, Sources |
| `/dashboard` | Client | Live (legacy surface) | Notion: Project, Evidence, Sources |
| `/living-room` | All | Partial | Notion: People, Projects, Knowledge, Briefs |
| `/residents` | Admin | Live | Notion: People |
| `/library` | Admin | Live | Notion: Knowledge Assets |
| `/admin` | Admin | Live | Notion: Projects, Evidence, Briefings, Drafts |
| `/admin/os` | Admin | Live | Notion: Evidence, Sources |
| `/admin/knowledge` | Admin | Live | Notion: Knowledge Assets |
| `/admin/decisions` | Admin | Live | Notion: Decision Items |
| `/admin/agents` | Admin | Live | Notion: Agent Drafts |
| `/admin/grants` | Admin | Live | Notion: Opportunities |
| `/admin/living-room` | Admin | Live | Notion: People, Projects, Briefs |
| `/admin/garage-view` | Admin | Live | Notion: Projects, Valuations |
| `/admin/garage/[id]` | Admin | Live | Notion: Project, Cap Table, Data Room |
| `/admin/workrooms` | Admin | Live | Notion: Projects |
| `/admin/insights` | Admin | Partial | Notion: Insight Briefs |
| `/admin/comms` | Admin | Partial | Notion: Content Pipeline |
| `/admin/design` | Admin | Partial | Notion: Content Pipeline |
| `/admin/offers` | Admin | Partial | Notion: Offers, Proposals |
| `/admin/pipeline` | Admin | Partial | Notion: Opportunities, Projects |
| `/admin/deal-flow` | Admin | Partial | Notion: Opportunities |
| `/admin/health` | Admin | Stub | -- |
