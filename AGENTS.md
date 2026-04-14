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
