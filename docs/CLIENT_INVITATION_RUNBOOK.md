# Client Invitation Runbook

Last reviewed: 2026-05-11

How to give a prospect or customer scoped access to their own `/hall/[slug]`
page on `portal.wearecommonhouse.com`.

This runbook is for the **Phase 1.1 client-access model** introduced on
2026-05-11. It supersedes the older `CLIENT_REGISTRY` hardcoded map in
`src/lib/clients.ts` (which still works for legacy users but is being
phased out).

## Mental model

```
Clerk user (email)  ←-------------→  client_access row  ←--→  projects.hall_slug
       │                                                              │
       └─── signs in ──→ /hall ──→ redirects to ──→ /hall/{slug} ─────┘
```

A user only sees a project if there is an **active** (`revoked_at IS NULL`)
row in `public.client_access` linking their Clerk user ID to the project's
UUID. Admins bypass this check entirely (`ADMIN_EMAILS` env var).

## Per-prospect onboarding (4 steps, ~5 min each)

### 1. Confirm the project + slug exist

The project must already exist in `public.projects` with a populated
`hall_slug`. Today (2026-05-11) we have:

| Slug | Project | Owner contact |
|---|---|---|
| `kinko` | Kinko — Pre-sale (Uruguay refill / marca propia) | Federico Ravecca (`federico@369.ad`) |
| `origenes-ecuador` | Orígenes Healthy Market — Pre-sale (Ecuador refill / desplastificación) | Tatiana Correa (`tatiana.correa.zenck@gmail.com`) |

For a new project, run:

```sql
update public.projects
   set hall_slug = '<lowercase-alnum-hyphen-slug>'
 where id = '<project uuid>';
```

Slug must match regex `^[a-z0-9][a-z0-9-]{0,62}$`.

### 2. Populate the Hall fields (so the page isn't empty)

The `/hall/[slug]` page reads only these columns from `projects`:

- `hall_welcome_note` — first paragraph the client sees
- `hall_current_focus` — one-line "what we're focused on"
- `hall_next_milestone` — what's coming next
- `hall_challenge` — discovery synthesis: the challenge
- `hall_matters_most` — discovery synthesis: what matters
- `hall_obstacles` — discovery synthesis: obstacles
- `hall_success` — discovery synthesis: what success looks like

Edit them in Supabase Studio or via the admin UI at
`/admin/projects/[id]`. If none are set, the page shows a polite empty
state but it's not a strong first impression — populate at least
`hall_welcome_note` before sharing the link.

### 3. Invite the client to Clerk Production

The client MUST exist as a Clerk user before they can be granted access.

**Option A — invite via Clerk dashboard (preferred):**
1. <https://dashboard.clerk.com> → switch to **Production** instance
2. Users → Invite → enter their email
3. They receive a Clerk-branded email with a sign-up link
4. They complete sign-up at `portal.wearecommonhouse.com/sign-in`

**Option B — let them self-sign up:**
- Make sure sign-ups are open in Clerk (User & authentication → Email →
  Sign-up with email = ON)
- Send them `portal.wearecommonhouse.com/sign-in` directly

Either way, **they must sign up before step 4 succeeds.**

### 4. Grant access via the admin endpoint

Two equivalent ways:

**Via API (recommended):**
```bash
curl -X POST https://portal.wearecommonhouse.com/api/admin/client-access \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <your admin Clerk session cookie>' \
  -d '{"email":"federico@369.ad","slug":"kinko","role":"viewer"}'
```

Optional fields:
- `role` — `"viewer"` (default) or `"collaborator"`
- `expiresAt` — ISO-8601 timestamp (e.g. `"2026-06-30T23:59:59Z"`).
  Useful for time-boxed demos. Omit for indefinite.

**Via SQL (when you don't have a session handy):**
```sql
-- First find their Clerk userId. In Clerk dashboard → Users → click them
-- → copy the User ID (starts with user_).
insert into public.client_access
  (clerk_user_id, granted_email, project_id, role, granted_by)
values
  ('user_abc123…',
   'federico@369.ad',
   '5787468c-a023-4041-8ae4-adcf32358c8f',  -- Kinko project UUID
   'viewer',
   'josemanuelmoller@gmail.com');
```

### 5. Tell the client the URL

Email template:

> Hi Federico,
>
> You can now access your Common House project space at:
>
> https://portal.wearecommonhouse.com/sign-in
>
> Sign in with the same email this message came from
> (federico@369.ad). After signing in you'll land directly in your
> project view.
>
> Let me know if anything looks off or if you can't get in.
>
> — Jose

---

## Revoking access

When a demo ends, a deal closes, or a contact leaves the company:

**API:**
```bash
curl -X DELETE \
  "https://portal.wearecommonhouse.com/api/admin/client-access?email=federico@369.ad&slug=kinko&reason=demo-window-ended" \
  -H 'Cookie: <your admin session cookie>'
```

**SQL:**
```sql
update public.client_access
   set revoked_at    = now(),
       revoked_by    = 'josemanuelmoller@gmail.com',
       revoked_reason = 'demo-window-ended'
 where clerk_user_id = 'user_abc123…'
   and project_id    = '5787468c-a023-4041-8ae4-adcf32358c8f'
   and revoked_at is null;
```

Effect is immediate (next request after revoke returns 403 / redirect to
`/no-access`). The Clerk user account itself is not deleted — they can
still sign in, but `/hall` will route them to `/no-access`.

To also delete the Clerk user entirely:
- Clerk dashboard → Users → click them → Delete user

## Auditing — who has access right now

```sql
select ca.id,
       ca.granted_email,
       p.hall_slug,
       p.name as project_name,
       ca.role,
       ca.granted_by,
       ca.granted_at,
       ca.expires_at
  from public.client_access ca
  join public.projects p on p.id = ca.project_id
 where ca.revoked_at is null
 order by ca.granted_at desc;
```

Run this monthly as part of `docs/compliance/CC6-logical-access.md`
review. Document each result row's continuing legitimate purpose.

## Two specific onboarding actions (2026-05-11)

### Federico Ravecca → /hall/kinko

1. ☐ Confirm Federico is the right contact for Kinko (DONE 2026-05-11 — confirmed by Jose)
2. ☐ Populate `hall_welcome_note` + at least `hall_challenge` on project `5787468c-a023-4041-8ae4-adcf32358c8f`
3. ☐ Invite `federico@369.ad` via Clerk Production dashboard
4. ☐ After he signs up: grant via API or SQL
5. ☐ Send him the URL

### Tatiana Correa → /hall/origenes-ecuador

1. ☐ Populate `hall_welcome_note` + at least `hall_challenge` on project `a8be2b46-7f9b-4e14-81b9-8e3a34f4af38`
2. ☐ Invite `tatiana.correa.zenck@gmail.com` via Clerk Production dashboard
3. ☐ After she signs up: grant via API or SQL
4. ☐ Send her the URL

## What clients DO NOT see

Hard-coded by `/hall/[slug]`'s narrow column SELECT — no need to filter at
runtime:

- ✗ Internal notes (any column outside the `hall_*` family)
- ✗ Agent draft queue (`/admin/agents`)
- ✗ Evidence raw / source emails (`evidence`, `sources` tables)
- ✗ Pricing / commercial pipeline (`opportunities`)
- ✗ Other clients' projects (only `where hall_slug = $1` returns 1 row)
- ✗ Knowledge Assets / IP library
- ✗ Cap table, financials, investor updates (garage workspace)
- ✗ Living Room community curation

The sidebar and admin nav are also hidden — clients see a clean,
single-page interface with no top-level navigation back to internal CH
surfaces.

## Files involved

- `supabase/migrations/20260511150000_client_access_and_hall_slug.sql` — schema
- `src/lib/require-client-access.ts` — auth helper (page + API guards)
- `src/app/hall/[slug]/page.tsx` — client-facing page
- `src/app/no-access/page.tsx` — denied landing
- `src/app/hall/page.tsx` — adds redirect to `/hall/{slug}` for granted users
- `src/app/api/admin/client-access/route.ts` — grant/revoke/list API
- `docs/ROUTES_AND_SURFACES.md` — route registry
- This runbook
