# Portal 2.0 — Phase 8: safe release + first client onboarding

Phases 0–7 are code-complete and deployed to production. Phase 8 is the release
and onboarding runbook. It is split deliberately: **what the portal now does for
you** (automated + verifiable), and **what only you can do** (infrastructure,
credentials, and the real client relationship — these cannot and must not be
automated).

## 1. Health verification (automated)

`GET /api/portal-2/health` (cron/admin auth) probes every Portal 2.0 table and the
required env vars. Treat `ok:false` as a failure **even on HTTP 200** — a 200 with
a null table count or a missing env var is a degraded state, not health.

```
curl -s "$PORTAL/api/portal-2/health" -H "Authorization: Bearer $CRON_SECRET"
```

Add `?project=<uuid>` to include that project's onboarding readiness.

## 2. Onboarding readiness (automated)

Each project's client-room admin page (`/admin/projects/[id]/client-room`) now
opens with an **Onboarding readiness** checklist, also available at
`GET /api/portal-2/health?project=<id>`:

| Check | Meaning |
|---|---|
| Client room enabled | `projects.client_room_enabled` |
| Public slug set | `projects.hall_slug` |
| Organization linked | `projects.organization_id` |
| Current state confirmed | `project_states.state_status = 'current'` (not `draft`) |
| A shared agreement (what we heard) | ≥1 client-visible `project_agreements` |
| At least one client-visible material | ≥1 `project_materials` at `visibility='client'` |
| At least one active access grant | ≥1 non-revoked `client_access` |

A room should clear all seven before a client is invited. The checklist only
reports — it never sends anything.

## 3. Preview / staging environment — **needs you** (infra decision)

Localhost cannot exercise the client-facing flow because **production Clerk
rejects `localhost` sign-in by design**, and Supabase is currently only wired to
the Vercel *Production* environment. Pick one:

- **(Recommended) Staging Clerk + Supabase branch.** Create a Clerk *development*
  instance and a Supabase branch, and set their keys as Vercel *Preview* env vars.
  Preview deploys then run a full, isolated sign-in + client-room flow.
- **Authorized preview domain.** Add a stable preview domain to the production
  Clerk instance's allowed origins. Simpler, but preview then shares production
  Clerk/Supabase — acceptable only for a trusted internal rehearsal.

Claude cannot do this step: creating Clerk/Supabase accounts and entering their
credentials is out of scope by design. Do **not** paste the production
`SUPABASE_SERVICE_KEY` into all previews without an explicit decision.

## 4. First client onboarding — steps

Automated by the portal (you drive them in the UI):

1. Pick the pilot project; enable the room and set a slug (`ClientRoomSettings`).
2. Link the organization (`projects.organization_id`).
3. Confirm the current state (state page → set `state_status = current`).
4. Create the "what we heard" understanding agreement and **share** it.
5. Sync Drive, then mark the right materials `visibility = client`.
6. Grant access to the client's corporate email and send the invitation
   (`ClientAccessManager` → `/api/admin/client-access`). The grant activates when
   Clerk reports that email as verified.

**Needs you** (cannot be automated): choosing the real pilot client, and the
irreversible outward actions — sending the invitation email and approving a
commercial agreement / purchase order. The portal prepares all of these; a human
performs the send/approve.

## 5. Legacy surfaces — cleanup note (not done, deliberate)

`/admin/now` is the new operating direction, but the older Focus/alerts surfaces
have not been removed. Retiring them is a product-judgment call and was left
untouched. Retire or simplify them only once `/admin/now` has run on real cron
cadence for long enough to trust its signal — not before.

## MPS Proposal Room — remaining manual steps (first real client)

The MPS room is built and populated **internal-only** (org `Maritime Procurement
Services`, project `MPS`, room `/hall/mps`). Nothing is client-visible and no
invitation has been sent. Admin surfaces:
- Client view (admin preview): `/hall/mps`
- Admin controls: `/admin/projects/5d94ae10-c944-4a58-ab37-c8c6f051b15c/client-room`

What only you should do, in order:
1. **Review "Lo que escuchamos"** (currently DRAFT/internal, sourced to the 15 Jul 2026
   Fireflies meeting). Edit if needed, then use **"Share for response"** to publish it
   (draft → shared/client). Until then the client sees "preparing the first synthesis".
2. **Provide the current proposal file** (Drive). It will be indexed as a client-visible
   `proposal_budget` material with version/date; the "Our proposal" section links to it.
3. **(Optional) MPS Drive folder**: set the room's Drive folder id and sync, then mark
   only the correct files `visibility=client`. Client data (ops xlsx) and Fireflies
   summary/transcript stay `internal`.
4. **Grant + invite** `atrillo@maritimeps.com` and `jvaldivia@maritimeps.com` (role
   viewer or collaborator) via `ClientAccessManager` — this is the real invitation
   (sends a Clerk email); do it only when ready. The grant activates when Clerk reports
   the email as verified.
5. **Rehearse** with a non-admin email first if you want to see it exactly as MPS will.

Do not skip step 1/2 review — publishing is what makes content client-visible.

## Status

- Phases 0–7: code-complete, deployed, verified. Migrations `portal_v2_client_room`
  → `promote_learning` applied to `rjcsasbaxihaubkkkxrt`.
- Phase 8: health + readiness shipped; environment/onboarding steps above await the
  infra decision and a real pilot client.
