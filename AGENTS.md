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

<!-- BEGIN:end-to-end-verification-rule -->
## End-to-end verification — hard rule

A fix is NOT done just because:
- code changed
- TypeScript passes
- the route looks correct in a code review
- a commit was pushed

**A fix is only done when the user-visible platform behavior has been validated end to end.**

### Required verification loop for every user-facing change

After any change that affects what a user sees or clicks:

1. Start the dev server (or confirm the staging/prod deployment is live)
2. Open the affected page in a real browser — use `mcp__Claude_in_Chrome__navigate` or `mcp__Claude_Preview__preview_start`
3. Reproduce the exact user flow that was broken or changed
4. Confirm the visible result is correct: correct data, correct UI, no empty sections, no noisy entries, no regressions
5. If the result is wrong, incomplete, empty, or not meaningfully improved → continue debugging. Do NOT declare success.

### Verification must use browser interaction — not static inspection

Valid verification:
- `mcp__Claude_in_Chrome__navigate` → screenshot/page text
- `mcp__Claude_Preview__preview_start` → `preview_screenshot` + `preview_snapshot`
- Checking actual network responses for the relevant API route
- Confirming data visible in the UI matches what Notion / the DB contains

Not valid as final verification:
- Reading the fixed code and concluding it "should work"
- Running `tsc --noEmit` and calling it done
- Checking a route file without confirming the UI renders correctly

### Applied to the Chief-of-Staff / Hall / Inbox fixes

Any change to: admin page, inbox triage, follow-up desk, candidate section, candidate scan, focus of day, or any Hall section — must be verified by loading `/admin` in the browser after the fix and confirming the affected section renders correctly with real data.

### When verification reveals the fix is incomplete

Keep the loop open. Debug, fix, deploy, verify again. Do not stop until the user-visible behavior is correct. Intermediate states like "the code looks right but I haven't checked" are not stopping points.
<!-- END:end-to-end-verification-rule -->

<!-- BEGIN:runtime-verification-rule -->
## Runtime verification — production requirement (hard rule)

User-visible validation MUST be performed in the production environment:

https://portal.wearecommonhouse.com

Localhost validation is NOT sufficient to declare a fix complete.

### Completion rule

A user-facing fix is ONLY considered complete if:

1. It is deployed
2. It is verified in production (portal.wearecommonhouse.com)
3. The visible UI behavior is confirmed there

Claude MUST explicitly state where verification was performed:
- "Verified in localhost" → NOT sufficient
- "Verified in production" → REQUIRED for completion

If localhost and production differ:
→ production is the source of truth
→ continue debugging until production matches expected behavior
<!-- END:runtime-verification-rule -->

<!-- BEGIN:production-domain-and-env-verification-rule -->
## Production domain and environment verification — hard rule

Do not assume the locally linked Vercel project is the same project that serves the production domain.

Before treating any production deploy, environment-variable change, or runtime diagnosis as valid, verify all three of these explicitly:

1. **Which Vercel project actually serves the production domain?**
   — Confirm which project is assigned to `portal.wearecommonhouse.com`
   — Do not assume the current working directory is linked to the correct project

2. **Is the deploy target the same project that serves production?**
   — A successful deploy to the wrong Vercel project is a non-event
   — Production verification must happen on the actual production domain, not just on a preview or on the CLI-linked project

3. **Are the runtime environment variables present under the exact names the code reads?**
   — Verify required vars exist in the real production project
   — Verify server-side vars use the exact names expected by runtime code, not legacy aliases
   — After env changes, verify from the production runtime whenever possible

### Secret piping rule

When adding env vars through the Vercel CLI, use `printf "%s"` rather than `echo`.
`echo` adds a trailing newline, which can silently corrupt URLs, keys, and other secrets.

### Supabase verification rule

After any deploy or env change that affects Supabase:
- call the production API route that depends on that data source directly
- confirm it returns the expected records, not just `200 OK`
- treat `200 OK` with empty data as a failure condition until the expected dataset is confirmed

### Fallback observability rule

Any code path that falls back from a primary data source to a secondary one must:
- emit a visible warning in runtime logs
- make the fallback detectable during debugging
- avoid looking like a healthy primary-path success when it is actually degraded

For critical Hall surfaces, prefer a visible source indicator when feasible, for example:
- `Source: loop-engine`
- `Source: notion-fallback`
<!-- END:production-domain-and-env-verification-rule -->

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
| 9 | changed a deploy target, production env var, Supabase config, or runtime data source | …which Vercel project serves `portal.wearecommonhouse.com`, that the change was made there, and that production runtime values were verified? (see production-domain-and-env-verification-rule) |
| 10 | relied on a fallback path after a primary read failed | …that the fallback is observable in runtime logs and cannot silently masquerade as a healthy primary path? (see production-domain-and-env-verification-rule) |

**Failure modes this checklist targets** (recurring bugs already found in this repo):
- Mutating routes with no auth guard
- Stale server-rendered counters/lists after client mutations
- Notion field read/write mismatches (e.g. `"Draft Text"` vs `"Content"`, `"Channel"` vs `"Platform"`)
- Wrong accessor for property type (e.g. `text()` on a `select` field)
- Enum drift: `"P1"` / `"Urgent"` instead of `"P1 Critical"`; `"Channel"` vs `"Platform"`
- Deploying to the wrong Vercel project
- Updating env vars in the wrong project or under the wrong variable name
- Treating `200 OK` with empty Supabase data as a healthy result
- Silent fallback masking a degraded primary data path
<!-- END:pre-merge-sanity-checklist -->
