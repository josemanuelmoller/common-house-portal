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
