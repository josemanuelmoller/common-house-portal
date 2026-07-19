# ADR-001 — Relational Network Model (Nature / Relationship / Opportunity / Project / Role)

**Status:** Proposed (Phase 0 complete — audit + design + compatibility plan)
**Date:** 2026-07-18
**Owner:** José Manuel Möller
**Scope:** How Common House represents organizations, their durable relationships, commercial opportunities, projects, and per-project participation — so the same organization can be, at once, a *nature* (startup / company / fund…), a *durable relationship* (portfolio / client / partner…), and a *role in someone else's project* (technology provider…), without any of those collapsing into a single overloaded status.

This ADR is the Phase 0 deliverable. It records **real contracts read from code and the production database**, the target model, and an additive/compatibility plan. It does **not** apply any migration or change any production data. Migrations are authored as reviewable files and applied to prod only after explicit approval, one at a time.

---

## 0. Executive summary of the decision

- **Do not make "project" the universal container.** A proposal lives as an **opportunity**; execution lives as a **project**; the organization keeps a **durable relational memory** that survives both.
- Separate five concerns that are currently smeared together: **nature**, **durable relationship**, **opportunity**, **project**, **per-project role**.
- All changes are **additive**. No existing column is dropped in this phase; legacy columns are demoted to "read for compatibility" and stop being the source of truth gradually.
- Ambiguous re-classifications are **never silent** — they go through the existing `decision_items` human-review queue.

---

## 1. Environment reality (confirmed, not assumed)

### 1.1 Two repositories, one database

There are **two separate git repos**, both named `common-house-app` in `package.json`, sharing the **same** canonical Supabase project `commonhouse` (`rjcsasbaxihaubkkkxrt`, ACTIVE, eu-west-1):

| Repo | Path / branch | Owns |
|---|---|---|
| **common-house-app** (this working dir) | `…\Escritorio\Claude Code`, branch `fix/portal-no-notion-links` | OS v2 / Hall admin: `organizations`, `org_category`, relationship classes, `opportunities`, `people`→org, `engagements`, Hall surfaces, `v_org_status` |
| **common-house-portal** | `…\Documentos\New project\common-house-portal`, branch `codex/portal-2-foundation` | Portal 2.0: Client Rooms, `project_materials`, `project_agreements` (+ `respond_to_project_agreement` RPC), state-refresh engine, project memory (`project_states`/`project_state_proposals`), `entity_links`, learning promotion, `/admin/now` |

The production domain **portal.wearecommonhouse.com** is served by **common-house-portal** (per prior deploy records). The `2026071*` migrations already applied to the shared DB were authored in **common-house-portal**; they are present in the DB but **absent from this repo's `supabase/migrations/`**.

### 1.2 Ownership map for this ADR (decision: "split by surface")

| Deliverable | Home repo |
|---|---|
| Shared additive migrations (`organization_relationships`, `opportunities` extensions, `project_organization_roles`, `person_organization_memberships`) | **common-house-app** authors them; applied once to the shared DB |
| Client Room evolution (attach Room to an `opportunity` — `client_access` / `project_materials` / `project_agreements` gaining `opportunity_id`) | **common-house-portal** (it owns those tables + RPCs) |
| Org nature + durable-relationship admin, opportunity CRUD, opportunity→project conversion UI, people↔org membership | **common-house-app** |
| State-refresh / evidence-context awareness of the new tables, `/admin/now` grouping by work-context | **common-house-portal** |

Because the DB is shared, either repo can *read* any table; the split governs where new **code** and **write paths** live.

### 1.3 Conventions to match

- **Migrations:** `YYYYMMDDHHMMSS_snake_case.sql`, additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, guarded `DO $$ … pg_constraint … $$`).
- **RLS:** every table `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM anon, authenticated` and **no permissive policies** → service-role-only (service role bypasses RLS). This is the pattern on every business table today (`policies = null`, `rls_enabled = true`).
- **RPCs:** `SECURITY DEFINER` + `SET search_path = public` (as used by `commit_state_proposals`, `apply_state_proposal`, `link_subject_entities`, `respond_to_project_agreement`, `next_evidence_batch`, `promote_learning_item`). Trigger fns use `search_path = public, pg_temp`.
- **API auth:** mutating routes call `adminGuardApi()` (admin/user) or check `CRON_SECRET` (cron/agent). Client-facing Room routes use `clientAccessGuardApi()`.
- **Linkage is mid-migration:** some tables link by `organization_id`/`project_id` **uuid**, others by `org_notion_id`/`project_notion_id` **text** (Notion id). New tables use **uuid FKs**; where a legacy text-notion pointer is the only available join, carry it as a nullable secondary column.

---

## 2. Real contracts (as they exist today)

> Base business tables (`organizations`, `projects`, `opportunities`, `evidence`, `people`, `engagements`) were created directly in Supabase (pre-migration-folder) — column truth is the DB + the TypeScript `.select()`/validators, not a repo migration.

### 2.1 `organizations`
Key columns: `id uuid`, `notion_id text`, `name text`, **`org_category text`**, `org_domains text`, `themes text`, **`relationship_stage text`**, **`relationship_classes text[]`**, `engagement_type text`, `engagement_value numeric`, `engagement_status text`, startup_* fields, `country/city/website/notes`.

**Editor whitelist** (`OrganizationEditor.tsx`, `api/admin/organizations/[id]/route.ts`) — `org_category ∈ {Startup, Corporate, NGO, Public, Other}`; `relationship_stage ∈ {Prospect, Active Client, Lapsed, Archived, Partner, Investor, Funder, Vendor}`. **This whitelist does not match stored values** (see §3).

### 2.2 `org_category` — production values (nature axis, polluted)
`Corporation`(16), `Funder`(16), `∅`(14), `Startup`(11), `Government`(6), `NGO`(5), `Vendor`(2), `Internal`(1), `Landscape Reuse Op`(1), `Client`(1).
→ `Funder`, `Vendor`, `Client` are **relationships**, not natures. `Corporation` = "Empresa".

### 2.3 Relationship signal is split across three places
- `organizations.relationship_stage` (single text): `Prospect`(17), `Active`(12), `Monitoring`(10), `∅`(30), `Partner`(2), `Active Client`(2).
- `organizations.relationship_classes[]`: almost empty (`∅`×72, `Client`×1).
- **`v_org_status`** (DB view, **DDL not in repo** — recovered and archived in §Appendix A): derives `relationship_type` + `operational_state` from `projects.primary_org_notion_id` + `projects.engagement_model` + `engagements`. Portfolio ⇐ a project with `engagement_model='startup'`; Client ⇐ active `engagements` of type `Client`; operational_state ⇐ project status × engagement_model.
- `people.relationship_classes[]` (richer): `External`(82), `Partner`(76), `VIP`(23), `Client`(19), `Portfolio`(11), `Funder`(5), `Prospect`(5), `Investor`(4), `Vendor`(3)…
- `hall_organizations.relationship_classes[]` valid set: `Team, Portfolio, Client, Prospect, Partner, Investor, Funder, VIP, Vendor, External`.

### 2.4 `projects`
`id uuid`, `notion_id text`, `name text`, **`project_status text`**, **`current_stage text`**, `engagement_model text`, `engagement_stage text`, **`organization_id uuid`** (FK; often NULL), `primary_org_notion_id text`, `client_room_enabled bool`, `client_room_status text`, `client_room_label text`, `hall_slug text`, `hall_*` narrative columns, `status_summary` (human), `draft_status_update` (agent preview).
- `project_status` values: `Active`(13), `Proposed`(7), `Not started`(1), `∅`(1). `current_stage`: `Discovery, Pilot Planning, Stakeholder Alignment, Pilot Live, Design, Scale, Scoping, Propuesta en revisión`.
- **Two conflicting stage vocabularies:** DB write-path enum (`engagement_stage ∈ Lead/Qualifying/Proposal/Negotiation/Won/Active/Closed/Lost`) vs product-model `EngagementStage ∈ {"pre-sale","active"}` (`types/house.ts`). "pre-sale" exists only in the product model; a third literal `"Execution"` appears in `workrooms`.
- **No `projects.status` / `projects.stage` columns** — those names in agent docs are stale.

### 2.5 `opportunities` (real table, actively used)
`id uuid`, `title`, **`status text`**, `opportunity_type text`, `scope text`, `qualification_status`, `org_name`, **`org_notion_id text`** (org link — text, *not* a uuid FK), `linked_portfolio_org_notion_id text`, `value_estimate`, `expected_close_date`, follow/active flags. **No `organization_id uuid`. No `converted_project_id`.**
- `status`: `Stalled`(44), `New`(21), `Qualifying`(15), `Active`(4), `Closed Lost`(2), `Won`(1), `Proposal Sent`(1).
- `opportunity_type`: `Grant`(35), `CH Sale`(35), `Investor Match`(8), `Partnership`(5), `CH + Startup Shared`(1), `Portfolio intro`(1).
- `opportunity_candidates` is **not** a separate table — "candidates" = `opportunities` rows at `status='New'`. (Note: a distinct `opportunity_candidates` table *does* exist in schema with `candidate_status`/`opportunity_id`, but the scan route writes to `opportunities`; treat the table as legacy/unused pending confirmation.)
- `opportunity-outcome` route: `won` → `status='Won'` + idempotent `revenue_events` row; `lost` → `status='Lost', is_active=false`.

### 2.6 Client Room (owned by common-house-portal)
- **`client_access`**: `project_id uuid NOT NULL` (FK→projects), `clerk_user_id`, `granted_email`, `role`, grant/revoke/expiry audit. Active = `revoked_at IS NULL AND (expires_at IS NULL OR future)`. RLS service-role-only. **Room is strictly project-scoped today.**
- **`project_materials`**: `project_id uuid NOT NULL`, `provider`, `category`, `document_status`, `visibility`, `url`, versioning (`supersedes_id`), `client_visible_at`.
- **`project_agreements`**: `project_id uuid NOT NULL`, `agreement_type`, `status`, `visibility`, `version`, `supersedes_id`, response audit; mutated via `respond_to_project_agreement(p_agreement_id, p_expected_version, …)` RPC (optimistic-version, atomic).
- Room render (`/hall/[slug]`) reads only `projects.hall_*` + curated materials/agreements — never internal evidence/learning.

### 2.7 Current Room-before-project workaround (the anti-pattern to replace)
`MPS`, `Kinko — Pre-sale`, and `Orígenes … Pre-sale` each fake a Room by creating a **placeholder project** with `client_room_enabled=true` while `project_status ∈ {NULL, Proposed, Not started}`. MPS project = `5d94ae10-…` (`Propuesta en revisión`), Room `/hall/mps`.

### 2.8 Evidence / person→org
- `evidence` links by **`project_notion_id` / `org_notion_id` (text)** + `source_id uuid`. **No opportunity link exists on evidence.** `validation_status ∈ New/Reviewed/Validated/Rejected`; material types `Decision/Blocker/Dependency/Requirement/Outcome/Process Step`.
- **Person→org = `people.org_notion_id` (single text pointer).** No join table, no `confidence`/`confirmed` column; provenance via `classified_by`/`classified_at`/`auto_suggested*`. Set only when currently null (idempotent).

---

## 3. Problems this ADR fixes (all evidenced in §2)

1. **Nature is polluted with relationship.** `org_category` holds `Funder/Vendor/Client`. Editor whitelist doesn't even match stored data.
2. **Relationship has no home.** State is smeared across `relationship_stage` (funnel) + `relationship_classes[]` (tags, empty) + a derived view + `engagements` + `hall_organizations`. Nothing is canonical; the org list already renders a "mismatch" warning.
3. **A proposal masquerades as a project.** 7 `Proposed` projects + placeholder Rooms conflate opportunity with execution.
4. **Opportunities are orphaned from projects and from typed orgs.** No `converted_project_id`, no uuid org FK.
5. **Multi-org projects are unrepresentable.** iRefill's `technology_provider` role in Auto Mercado's project has nowhere to live; iRefill's own project isn't even linked to its org (`organization_id=NULL`).
6. **Closing the wrong thing.** A lost proposal or completed project has no way to *not* end the underlying relationship.

---

## 4. Target model (additive tables)

```
Organization ──1:N── organization_relationships   (durable: portfolio/client/partner/vendor/investor/funder + typed state)
     │
     ├──1:N── opportunities (extended)             (exploration→proposal→won/lost/not_now; won ⇒ converted_project_id)
     │              │ won
     │              ▼
     ├──1:N──── projects (execution)               (active/paused/completed/cancelled)
     │              │
     │              └─1:N─ project_organization_roles  (client/sponsor/delivery_lead/technology_provider/…)
     │
     └──1:N── person_organization_memberships       (additive over people.org_notion_id)
```

### 4.1 `organizations.org_category` → nature only
Interface vocabulary (target): `Startup, Empresa, Institución pública, ONG / fundación, Capital, Educación / conocimiento, Otra`. **No migration of existing values in Phase 1.** A view/mapping presents legacy values (`Corporation`→"Empresa", etc.); the `Funder/Vendor/Client` category rows become *review items* to (a) set a real nature and (b) create an `organization_relationships` row. `org_category` stays; it stops being where relationship is expressed.

### 4.2 `organization_relationships` (NEW, canonical durable relationship)
`id, organization_id uuid→organizations(id), relationship_type text, relationship_state text NULL, started_at, ended_at NULL, source_refs jsonb, notes text NULL, created_by/updated_by text, created_at/updated_at`.
- `relationship_type ∈ {portfolio, client, partner, vendor, investor, funder}`.
- Valid `relationship_state` by type (server-validated): portfolio → `accompanied|followed`; partner → `exploring|active|paused|not_current`; vendor → `active|paused|not_current`; client → NULL (activity derived from opportunities/projects); investor/funder → `active|inactive|NULL`.
- Multiple active relationships per org allowed. History preserved; reactivation adds/reopens rather than destroying rows.
- **No "prospect" relationship** — prospect is an *opportunity* stage, not an org identity.
- Companion audit table `organization_relationship_events` (append-only) if we want a change log distinct from row `updated_at`.

### 4.3 `opportunities` — extend (do not replace)
Add: `organization_id uuid→organizations(id)` (nullable; backfilled from `org_notion_id` only when unambiguous), `converted_project_id uuid→projects(id) NULL`, `next_revisit_at timestamptz NULL`, `closed_reason text NULL`. Introduce a canonical `stage` mapping (`exploration→proposal→won|lost|not_now`) layered over existing `status` values (`New/Qualifying/Active/Proposal Sent/Won/Closed Lost/Stalled`) — via a mapping function/view first, not a destructive rewrite. `won` must set `converted_project_id`. Conversion is an **atomic RPC** (`convert_opportunity_to_project`, SECURITY DEFINER): create project, set `converted_project_id`, migrate/attach Room context, preserve access — one transaction.

### 4.4 `project_organization_roles` (NEW)
`id, project_id uuid→projects(id), organization_id uuid→organizations(id), role text, participation_status text, started_at NULL, ended_at NULL, source_refs jsonb, client_visible boolean NOT NULL DEFAULT false, notes text NULL, created_at/updated_at`.
- `role ∈ {client, sponsor, delivery_lead, technology_provider, implementation_partner, co_development_partner}` (server-validated, extensible).
- `projects.organization_id` (primary org) is preserved for compatibility but **stops being the sole truth** about who's involved. The primary org is **not assumed to be the client** — ambiguous cases go to review.
- Reference target (Estaciones de refill = "Auto Mercado - Fase 2"): Auto Mercado → `client`/`sponsor`; Common House → `delivery_lead`; iRefill → `technology_provider`. iRefill's portfolio context stays separate from this participation.

### 4.5 `person_organization_memberships` (NEW, additive over `people.org_notion_id`)
`id, person_id uuid→people(id), organization_id uuid→organizations(id), title text NULL, area text NULL, is_primary boolean, started_at/ended_at NULL, source_refs jsonb, confidence numeric NULL, confirmed_at/confirmed_by text NULL, created_at/updated_at`.
- Backfill **only already-confirmed** `people.org_notion_id` links (those with `classified_by`/non-auto provenance). Dual-read/dual-write with the legacy pointer during transition.
- **Never infer employment from email domain.** No new inferences created by backfill.

### 4.6 Client Room attaches to project **or** opportunity (common-house-portal)
On `client_access`, `project_materials`, `project_agreements`: make `project_id` nullable and add `opportunity_id uuid→opportunities(id)`, with a **XOR check** (`num_nonnulls(project_id, opportunity_id) = 1`). Room resolution (`require-client-access`) resolves a slug to either a project or an opportunity. Conversion (win) reassigns Room context project↔opportunity atomically and audibly, **without changing default visibility**. Client-visible surface unchanged: Inicio / Lo que escuchamos (curated) / Propuesta / Materiales publicados / Preguntas-acuerdos-próximos pasos. Never visible: raw transcripts, internal memory/learning, unapproved state-refresh proposals, internal risks, other clients' data.

---

## 5. Compatibility & non-breaking guarantees

- **No drops, no destructive rewrites in Phase 1.** `org_category`, `relationship_stage`, `relationship_classes`, `engagements`, `projects.organization_id`, `client_access.project_id` semantics all preserved.
- `v_org_status` is untouched in Phase 1. In a later phase it is re-pointed to read `organization_relationships` + `project_organization_roles` (its consumers keep the same column names — see Appendix A for the exact current definition to preserve).
- Existing routes, Client Room, state-refresh, learning, opportunity flows keep working unchanged; new tables are read *in addition*.
- Every new table: RLS on, service-role-only, matching the existing posture.
- Ambiguity → `decision_items` (`entity_action` extended, e.g. `classify_relationship` already exists; add `set_org_nature`, `assign_project_role`, `link_opportunity_org`). The existing `relationship-promotion-operator` already demonstrates this queue.

---

## 6. Data requiring human review (never auto-resolved)

1. **`org_category` remap** for `Funder`(16)/`Vendor`(2)/`Client`(1)/`Landscape Reuse Op`(1)/`Internal`(1)/`∅`(14) → real nature + `organization_relationships` row.
2. **Relationship backfill** from the messy trio (`relationship_stage`, `relationship_classes`, `v_org_status`) — only unambiguous equivalences auto-map; the rest queue.
3. **Reference orgs** Auto Mercado, iRefill, Beeok, Yenxa, SUFI: set nature + relationships + (for the Auto Mercado project) the three `project_organization_roles`. iRefill portfolio evidence must stay separate from Auto Mercado implementation evidence.
4. **Pre-sale projects → opportunities**: MPS (`Propuesta en revisión`), Kinko pre-sale, Orígenes pre-sale, and the 7 `Proposed` projects — each reviewed to become an opportunity (+ opportunity Room) rather than a project. **MPS Room must not label MPS a Client.**
5. **`projects.organization_id=NULL`** on iRefill/Beeok/SUFI/Yenxa/others — link only when confident.

---

## 7. Non-goals / explicitly out of scope (this phase)

- The **visual Memory map** (typed data now; visualization later).
- Real client **invitations / access grants / emails** (MPS included) — gated on human go-live.
- Any **bulk AI reclassification** or movement of raw transcripts/evidence between contexts.
- Dropping `engagements`, `relationship_stage`, `org_category`, or `v_org_status`.
- Consolidating the two repos (separate decision).

---

## 8. Open questions / risks

- **`opportunity_candidates` table**: exists in schema but appears unused (scan writes to `opportunities`). Confirm before relying on either.
- **`org_notion_id` → `organization_id` backfill**: some opportunities/evidence reference `local-org-…` synthetic notion ids (e.g. Kinko, Orígenes) with no matching `organizations.id`. These need org records first.
- **Canonical `stage` on opportunities**: mapping `Stalled`(44) — is "stalled" `exploration` or a separate dormant flag? Proposed: keep `status` as-is, add `stage` as a derived+overridable field.
- **Cross-repo migration coordination**: the Room `opportunity_id` migration is authored in common-house-portal but touches the same DB — sequencing matters (opportunities extension must land before the Room XOR migration).
- **`v_org_status` DDL lives only in the DB** — Appendix A captures it so a later re-point doesn't lose behavior.

---

## Appendix A — recovered `v_org_status` definition (source of truth was DB-only)

Preserved verbatim so a future re-point keeps identical output columns (`relationship_type`, `operational_state`, `raw_relationship_stage`, `is_active_*`, counts):

```sql
-- SELECT notion_id, name, org_category, relationship_stage AS raw_relationship_stage,
--   relationship_type := CASE
--     WHEN EXISTS(projects p: primary_org_notion_id=o.notion_id AND engagement_model='startup') THEN 'Portfolio'
--     WHEN EXISTS(engagements e: org_notion_id=o.notion_id AND engagement_type='Client' AND relationship_status='Active') THEN 'Client'
--     WHEN EXISTS(engagements e: … engagement_type='Funder' … 'Active') THEN 'Funder'
--     WHEN EXISTS(projects p: … engagement_model='partnership') THEN 'Partner'
--     WHEN relationship_stage='Archived' THEN 'Archived'
--     WHEN relationship_stage = ANY('{Partner,Investor,Funder,Vendor}') THEN relationship_stage
--     ELSE 'Prospect' END,
--   operational_state := CASE
--     WHEN relationship_stage='Archived' THEN 'Archived'
--     WHEN EXISTS(project Active+delivery) THEN 'Active Delivery'
--     WHEN EXISTS(project Active+partnership) THEN 'Active Partnership'
--     WHEN EXISTS(project Active+startup) THEN 'Active Portfolio'
--     WHEN EXISTS(project Proposed) THEN 'Proposal in flight'
--     ELSE 'Idle' END,
--   is_active_delivery, is_active_partnership, is_active_portfolio,
--   active_projects_count, active_engagements_count, last_meeting_date
-- FROM organizations o;
```
(Full exact DDL retrievable via `pg_get_viewdef('public.v_org_status')`.)

---

## Phase plan (tracking)

- **Phase 0 — audit + ADR** ✅ (this document)
- **Phase 1 — additive schema + canonical services** ⏳ next (migration files authored, applied to prod only after per-file review)
- **Phase 2 — admin UI** (nature view, relationship editor, opportunity CRUD, opp→project conversion, project-role editor, ambiguity review queue)
- **Phase 3 — conservative backfill** (unambiguous only; review report for the rest)
- **Phase 4 — operational views** (org / opportunity / project fiches, `/admin/now` grouping)
- **Phase 5 — intelligence + observability** (evidence context = org/opportunity/project; telemetry)
- **Phase 6 — verification + release** (typecheck/lint/build, RLS + conversion atomicity tests, client-cannot-see-internal tests, MPS/Auto Mercado/iRefill fixtures)
