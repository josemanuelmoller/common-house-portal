# Development Status

A candid summary of what is live, what is partial, and where the risks sit.

---

## What looks production-relevant

These areas are built, handling real data, and appear actively maintained:

**The Hall (`/hall`)** is the most complete surface. It is per-project, auth-gated, Notion-driven, and has a thoughtful content model (hallMode, primaryWorkspace, narrative fields). The code is well-structured with proper Next.js data caching, type safety, and fallback handling.

**The Control Room (`/admin`)** is the primary internal interface. The Sprint A/B redesign gave it a clear 10-section layout with real data from multiple Notion databases. The P1 banner, agent queue, follow-up queue, and portfolio table are all rendering live data.

**The OS pipeline** (cron jobs in `vercel.json`) is the most operationally significant part of the codebase. 12 Vercel cron entries run Monday-Friday (or weekly/biweekly for competitive-monitor and grant-radar), moving data from Fireflies and Gmail through Claude into Notion. This pipeline is the core of the OS model.

**The Workroom (`/workroom`)** is fully built. The Hall/Workroom split is well-designed -- both surfaces read the same Notion data but show different lenses. The `WORKSPACE_READY` flag model is clean.

**The Garage (`/garage`)** is built. It mirrors the Workroom structure for startup engagements. It has not been activated for a real project yet (no `primaryWorkspace = garage` entry in Notion at time of writing), but the code is complete.

**The Notion data model** is mature. 21 databases with clear relationships, typed in `src/lib/notion.ts`. The `DB` constant gives every database a named constant.

---

## What looks MVP or in-progress

**Living Room (`/living-room`)**: Real data from Notion, auth required, basic modules implemented. But curation logic and privacy gating (public-safe vs community vs private) may not be fully enforced. The `LivingRoomClient.tsx` component handles filtering on the client side.

**Commercial layer** (`/admin/pipeline`, `/admin/offers`, `/admin/deal-flow`, `/admin/investors`, `/admin/opportunities`): These admin routes exist and read from Notion, but several are marked "partial" -- unclear if all fields are rendered, whether writes work fully, or if the UI matches the operational intent. The Notion data itself (opportunities, proposals, offers) is richer than what the UI currently surfaces.

**Desk request forms**: Defined in PLATFORM-IA.md as a key entry UX pattern for Design/Comms/Insights/Grants/Proposals desks. A form component exists (`DeskRequestForm.tsx`) and a route exists (`/api/desk-request`). Whether this is connected end-to-end is not confirmed.

**`/admin/health`**: Listed in the nav as "System Health" but is a stub. No data rendered.

**`/admin/my-rooms`**: Personal lens feature. Implemented but scope and completeness unclear.

---

## What looks static or transitional

**`/dashboard`**: This is an older surface that predates the Hall/Workroom split. It has `UploadZone`, a raw `MeetingsSection`, and `CollapsibleSection` -- components that were built before the cleaner workspace model. It is still accessible via the sidebar as "Overview." Its ongoing role is ambiguous. It may be retired when Hall + Workroom cover its use cases fully.

**`public/portal/*.html` mockups**: These were the original design references built before the Next.js app existed. `living-room-admin.html` and `design-system.html` are still actively referenced. The others (`hall-vitrina.html`, `hall-mockup.html`, `control-room.html`, `platform-admin.html`, `residents-mockup.html`, `competitive-intel.html`) are legacy references. They risk going out of sync with the live implementation. They are useful for design context but should not be treated as specifications.

**`PLATFORM-IA.md` Section 10**: This section says "common-house-app/ does not yet exist as a subdirectory. Every CH platform surface is currently a static HTML file." This is no longer true. Section 10 describes a pre-implementation state. It should not be consulted for current architecture.

**`DEPLOY.md`**: Partially accurate but contains a stale status table that calls Workroom a "stub" and omits Supabase env vars.

---

## Unrelated code in this repo

**`backend/` directory**: A Python FastAPI application with SQLite (`test.db`), SQLAlchemy models, schemas, services, workers, and pytest tests. This is not referenced anywhere in the Next.js portal code. The PLATFORM-IA.md mentions "AlmacenIQ" as a separate app -- this backend is likely from that project or a similar unrelated engagement. It is dead weight in this repo.

**`frontend/` directory**: Contains only a `tsconfig.tsbuildinfo` file. Appears to be build artifacts from another project. Not used by the Next.js portal.

Neither directory should be modified as part of portal development. Whether they should be removed or extracted to a separate repo is a judgment call for the team.

---

## Biggest technical risks

**1. One hardcoded client in `clients.ts`**
`CLIENT_REGISTRY` in `src/lib/clients.ts` maps client emails to Notion project IDs. There is currently one entry. The comment says to migrate to Supabase at 20+ clients. Until then, adding or removing clients requires a code change and redeploy. If the email or project ID changes in Notion, the portal silently shows "No project linked" to the client.

**2. Clerk is likely on test keys**
The comments in `clients.ts` flag `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as `pk_test_*`/`sk_test_*` and mark Clerk key rotation as "PENDING." No real client should be onboarded until production Clerk keys are in place.

**3. Supabase env vars missing from deployment docs**
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are required for garage document uploads and library ingestion. They are not listed in `DEPLOY.md`. A deployment without them would silently break file upload features.

**4. Evidence pipeline has no reconciliation**
The garage upload flow writes to Supabase (file storage) and then to Notion (Data Room record) in two separate HTTP calls. If the second call fails, the file is orphaned in Supabase with no Notion record. There is no cleanup or reconciliation mechanism.

**5. Admin auth is inconsistent across API routes**
Some routes use `adminGuardApi()` from `src/lib/require-admin.ts`. Others use a local `authCheck()` function that accepts `x-agent-key`/`CRON_SECRET`. The middleware marks all `/api/*` routes as public -- security depends entirely on per-route checks. A route that is missing its auth check would be unprotected.

---

## Biggest architecture risks

**Notion as the only database**
All structured data lives in Notion. If the Notion API is slow, rate-limited, or has an outage, the entire portal degrades. The Hall page uses `unstable_cache` with a 30-minute TTL which mitigates this for client-facing pages, but the admin surface has `force-dynamic` on most routes and no caching layer.

**CLIENT_REGISTRY scaling ceiling**
The current model requires a deploy for every new client. This is fine at 1-5 clients. At 15+, it becomes a maintenance burden and a deployment risk (wrong project ID for one client breaks that client's entire session).

**No test coverage**
There is no test infrastructure in the Next.js app (no Jest, no Playwright). The Python `backend/` has pytest, but that is for the unrelated app. API route behavior changes are not verified by any automated checks.

---

## Immediate cleanup priorities

1. Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to `DEPLOY.md`.
2. Update the status table in `DEPLOY.md` -- Workroom is fully built, not a stub.
3. Remove or annotate the outdated Section 10 in `.claude/PLATFORM-IA.md`.
4. Clarify the role of `/dashboard` -- retire it or document it explicitly.
5. Decide what to do with `backend/` and `frontend/` -- they are unrelated and should not be in this repo.
6. Rotate Clerk keys to production before any client activation.
7. Add `admin/health` implementation or remove it from the nav until it is ready.
