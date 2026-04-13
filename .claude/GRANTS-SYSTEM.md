# Grants System — OS v2
Sprint 19 — 2026-04-12

The Grants System is the structured layer for identifying, qualifying, and tracking grant opportunities for Common House and its portfolio startups. It uses no new databases — grants live entirely within existing OS v2 infrastructure.

---

## Architecture: no new DBs

| Purpose | Database | Filter |
|---------|----------|--------|
| Funder organisations | CH Organizations [OS v2] | Organization Category = Funder |
| Grant pipeline | Opportunities [OS v2] | Opportunity Type = Grant |
| Active grant agreements | Agreements & Obligations [OS v2] | Record Type = Grant Agreement |
| Eligibility ambiguities | Decision Items [OS v2] | Decision Type = Ambiguity Resolution / Missing Input |
| Sector research | Insight Briefs [OS v2] | Theme = Policy / Grants |
| Content from grant angles | Content Pipeline [OS v2] | linked via Insight Brief Comms Angles |

---

## 11 funders seeded (Sprint 19)

| Funder | Type | Geography | Key Programme | Relationship Stage |
|--------|------|-----------|---------------|-------------------|
| Innovate UK | Government | UK | Smart Grant, Net Zero Innovation, SBRI | Monitoring |
| UKRI | Government | UK | Circular Economy Challenge | Monitoring |
| Fair4All Finance | Foundation | UK | Scale-up Programme (£500k–£2M) | Prospect |
| Nesta | Foundation | UK | Challenge prizes, social innovation | Monitoring |
| Ellen MacArthur Foundation | Foundation | Global | CE100 Network | Monitoring |
| LIFE Programme (EU) | Government | EU | Zero Waste Cities, Nature-based Solutions | Monitoring |
| IDB Lab (IADB) | Multilateral | LatAm | Innovation grants, fintech | Monitoring |
| UNDP | Multilateral | Global | SDG acceleration, circular economy | Monitoring |
| Horizon Europe / EIC Accelerator | Government | EU/UK | EIC Accelerator (up to €2.5M grant + €15M equity) | Monitoring |
| Esmée Fairbairn Foundation | Foundation | UK | Environment & Society grants | Monitoring |
| Caribbean Biodiversity Fund | Foundation | Caribbean | Biodiversity conservation | Monitoring |

All funders: CH Organizations [OS v2] → 🏦 Funders view.
DB: `bef1bb86-ab2b-4cd2-80b6-b33f9034b96c`

---

## 10 grant opportunities seeded (Sprint 19)

### P1 — Act Now

| Opportunity | Startup/Entity | Funder | Status |
|-------------|---------------|--------|--------|
| Innovate UK Smart Grant — iRefill | iRefill | Innovate UK | New |
| Fair4All Finance Scale-up — SUFI | SUFI | Fair4All Finance | **Qualifying** |

### P2 — This Quarter

| Opportunity | Startup/Entity | Funder | Status |
|-------------|---------------|--------|--------|
| EIC Accelerator (Horizon Europe) — iRefill | iRefill | Horizon Europe / EIC | New |
| Innovate UK Net Zero Innovation — iRefill + CH | iRefill + CH | Innovate UK | New |

### P3 — Backlog

| Opportunity | Startup/Entity | Funder | Status |
|-------------|---------------|--------|--------|
| LIFE Programme — Zero Waste Cities Consortium | CH + iRefill | LIFE Programme | New |
| Ellen MacArthur CE100 Network — Common House | CH | Ellen MacArthur Foundation | New |
| UKRI Circular Economy Challenge — iRefill R&D | iRefill | UKRI | New |
| Esmée Fairbairn Foundation — Zero Waste Community Grant | CH / iRefill | Esmée Fairbairn | New |
| EIC Accelerator (Horizon Europe) — Yenxa | Yenxa | Horizon Europe / EIC | New |

### P4 — Watch

| Opportunity | Startup/Entity | Funder | Status |
|-------------|---------------|--------|--------|
| IDB Lab Innovation Grant — SUFI / LATAM | SUFI | IDB Lab (IADB) | New |

All opportunities: Opportunities [OS v2] → 💰 Grant Opportunities view.
DB: `687caa98-594a-41b5-95c9-960c141be0c0`, DS: `2938041a-c3ad-4cd8-bc7a-f39d9635af14`

---

## Grant fit logic

**iRefill** — primary grant candidate. Circular economy R&D (Smart Grant, Net Zero, EIC, UKRI, LIFE). UK borough partnerships provide evidence base. Dual-track: innovation grant AND public procurement (SBRI via council partners).

**SUFI** — primary financial inclusion candidate. Fair4All Finance is the exact-fit programme. Eligibility gate: entity type (CIC/charity) must be confirmed. IDB Lab relevant if LATAM operations confirmed.

**Common House** — CE100 membership, LIFE consortium leadership. Grant role: convener and network access, not primary beneficiary.

**Beeok** — potential EIC candidate if deep tech component confirmed. Not in Sprint 19 pipeline yet.

**Yenxa** — EIC Accelerator candidate (P3). TRL and R&D track record needs assessment before committing to application.

---

## Grant workflow

### Step 1: Identify signal
Signal comes from:
- Insight Brief Grant Angles field (Policy / Grants theme)
- grant-monitor-agent monthly scan
- External funder updates (newsletter, website)

### Step 2: Create funder record
If funder not yet in CH Organizations:
1. Create record: Organization Category = Funder
2. Set Organization Domains (Public Sector / Philanthropy / Innovation)
3. Set Themes / Topics (Circular Economy / Financial Inclusion / Innovation)
4. Set Country and Relationship Stage = Monitoring (or Prospect if actively engaging)

### Step 3: Create Opportunity
In Opportunities [OS v2]:
1. Opportunity Type = Grant
2. Link Account / Organization = funder record
3. Set Priority (P1–P4) based on fit strength and window urgency
4. Fill Why There Is Fit, Suggested Next Step, Trigger / Signal

### Step 4: Route ambiguities
If eligibility is unclear → create Decision Item (Type: Missing Input or Ambiguity Resolution).
Never assume eligibility. Never create a grant application pipeline item without human confirmation.

### Step 5: Content routing
Brief's Grant Angles → Content Pipeline item (Platform = Internal / Memo, Content Type = Internal Brief).
For public-facing grant narrative → Platform = Newsletter or LinkedIn.

### Step 6: Active application
When Opportunity Status → Qualifying:
1. Confirm eligibility (Decision Item resolved)
2. Create Insight Brief if needed for research
3. Produce internal brief (Content Pipeline, Topic Brief → Briefed)
4. Book funder relationship call
5. Move to Active when application in progress

### Step 7: Grant Agreement
When grant awarded:
1. Create record in Agreements & Obligations [OS v2]
2. Record Type = Grant Agreement
3. Fill End Date, Renewal Date, Obligation Due Date
4. Set Contract Health = Green — Healthy
5. Link to Counterparty Organization (funder)

---

## 5 open Decision Items (Sprint 19)

| Item | Type | Priority | Action Required |
|------|------|----------|----------------|
| Grant Agreements — Missing Date Audit | Missing Input | Normal | Audit all Grant Agreement records for missing dates |
| SUFI — Confirm Fair4All Finance Eligibility | Missing Input | **Urgent / P1** | Confirm entity type; check application window |
| iRefill — Innovate UK Smart Grant: Ready to Qualify? | Ambiguity Resolution | High | Confirm R&D scope, eligible costs, application owner |
| EIC Accelerator — iRefill vs Yenxa: Which First? | Ambiguity Resolution | Normal | Sequence EIC applications; one per round |
| Esmée Fairbairn — Entity Eligibility Check | Missing Input | High | Confirm CH/iRefill nonprofit/CIC entity status |

All items: Decision Items [OS v2] → 🎯 Grant Ambiguities and ❓ Grant Missing Input views.

---

## 3 Insight Briefs created (Sprint 19)

| Brief | Theme | Key Routing |
|-------|-------|-------------|
| UK Government Innovation Grants Landscape 2025–2026 | Policy / Grants | Content Pipeline (iRefill internal brief) + Decision Center |
| EU Innovation Funding for UK Companies Post-Horizon 2025 | Policy / Grants | Content Pipeline (EIC newsletter angle) + Decision Center |
| UK Financial Inclusion Funding Landscape 2025–2026 | Financial Inclusion | Content Pipeline (SUFI brief) + Decision Center |

All briefs: Insight Briefs [OS v2] → 🏛️ Routed to Grants view.
DB: `04bed3a3-fd1a-4b3a-9964-3cd21562e08a`, DS: `839cafc7-d52d-442f-a784-197a5ea34810`

---

## 3 Content Pipeline items created (Sprint 19)

| Item | Platform | Voice | Type | Status |
|------|----------|-------|------|--------|
| Funder One-Pager — iRefill for Innovate UK | Internal / Memo | iRefill | Internal Brief | Topic Brief |
| Grant Brief — SUFI Fair4All Finance Application | Internal / Memo | SUFI | Internal Brief | Topic Brief |
| CH Grant Landscape — What Funders Want in 2025–2026 | Newsletter | Common House | Newsletter Block | Topic Brief |

All items: Content Pipeline [OS v2] → 📝 Needs Draft view.

---

## Views created (Sprint 19)

### Opportunities [OS v2] (3 new)
- 💰 Grant Opportunities — all grants, sorted by priority
- ⚡ Qualifying Grants — opportunities at Qualifying status
- 🏦 By Funder — board grouped by Account / Organization

### CH Organizations [OS v2] (3 new)
- 🏦 Funders — table of all Category = Funder orgs
- 🌍 Funders by Country — board grouped by Country
- 📋 Funders by Theme — board grouped by Themes / Topics

### Agreements & Obligations [OS v2] (1 new)
- 📋 Grant Agreements — filtered by Record Type = Grant Agreement

### Decision Items [OS v2] (2 new)
- 🎯 Grant Ambiguities — open Ambiguity Resolution items from Sprint 19
- ❓ Grant Missing Input — open Missing Input items from Sprint 19

---

## Grant cadence

### Monthly (1st Monday — grant-monitor-agent)
Run grant-monitor-agent in dry_run first:
```
grant-monitor-agent:
  mode: dry_run
  grant_scan:
    candidates: both
    expiry_warning_days: 90
```
Review: grants expiring < 30 days (P1), coverage gaps (active projects/startups with no open Grant opportunity).

### Bi-weekly review (manual)
- 💰 Grant Opportunities → check for new signals, update priorities
- ⚡ Qualifying Grants → move active applications to Active status
- ❓ Grant Missing Input → resolve eligibility Decision Items before next window

### Ad hoc
- New Insight Brief with Grant Angles → create Opportunity if fit is real
- Funder newsletter / website update → update funder record, create Decision Item if window opens
- Award notification → create Grant Agreement record in Agreements & Obligations

---

## Escalation rules

| Signal | Action |
|--------|--------|
| Fair4All Finance window confirmed open | Immediately elevate to Decision Item Urgent, resolve eligibility gate |
| Innovate UK round deadline < 8 weeks | Move iRefill Smart Grant to Qualifying, confirm application scope |
| EIC cut-off announced | Resolve iRefill vs Yenxa Decision Item |
| Grant Agreement End Date < 90 days | Contract Health = Yellow — Watch; create Decision Item |
| Grant Agreement End Date < 30 days | Contract Health = Red — At Risk; escalate to human immediately |

---

## What is NOT the Grants System

- Full grant writing / application text — out of scope for OS v2 agents
- Grant monitoring for orgs not in CH portfolio — out of scope
- Foundation or philanthropy CRM (non-grant funders) — use Engagements, not Opportunities
- Research charity or academic grants — not in current portfolio scope

---

## Database IDs

| Database | DB ID | DS ID |
|----------|-------|-------|
| CH Organizations [OS v2] | `bef1bb86-ab2b-4cd2-80b6-b33f9034b96c` | `a0410f76-1f3e-4ec1-adc4-e47eb4132c3d` |
| Opportunities [OS v2] | `687caa98-594a-41b5-95c9-960c141be0c0` | `2938041a-c3ad-4cd8-bc7a-f39d9635af14` |
| Agreements & Obligations [OS v2] | `c48ca387-ab09-4bae-9134-604915ff39f7` | `40c276d9-8524-48ef-8dc8-9a376b2e402c` |
| Decision Items [OS v2] | `6b801204-c4de-49c7-b617-9e04761a285a` | `1cdf6499-0468-4e2c-abcc-21e2bd8a803f` |
| Insight Briefs [OS v2] | `04bed3a3-fd1a-4b3a-9964-3cd21562e08a` | `839cafc7-d52d-442f-a784-197a5ea34810` |
| Content Pipeline [OS v2] | `3bf5cf81-f45c-4db2-8405-90f3878bfdc0` | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` |
