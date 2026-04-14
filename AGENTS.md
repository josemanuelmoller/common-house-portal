<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:api-auth-rules -->
## API route auth — hard rule

`src/middleware.ts` marks `/api/*` as public. Clerk session enforcement does NOT apply to API routes.

Every new route under `src/app/api/` must implement explicit local auth:
- **Admin / user-triggered routes** → use `adminGuardApi()` from `src/lib/require-admin.ts`
- **Cron / agent / pipeline routes** → check `Authorization: Bearer <CRON_SECRET>` or `x-agent-key: <CRON_SECRET>` header

Never create a mutating API route without one of these two patterns.
Read-only intentionally-public routes (e.g. `/api/hall-data`, `/api/living-room/*`) are the only accepted exception — document them as "Public" in `docs/ROUTES_AND_SURFACES.md`.
<!-- END:api-auth-rules -->

<!-- BEGIN:client-component-refresh-rules -->
## Client component refresh checklist — hard rule

When writing or reviewing a `"use client"` component that calls a mutating API route (`POST`/`PATCH`/`DELETE` to `/api/*`), answer these four questions before finishing:

1. **Does this write affect data that is server-rendered on the same route?**
   — Look for server components above this component in the tree that call Notion/Supabase and render counters, lists, or summaries.
   — If yes → the component must call `router.refresh()` after a successful response.

2. **Is local React state already the authoritative visible result?**
   — Examples: a card that calls `onArchive(id)` and disappears from a parent list; an upload modal that appends to `localDataRoom` state.
   — If local state fully covers the visible change → `router.refresh()` is not needed.

3. **Is this triggered by a Next.js server action?**
   — Server actions should call `revalidatePath("/the/route")` at the end, not `router.refresh()` in the client.
   — Do not add a client-side `router.refresh()` to wrap a server action unless you have verified it is genuinely missing.

4. **Is `window.location.reload()` present?**
   — Replace it with `router.refresh()`. Hard reloads clear React state and are never the right tool here.

### Pattern to use

```typescript
import { useRouter } from "next/navigation";

const router = useRouter();

// inside the success branch only — not on error, not unconditionally
if (res.ok) {
  setLocalState(...);   // immediate feedback
  router.refresh();     // re-fetches server component data in background
}
```

`router.refresh()` is a soft re-render: server components re-execute and re-render with fresh data; client component state is preserved.
<!-- END:client-component-refresh-rules -->

<!-- BEGIN:pre-merge-sanity-checklist -->
## Pre-merge sanity checklist — hard rule

Before declaring any coding task complete, mentally run every applicable item below. Skip items that are clearly irrelevant to the change; do not skip any item that might apply.

| # | If I… | Did I verify… |
|---|---|---|
| 1 | created or changed a mutating API route | …that it calls `adminGuardApi()` or checks `CRON_SECRET`? (see api-auth-rules) |
| 2 | changed a `"use client"` component that calls a mutating route | …whether server-rendered UI on the same route needs `router.refresh()`? (see client-component-refresh-rules) |
| 3 | changed a Next.js server action | …whether `revalidatePath()` is needed, and that there is no redundant `router.refresh()` wrapping it? |
| 4 | wrote to or read from a Notion property | …that the exact field name matches the current schema contract (not a legacy alias, not a guess)? |
| 5 | used a Notion property accessor (`text()`, `select()`, `checkbox()`, etc.) | …that the accessor matches the actual Notion property type for that field? |
| 6 | wrote or compared a status / type / priority / workspace string literal | …that the literal matches the real DB contract value end-to-end (read filter = write value = UI comparison)? |
| 7 | changed any code | …that I re-read the changed files after editing to catch mechanical errors? |
| 8 | changed code structure (new file, moved function, changed types) | …that `tsc --noEmit` passes clean? |

**Failure modes this checklist targets** (recurring bugs already found in this repo):
- Mutating routes with no auth guard
- Stale server-rendered counters/lists after client mutations
- Notion field read/write mismatches (e.g. `"Draft Text"` vs `"Content"`, `"Channel"` vs `"Platform"`)
- Wrong accessor for property type (e.g. `text()` on a `select` field)
- Enum drift: `"P1"` / `"Urgent"` instead of `"P1 Critical"`; `"Channel"` vs `"Platform"`
<!-- END:pre-merge-sanity-checklist -->
