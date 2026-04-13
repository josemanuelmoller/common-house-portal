# PLATFORM-IA.md — Common House Platform Information Architecture
**Sprint 25 · April 2026** *(Sprint 20 base + commercial layer S22 + Living Room S25)*

---

## Principle

> The platform must reflect work, capabilities, decisions and value — not databases.

The metaphor: **Common House as a living office.**
- Hall = reception / commercial vitrina / pre-sales / sales
- Residents = living directory of activatable capabilities
- Desks = contextual entry points for specific work types
- Workrooms / Garage = active work spaces
- Control Room = internal cockpit

---

## 1. Navigation Architecture

### Top-level nav (sidebar, always visible)
```
◈  The Hall           /hall-vitrina          [public-safe]
◉  Residents          /residents             [public-safe]
⌂  Living Room        /living-room           [community-visible / public-safe mix]  ← NEW Sprint 25
◻  Workrooms          /workrooms             [client-only / internal]
◧  Garage             /garage                [client-only / internal]
◫  Control Room       /control-room          [internal-only]
```

**Rule:** Residents is always visible at top level — never buried.
Hall always appears first. Living Room sits between Residents and Workrooms. Control Room always appears last.

### Control Room sub-nav
```
Overview    · P1 signals, decisions awaiting, agent schedule, pipeline highlights
Decisions   · All validated + pending decisions across projects
Agents      · Scheduled runs, last run, logs, system status
Pipeline    · Full opportunity pipeline — CH Sale, Grant, Partnership, Investor Match
Grants      · Active grant opportunities, fit scores, deadlines, backlog
Content     · Design + Comms production queue
Insights    · Validated insight briefs, knowledge candidates
Knowledge   · Knowledge Assets [OS v2], update proposals
System Health · DB hygiene, automation errors, duplicate risk
```
> Proposals and Offers moved to The Desks (Section Entry UX) — see Section 4.

### Client nav (Hall-mode, per-project)
```
◈  The Hall           [client entry — sanitized per-project view]
◉  Residents (sub)    [directorio, no sensitive data]
◻  The Workroom       [active work — client-visible layer]
◫  Overview           [dashboard summary]
```

---

## 2. Hall Architecture

### Hall — Public vitrina (hall-vitrina.html)
**Purpose:** Pre-sales and sales. Credibility, clarity, desire to enter.
**Does NOT show:** client data, internal pipeline, real decisions, agent logs, financials.
**Shows:** capabilities, team, sample outputs, desk entry points, system previews.

#### Section order
```
01 · Hero              — "The house is ready to work"
02 · Capabilities      — 5 capabilities, one OS
03 · Residents         — team preview + digital residents note
04 · The Desks         — Design / Comms / Insights / Grants / Proposals & Offers
05 · What clients unlock — Hall / Workroom / full system
06 · Workroom preview  — sanitized interface teaser
07 · Sample outputs    — 4 deliverable types
08 · Intelligence      — blurred insight cards (structure visible)
09 · Grants            — funder fit preview (amounts blurred)
10 · Final CTA         — "Request a conversation"
```

#### CTAs in Hall
- Explore Residents
- See how the House works ↓
- Request a conversation
- [Per desk]: Request from Design / Comms / Insights / Grants / Proposals & Offers desk
- Explore Grants desk
- Unlocks with your engagement

### Hall — Client view (hall-mockup.html)
**Purpose:** Project home base for active clients.
**Section order:**
```
1 · What's happening now + Team
2 · What we heard (editorial)
3 · Our proposal
4 · Purchase order (sign-off)
5 · Conversations
6 · Shared materials + Decisions
```

---

## 3. Residents

**Purpose:** Living directory of activatable capabilities. NOT a team page.
**Visibility:** Public-safe — no sensitive project data, no financial info.

### Sections
```
Co-founders    · 2 people · expertise tags · desk CTAs
Core team      · 3-5 people · bio + expertise + desk entry
Advisors/EIRs  · 2-n people · relevant capabilities
Digital        · 6 agents · functional description, no logs
```

### CTAs from Residents (contextual)
- Open [Design / Comms / Insights / Grants] desk
- See relevant startup / project angles
- See what this resident helps unlock
- Request a conversation

### Digital residents — display rule
Shown as functional agents with scope and feed targets.
No "AI gimmick" framing. No raw logs. No model names.
Listed same level as humans, different avatar style (dashed border).

---

## 3b. Living Room — Community Layer (Sprint 25)

**Purpose:** Show how life moves inside the House. Members, expertise, themes in motion, shared milestones — curated, not scrolled.
**Visibility:** Mix of public-safe and community-visible. Never shows internal pipeline, decisions, financials, or agent data.
**Nav position:** Between Residents and Workrooms.

### Modules
```
A · Featured Members       — 3 member cards (public-safe), links to Residents
B · What the House is moving this week  — 3–4 themes briefed (dark right panel)
C · Shareable Milestones   — curated milestone cards (public or community-visible)
D · Themes in Motion       — 6-card grid of active + monitored themes
E · Community Signals      — 3 curated signal cards (policy, grants, sector news)
F · People by Geography    — 4-card geo breakdown with avatar clusters
G · Expertise Clusters     — 6 clusters from Residents expertise tags
H · Ways to Connect        — bottom CTA strip (Explore members / themes / milestones)
```

### Difference from Residents
| Residents | Living Room |
|-----------|-------------|
| Capability-driven directory | Community activity layer |
| Who is here and what they do | What's moving, what's shareable |
| Pre-sales / institutional | Social / relational |
| Static profiles | Dynamic milestones + signals |

### Content enters Living Room via
- `Share to Living Room = yes` on CH Projects [OS v2] or Content Pipeline [OS v2]
- `Community Relevant = yes` on Insight Briefs [OS v2]
- `Visibility` field on CH People [OS v2] (`public-safe / community / private`)
- Manual curation (themes, weekly briefing)

### Hall ↔ Living Room connection
Hall teaser previews 2–3 members, 2 milestones, 2 themes — public-safe only.
CTA in Hall: "See what the community is working on → Living Room"

**Full reference:** `.claude/LIVING-ROOM.md`

---

## 4a. Commercial Layer CTAs (Sprint 22)

The commercial layer has two entry CTAs that appear contextually across the platform. These are NOT mega-forms — they are context-aware entry points.

### "Build a proposal"
- **Appears on:** Opportunity (Qualifying/Active), Client org page, Workroom context page, Control Room → Pipeline
- **Asks:** Buyer Problem + Proposal Type + Budget Range + linked Opportunity
- **Creates:** Proposal Brief at Status = Draft in Proposal Briefs [OS v2]
- **Follows:** Decision Item (Draft Review) → Design request → Sent → Won → CH Project

### "Turn this into an offer"
- **Appears on:** CH Project page, won Proposal Brief, Workroom after delivery, Garage startup context
- **Asks:** Core Problem Solved + Offer Category + Precedent + First module name
- **Creates:** Offer at Status = In Development in Offers [OS v2]
- **Follows:** Pricing Decision Item → Design request → Opportunity Cues → Active

### Commercial CTAs in Hall
- Hall shows: offer category tiles, capability proof (aggregated), sample proposal structure, "how we work"
- Hall does NOT show: pricing, client names, pipeline, opportunity details, specific proposal content
- Authenticated inside: full Proposals, Offers, Decision Center, Pipeline

Full reference: `.claude/PROPOSAL-SYSTEM.md`, `.claude/OFFER-SYSTEM.md`

---

## 4. Section Entry UX — The Desks

**Rule:** No universal "Ask CH" mega-form. Contextual requests per desk.

### Design Desk
- **Trigger:** Go to Design desk
- **Request types:** Deck / One-pager / Proposal / Investor brief / Report skeleton
- **Fields:** Type (pills) + free text description
- **Systems touched:** Brand Brain · Design System
- **Output:** Visual document / presentation
- **Pipeline feed:** Content queue (Design)

### Comms Desk
- **Trigger:** Request from Comms
- **Request types:** Post / Newsletter block / Article angle / Founder voice / CH institutional
- **Fields:** Type (pills) + angle/context
- **Systems touched:** Comms System · Voice profiles · Channel profiles
- **Output:** Written content piece
- **Pipeline feed:** Content queue (Comms)

### Insights Desk
- **Trigger:** Go to Insights
- **Request types:** PDF digest / Grant scan / Project intel brief / Open exploration
- **Fields:** Upload (PDF/PPT/DOC/URL) + angle selector (CH / startup / project / grants / comms / design / open)
- **Systems touched:** Insight Engine [OS v2] · Evidence [OS v2] · Knowledge Assets
- **Output:** Insight brief (4-6 points, structured)
- **Pipeline feed:** Insight Briefs [OS v2]

### Grants Desk
- **Trigger:** Go to Grants
- **Request types:** Grant fit review / Funding scan / Funder mapping / Grant backlog & next steps
- **Fields:** Project/startup context + funder geography/sector preference
- **Systems touched:** Grants System · CH Organizations · Opportunities [OS v2]
- **Output:** Fit report + ranked funder list + next steps
- **Pipeline feed:** Grants pipeline [OS v2]

### Proposals & Offers Desk ← Moved from Control Room (Sprint 26+)
- **Trigger:** Build a proposal / Turn this into an offer
- **Request types:** Scoped Proposal Brief / Productised Offer / Commercial scope doc / Pipeline entry
- **Fields (Proposal):** Buyer Problem + Proposal Type + Budget Range + linked Opportunity
- **Fields (Offer):** Core Problem Solved + Offer Category + Precedent + First module name
- **Systems touched:** Proposal Briefs [OS v2] · Offers [OS v2] · Opportunities [OS v2]
- **Output (Proposal):** Proposal Brief at Status = Draft → Decision Item → Design request → Sent → Won
- **Output (Offer):** Offer at Status = In Development → Pricing Decision → Active
- **Pipeline feed:** Proposal Briefs [OS v2] · Offers [OS v2]

---

## 5. Workroom & Garage

### Workroom
- **For:** Organisations (corporates, NGOs) in active delivery
- **Sections:** Executive snapshot · What's in motion · Blockers · Decisions · Materials · Timeline
- **Hall:** Sanitized preview only (structure visible, data blurred)
- **Private:** Full project view with real data
- **Activated when:** `primaryWorkspace = workroom` + `WORKSPACE_READY.workroom = true`

### Garage
- **For:** Startups in active engagement
- **Sections:** Startup snapshot · Relationship health · Investor match · Grant fit · Materials · Decisions · Strategic actions
- **Hall:** Teaser preview only (company names may be anonymized)
- **Private:** Full operational view
- **Activated when:** `primaryWorkspace = garage` + `WORKSPACE_READY.garage = true`

---

## 6. Control Room

**Purpose:** Internal cockpit for CH operations team. Not client-visible.

### Overview must show
- P1 signals (Blockers, Deadlines) → surfaced at top in red banner
- Decisions awaiting review
- Agent schedule (next run, last status)
- Pipeline highlights (8 active projects)
- Grant pipeline (urgent + active)
- Content queue (Design + Comms items at review)
- Recent insight briefs
- System health snapshot

### Sub-sections
```
Overview      · Aggregated cockpit view (above)
Decisions     · All validated + pending, by project
Agents        · Scheduled agents, run history, manual trigger
Pipeline      · Full project list with stage + warmth
Grants        · 10+ opportunities, fit scores, deadlines
Content       · Design + Comms + Insights production queue
Insights      · Validated briefs, knowledge candidates
Knowledge     · Knowledge Assets [OS v2], update proposals
System Health · DB hygiene, automation health, duplicate risk
```

---

## 7. Public-safe / Preview / Private Model

| Surface / Data | Public-safe | Preview only | Client-only | Internal-only |
|---|---|---|---|---|
| Residents (humans) | ✓ | — | — | — |
| Digital residents (functional) | ✓ | — | — | — |
| Resident expertise/bio | ✓ | — | — | — |
| **Living Room — member names/geo/expertise** | ✓ | — | — | — |
| **Living Room — shareable milestones (public)** | ✓ | — | — | — |
| **Living Room — shareable milestones (community)** | — | — | ✓ (auth) | — |
| **Living Room — themes in motion** | ✓ | — | — | — |
| **Living Room — community signals (public)** | ✓ | — | — | — |
| **Living Room — community signals (grant detail)** | — | — | ✓ (auth) | — |
| Workroom interface structure | — | ✓ | — | — |
| Workroom real data | — | — | ✓ | — |
| Garage startup names | — | ✓ (anonymized) | — | — |
| Garage real data | — | — | ✓ | — |
| Design sample outputs (generic) | ✓ | — | — | — |
| Design outputs (client work) | — | — | ✓ | — |
| Comms samples (generic) | ✓ | — | — | — |
| Insight brief structure | ✓ | — | — | — |
| Insight brief content | — | ✓ (blurred) | ✓ | — |
| Grant funder names (public funders) | ✓ | — | — | — |
| Grant amounts | — | ✓ (blurred) | ✓ | — |
| Decisions (project-level) | — | — | ✓ | — |
| Agents (names + schedule) | — | — | — | ✓ |
| Pipeline (client names + stages) | — | — | — | ✓ |
| Financial / startup details | — | — | — | ✓ |
| P1 signals / blockers | — | — | — | ✓ |
| System health | — | — | — | ✓ |

---

## 8. Agent → Surface Mapping

| Agent | Feeds |
|---|---|
| `source-intake` | Sources [OS v2] |
| `evidence-review` | Evidence [OS v2] |
| `validation-operator` | Evidence validation status |
| `project-operator` | Projects [OS v2] · Draft Status Updates |
| `update-knowledge-asset` | Knowledge Assets [OS v2] |
| `hygiene-agent` | System Health · Control Room hygiene section |
| `db-hygiene-operator` | System Health · DB hygiene metrics |
| `briefing-agent` | Control Room Overview · P1 signals |
| `portfolio-health-agent` | Garage · Pipeline · Relationship warmth |
| `grant-monitor-agent` | Grants (Control Room) · Workroom/Garage when relevant |
| `deal-flow-agent` | Garage · Pipeline · Decision Center (borderline deals) |
| `review-queue` | Control Room Overview · Review queues |
| `os-runner` | Full 6-step cadence → all of the above |

**Surface → Agent mapping (reverse)**
```
Control Room Overview     ← briefing-agent · review-queue · validation-operator
Decisions tab             ← evidence-review · validation-operator
Agents tab                ← all agents (schedule + logs)
Pipeline tab              ← portfolio-health-agent · project-operator
Grants tab                ← grant-monitor-agent · deal-flow-agent
Content queue             ← manual + desk requests
Insights tab              ← evidence-review · update-knowledge-asset
Knowledge tab             ← update-knowledge-asset
System Health tab         ← hygiene-agent · db-hygiene-operator
Garage (startup view)     ← portfolio-health-agent · grant-monitor-agent · deal-flow-agent
Workroom (client view)    ← project-operator · evidence-review · validation-operator
Hall (client)             ← project-operator · evidence-review (status, conversations, decisions)
```

---

## 9. Files Created

| File | Purpose | Sprint | Status |
|---|---|---|---|
| `hall-vitrina.html` | Commercial Hall — public marketing page (10 sections) | S20 | ✅ Live |
| `residents-mockup.html` | Residents directory — humans + digital | S20 | ✅ Live |
| `control-room.html` | Internal cockpit — Overview + subnav | S20 | ✅ Live |
| `hall-mockup.html` | Client Hall — per-project portal (Auto Mercado) | S20 | ✅ Live |
| `living-room.html` | Living Room — community layer (7 modules) | S25 | ✅ Live |
| `.claude/PLATFORM-IA.md` | This document — full IA spec | S20–S25 | ✅ Live |
| `.claude/LIVING-ROOM.md` | Living Room — full spec, modules, privacy model, content routing | S25 | ✅ Live |

**Serve all at:** `localhost:5500/[filename].html`

---

## 10. Remaining for Full Implementation

**Current reality (Sprint 23 audit):** All surfaces below exist as HTML mockups only. The `frontend/` directory in this repo is an AlmacenIQ app, not the CH portal. `common-house-app/` does not yet exist as a subdirectory. Every CH platform surface is currently a static HTML file served via localhost:5500.

1. **Real Hall vitrina** → implement as Next.js page at `/` or `/hall` (public route)
2. **Real Residents page** → implement at `/residents` with data from `getProjectPeople`
3. **Desk request forms** → implement as API routes + Notion intake forms
4. **Workroom** → already partially built, needs Garage variant
5. **Garage startup detail** → new page with startup snapshot, investor match, grant fit
6. **Control Room** → implement as admin-only Next.js page group
7. **Agent schedule UI** → surface `scheduled-tasks` in Control Room Agents tab
8. **Visibility/auth layer** → Clerk auth to gate client-only vs internal-only views

**HTML mockups available (serve at localhost:5500):**
- `hall-vitrina.html` — commercial public hall
- `hall-mockup.html` — client hall (Auto Mercado example)
- `residents-mockup.html` — residents directory
- `control-room.html` — internal cockpit
- `platform-admin.html` — admin view
- `diagrama-agentes.html` — agent architecture diagram

**Gap:** "Defined in IA" ≠ "Built". Do not confuse IA completeness with implementation completeness.

---

## 11. Sprint 22 — Commercial Layer Additions

### New in Sprint 22

| Addition | Status |
|----------|--------|
| Proposals in Control Room sub-nav | ✅ Defined |
| Offers in Control Room sub-nav | ✅ Defined |
| "Build a proposal" CTA spec | ✅ Defined (see Section 4a) |
| "Turn this into an offer" CTA spec | ✅ Defined (see Section 4a) |
| Hall commercial previews spec | ✅ Defined (see Section 4a) |
| 5 Retail Refill Opportunities activated | ✅ Live in Notion |
| FMCG cue → Decision Item | ✅ Open in Decision Center |
| PLATFORM-IA.md updated | ✅ This document |

### Retail Refill Opportunities created (Sprint 22)

| Opportunity | Priority | Status | ID |
|-------------|----------|--------|----|
| Retail Refill Implementation — Co-op | P2 | New | `34045e5b-6633-817d-9120-d8bdc63d8f0a` |
| Retail Refill Implementation — Waitrose | P2 | New | `34045e5b-6633-8109-9fac-f4732dac2977` |
| Retail Refill Implementation — Tesco | P3 | New | `34045e5b-6633-81b4-a2f4-cf8204d025c6` |
| Retail Refill Implementation — Sainsbury's | P3 | New | `34045e5b-6633-81b5-bbc9-f1bd949ea6d2` |
| Retail Refill Implementation — Morrisons | P3 | New | `34045e5b-6633-8148-bba3-d172fcd21a64` |

### FMCG Decision Item

| Item | ID | Type | Status |
|------|-----|------|--------|
| Offer Activation — FMCG Brand Divisions | `34045e5b-6633-8121-9f8c-c0a7c9c67dcf` | Missing Input | Open |

---

## 12. Sprint 22 Final Verdict

`Commercial layer visible in platform. Proceed to next system.`

Navigation: Hall → Residents → Workrooms → Garage → Control Room is the definitive structure.
The desk model (Design / Comms / Insights / Grants / Proposals & Offers) is the correct entry UX pattern.
"Build a proposal" and "Turn this into an offer" are the two commercial CTAs — surfaced from the Proposals & Offers Desk.
Hall vitrina is the commercial front door. Proposals & Offers desk is where creation requests originate.

---

## 13. Sprint 25 — Living Room

### New in Sprint 25

| Addition | Status |
|----------|--------|
| Living Room added to top-level nav (between Residents and Workrooms) | ✅ Defined |
| `living-room.html` mockup — 7 modules, full layout | ✅ Live |
| `.claude/LIVING-ROOM.md` — full spec | ✅ Live |
| Public-safe/community/private visibility model for community layer | ✅ Defined |
| Module specs: Members / Milestones / Themes / Signals / Geography / Clusters / CTAs | ✅ Defined |
| Content routing spec (Share to Living Room flags) | ✅ Defined |
| Hall ↔ Living Room integration spec | ✅ Defined |
| Residents ↔ Living Room integration spec | ✅ Defined |
| PLATFORM-IA.md updated (nav, visibility table, files) | ✅ Updated |

### No new DBs required
Living Room MVP uses existing DBs:
- CH People [OS v2] — members, geography, expertise
- CH Projects [OS v2] — milestones (+ 2 new fields: `Share to Living Room`, `Milestone Type`)
- Content Pipeline [OS v2] — shareable outputs (+ 1 new field: `Share to Living Room`)
- Insight Briefs [OS v2] — community signals (+ 1 new field: `Community Relevant`)
- Knowledge Assets [OS v2] — themes in motion

### Sprint 25 Final Verdict

`Living Room live as curated community layer. Navigation updated. No new DBs. 3 field additions across existing DBs. Hall ↔ Living Room ↔ Residents connections defined. Proceed.`
