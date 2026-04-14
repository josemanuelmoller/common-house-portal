# OS v2 Skill Registry — Pack 1 + Pack 2 + Pack 3 (Intelligence) + Portal Hygiene

**Portal Hygiene Auditor (shadow mode, v2):** Scans the Common House Portal codebase for known-bad patterns — stale enum literals, wrong Notion property accessors, field name drift, dead imports, stale comments, and missing client refresh calls. Classifies findings as Tier A (safe fix, patch preview) / Tier B (surface) / Tier C/D (decision required). Never writes files. Report-first only.
- Skill: `hygiene-auditor` — trigger: `/hygiene-audit` in a Claude Code session
- Runbook: `docs/HYGIENE_AUDIT_RUNBOOK.md`
- Policy: `docs/AUTO_MAINTENANCE_AGENT_POLICY.md`
- v2 scan passes (9 total):
  - Pass 1: `window.location.reload()` → `router.refresh()` (Tier A)
  - Pass 2: Decision Items priority literals `"P1"` / `"Urgent"` / `"Normal"` (A/B)
  - Pass 3: Content Pipeline `"Channel"` → `"Platform"` (Tier A)
  - Pass 4: Wrong property accessors `text()` on select, `select()` on rich_text (A/B)
  - Pass 5: Dead imports in `notion.ts` shim post-modularization (Tier A)
  - Pass 6: Refactor plan progress markers out of sync with existing files (Tier A)
  - Pass 7: Stale inline comments contradicting field contracts (Tier A)
  - Pass 8 (v2): Read-path field aliases — `"Draft Text"` in Agent Drafts context; `"Title"`/`"Name"` near agentDrafts (A/B, with Content Pipeline false-positive filter)
  - Pass 9 (v2): Missing `router.refresh()` in `"use client"` + mutating fetch components (Tier B only)
- Shadow mode: patches are previewed in diff format but never applied automatically
- To apply a Tier A patch after review: "Apply patch A-[n] from the hygiene audit report"

Pack 1 delivers the entity and commercial intelligence layer: resolve duplicates, upsert orgs and people, build pipeline, extract agreements, track financials, and audit automations.

Pack 2 delivers the intelligence and insight layer: relationship health, control room briefing, opportunity scouting, investor matching, grant fit scanning, and proposal packaging.

Pack 3 delivers competitive and external intelligence: market signals, competitive monitoring, and watchlist scanning.

**Competitive Intelligence:** External radar for tracking competitors, referentes, and sector players. See `competitive-intel.html` for the admin UI.
- CH Watchlist [OS v2] (DS: `a7ba452a-78f5-4c9f-bc5a-71a63e4e248a`) — manually curated list of entities to monitor. Types: Competitor | Referente | Sector | Cliente potencial.
- CH Competitive Intel [OS v2] (DS: `b3607003-470c-413e-999e-94788f7c1b7c`) — signals captured per entity. Signal Types: Grant | Partnership | Hiring | Media / PR | Evento | Funding | Producto | Campana | Contenido | Pricing.
- Skill: `competitive-monitor-agent` — weekly scan, Monday 08:00. Standard depth (6 queries/entity). Lookback: 8 days. Execute mode by default.
- Active Watchlist (as of Apr 2026): Searious Business (Competitor, Weekly), Perpetual (Competitor, Weekly), Unpackaged (Competitor, Weekly), Upstream Consulting (Referente, Monthly).
- P1 signals: Alta relevance + Signal Type ∈ {Grant, Partnership, Funding, Hiring} → surface immediately.

All skills default to `dry_run`. Pass `mode: execute` to apply writes.

**Decision Center:** Human review queue for all agent proposals. See `.claude/DECISION-CENTER.md`.
- DB: Decision Items [OS v2] (ID: `6b801204c4de49c7b6179e04761a285a`, DS: `1cdf6499-0468-4e2c-abcc-21e2bd8a803f`)
- Before running any execute: check ⏳ Pending Execute view — all items must have Execute Approved = true
- Feedback loop: Feedback Category field in each resolved item informs skill threshold tuning

**Proposal System:** Commercial proposal briefs — converts sales conversations into structured scope, phases, deliverables, pricing logic, and design requests. See `.claude/PROPOSAL-SYSTEM.md`.
- Proposal Briefs [OS v2] (DB: `76bfd50f-a991-4361-9b9b-51de4b8eae67`, DS: `8f0fb3de-2a16-4b8b-a858-5ab068d2f2e4`)
- Status: Draft → In Review → Approved → Sent → Won / Lost / Archived
- Pilot: [PILOT 1] Greenleaf Retail — Refill Infrastructure Implementation Brief (ID: `34045e5b-6633-813c-9e07-ce91d7d0532b`)
- Rule: Never put specific prices in Notion. Pricing Logic is strategy only. Escalate novel pricing to JMM.
- Design requests → Content Pipeline (Content Type = Proposal Deck, Platform = Internal / Memo)

**Opportunity Qualification Standard (Sprint 24):** All pipeline opportunities must pass the 6-criteria qualification standard before creation. See `.claude/OPPORTUNITY-STANDARD.md`.
- Score model: Trigger (20) + Buyer Clarity (20) + CH Fit (20) + Proof (15) + Access Path (15) + Value (10) = 100
- Thresholds: ≥70 = Qualified | 50–69 = Needs Review | <50 = do not create (route to Decision Center)
- New fields in Opportunities [OS v2]: `Opportunity Score` (number) + `Qualification Status` (select)
- New views: 🎯 Needs Qualification | 🔴 Below Threshold | 📊 By Qualification Status | 📋 Not Scored
- Skill enforcement: `create-or-update-opportunity` Step 0.5 blocks creation if both Trigger and Buyer absent
- Skills updated: `startup-opportunity-scout` (qualification gate), `grant-fit-scanner` (fit confirmation required)

**Offer System:** Reusable productised offers — converts delivery precedents into repeatable commercial offers with buyer logic, modules, proof points, and sales narrative. See `.claude/OFFER-SYSTEM.md`.
- Offers [OS v2] (DB: `58b863e9-c789-465b-82eb-244674bc394f`, DS: `10c7de04-8f71-45ff-9e37-32e683829232`)
- Status: Active / In Development / Deprecated
- Active offers: Retail Refill Implementation (Auto Mercado anchor). In Development: Portfolio Startup Acceleration.
- Rule: Only mark Active if delivery evidence exists. Opportunity Cues → create Opportunities in pipeline.
- Design requests → Content Pipeline (Content Type = Sales Deck, Platform = Internal / Memo)

**Grants System:** Grant identification, qualification, and tracking layer. No new DBs — uses existing OS v2 infrastructure. See `.claude/GRANTS-SYSTEM.md`.
- Funders: CH Organizations [OS v2] (Category = Funder) — 11 funders seeded (Innovate UK, UKRI, Fair4All Finance, Nesta, Ellen MacArthur Foundation, LIFE, IDB Lab, UNDP, Horizon Europe/EIC, Esmée Fairbairn, Caribbean Biodiversity Fund)
- Pipeline: Opportunities [OS v2] (Type = Grant) — 10 opportunities seeded across iRefill, SUFI, Yenxa, CH
- Active grants: Agreements & Obligations [OS v2] (Record Type = Grant Agreement)
- P1 signals: SUFI / Fair4All Finance eligibility check OPEN. iRefill / Innovate UK Smart Grant at New — qualify before next round
- Rule: Never assume eligibility. Route all ambiguities to Decision Center (Missing Input / Ambiguity Resolution)
- Cadence: monthly grant-monitor-agent + bi-weekly manual review of 💰 Grant Opportunities view

**Comms System:** Editorial layer for channel-specific, voice-specific content production. See `.claude/COMMS-SYSTEM.md`.
- Three-layer model: Voice (who) + Platform/Channel (where) + Format (what shape) — never mix
- Style Profiles [OS v2] now includes Channel Profiles (LinkedIn, Instagram, Newsletter, Website/Article, Internal/Memo) alongside Voice/Tone and Brand Identity profiles
- Content Pipeline [OS v2] extended with Platform, Voice/Speaker, Draft Text, Publish Window, Feedback Summary, Related Insight Brief fields
- Workflow: Signal → Topic Brief → Briefed → In Progress → Review → Approved → Ready to Publish → Published
- Editorial feedback loop: 3+ rejections on a Style Profile → create Decision Item (Type: Draft Review)

**Insight Engine:** Structured analysis layer for reports, policy docs, and sector research. See `.claude/INSIGHT-ENGINE.md`.
- Insight Briefs [OS v2] (DB: `04bed3a3-fd1a-4b3a-9964-3cd21562e08a`, DS: `839cafc7-d52d-442f-a784-197a5ea34810`) — structured insight briefs: Executive Summary, Key Facts, Key Insights, Grant/Comms/Opportunity Angles
- Routing: briefs feed Content Pipeline (Comms Angles), Knowledge Assets (reusable frameworks), Decision Center (human actions), Opportunities (commercial signals)
- 5 real briefs seeded: EMF Circular Economy, UK EPR 2024, Tech Nation UK Tech 2023, CMI B2B Content Marketing 2024, FCA Financial Inclusion 2023

**Design System (Brand Brain):** Voice, style, and content production. See `.claude/BRAND-BRAIN.md`.
- Style Profiles [OS v2] (DB: `606b1aafe63849a1a81ac6199683dc14`, DS: `3119b5c0-3b8b-4c17-bde0-2772fc9ba4a6`) — Master Prompts for CH, JMM, and 4 portfolio startups
- Reference Assets [OS v2] (DB: `264f5e5e179c4449ba12a44fad9491f4`, DS: `fc498f7b-9f90-40ef-9e74-2a7077ce1cb0`) — annotated examples
- Content Pipeline [OS v2] (DB: `3bf5cf81f45c4db2840590f3878bfdc0`, DS: `29db8c9b-6738-41ab-bf0a-3a5f06c568a0`) — content requests: Brief → Approved
- When producing content: fetch the relevant Style Profile Master Prompt, check Reference Assets, log output in Content Pipeline

---

## Pack 6 — Sprint C+D: Direct Actions + Personal Agents (2026-04-13)

### New skills

| Skill | File | Purpose | Target DBs | Writes? |
|---|---|---|---|---|
| `market-signal-extractor` | `market-signal-extractor.md` | Scans Insight Briefs + Gmail + Fireflies → extracts 3–5 scored market signals → writes to Daily Briefings Market Signals field (or Agent Drafts fallback) | Agent Drafts (write), Daily Briefings (write), Insight Briefs, Knowledge Assets, Gmail, Fireflies (read) | Yes |
| `delegate-to-desk` | `delegate-to-desk.md` | Given task + optional assignee + due date → drafts structured delegation brief in JMM voice → writes to Agent Drafts as Delegation Brief; never sends directly | Agent Drafts (write), CH People, CH Projects, Opportunities (read) | Yes — 1 draft |
| `identify-quick-win` | `identify-quick-win.md` | Scans Opportunities + Decisions + Grants + Relationships + Projects → scores by value×effort×urgency → surfaces top 3–5 quick wins → writes to Agent Drafts as Quick Win Scan + Daily Briefings | Agent Drafts (write), Daily Briefings (write), Opportunities, Decisions, CH People, CH Projects (read) | Yes |

### New API routes (Next.js portal)

| Route | Method | Input | What it does |
|---|---|---|---|
| `/api/run-skill/draft-checkin` | POST | `{personId}` | Fetches person from Notion → calls Anthropic haiku → saves Check-in Email draft to Agent Drafts |
| `/api/run-skill/draft-followup` | POST | `{opportunityId}` | Fetches opportunity from Notion → calls Anthropic haiku → saves Follow-up Email draft to Agent Drafts |
| `/api/approve-draft` | POST | `{draftId, action: "approve"\|"revision"}` | Updates Agent Draft Status in Notion |

### New UI components

| Component | Type | Purpose |
|---|---|---|
| `AgentQueueSection.tsx` | Client | Replaces static Agent Queue — inline expand/collapse, Approve + Revise buttons with live Notion update |
| `DraftFollowupButton.tsx` | Client | Follow-up Queue "Draft email →" — POSTs to `/api/run-skill/draft-followup`, shows "✓ Draft saved" on success |
| `DraftCheckinButton.tsx` | Client | Relationship Queue "Draft →" — POSTs to `/api/run-skill/draft-checkin`, shows "✓ Draft saved" on success |

### Summary: Sprint C+D completes the action loop

```
Hall button click → API route → Anthropic haiku → Notion Agent Draft → AgentQueueSection (inline review) → Approve → done
```

All 5 previously pending items resolved:
- ✅ market-signal-extractor (B5)
- ✅ delegate-to-desk (C8)
- ✅ Hall buttons trigger real skills (C9)
- ✅ identify-quick-win (D12)
- ✅ Inline review UI in Hall (D11)

---

## Pack 5 — Hall v2 Personal Productivity Layer (Sprint A+B)

### New databases (Sprint A+B)

| DB | SDK Page ID | DS ID | Fields |
|---|---|---|---|
| Opportunities [OS v2] | `687caa98594a41b595c9960c141be0c0` | `collection://687caa98-594a-41b5-95c9-960c141be0c0` | `Scope` SELECT (CH/Portfolio/Both) · `Follow-up Status` SELECT (None/Needed/Sent/Waiting) |
| CH People [OS v2] | `1bc0f96f33ca4a9e9ff26844377e81de` | `collection://6f4197dd-3597-4b00-a711-86d6fcf819ad` | `Contact Warmth` SELECT (Hot/Warm/Cold/Dormant) · `Last Contact Date` DATE |
| Agent Drafts [OS v2] | `9844ece875ea4c618f616e8cc97d5a90` | `collection://e41e1599-0c89-483f-b271-c078c33898ce` | Type, Status, Voice, Platform, Draft Text, Related Entity, Created Date |
| Daily Briefings [OS v2] | `d206d6cdb09040d3ac2f34a977ad9f2a` | `collection://17585064-56f1-4af6-9030-4af4294c0a99` | Date, Focus of the Day, Meeting Prep, My Commitments, Follow-up Queue, Agent Queue, Market Signals, Ready to Publish, Generated At, Status |

### Skills

| Skill | File | Purpose | Target DBs | Writes? |
|---|---|---|---|---|
| `generate-daily-briefing` | `generate-daily-briefing.md` | Reads Calendar + Gmail + Fireflies + Notion → synthesises structured daily briefing → writes to Daily Briefings [OS v2]; one record per date | Daily Briefings (write), CH People, Opportunities, Decisions, Content Pipeline (read), Calendar+Gmail+Fireflies MCP | Yes — 1 record |
| `relationship-warmth-compute` | `relationship-warmth-compute.md` | Scans Gmail + Fireflies last 60d → computes Contact Warmth (Hot/Warm/Cold/Dormant) + Last Contact Date per person → writes if changed; surfaces check-in flag list | CH People (write), Gmail + Fireflies MCP (read) | Yes — conservative |
| `linkedin-post-agent` | `linkedin-post-agent.md` | Reads JMM Style Profile + Insight Briefs + Knowledge Assets + Fireflies → drafts LinkedIn post → writes to Agent Drafts [OS v2] as Pending Review | Agent Drafts (write), Style Profiles, Insight Briefs, Knowledge Assets, Content Pipeline, Fireflies (all read) | Yes — 1 draft |
| `draft-followup-email` | `draft-followup-email.md` | Given Opportunity ID → reads context → drafts follow-up email in JMM voice → writes to Agent Drafts [OS v2] | Agent Drafts (write), Opportunities, CH People, CH Orgs, Style Profiles (all read) | Yes — 1 draft |
| `draft-checkin-email` | `draft-checkin-email.md` | Given Person ID (Cold/Dormant) → reads relationship context → drafts warm check-in email in JMM voice → writes to Agent Drafts [OS v2] | Agent Drafts (write), CH People, CH Orgs, Opportunities, Style Profiles, Fireflies (all read) | Yes — 1 draft |

### Opt-in commitment model

**Core design principle:** Opportunities NEVER generate deadline pressure unless the user explicitly opted in by setting `Follow-up Status = Needed` (clicking "Me interesa" or "Postular"). Uncommitted opportunities appear in the Opportunities Explorer section as explore-only, with no urgency signals. The Follow-up Queue in Hall only shows opted-in opportunities.

### Hall v2 data flow

```
generate-daily-briefing (07:30 daily)
  → reads: Calendar, Gmail, Fireflies, Notion
  → writes: Daily Briefings [OS v2] (one record per date)
  → Hall reads: getDailyBriefing(today) on every page load

relationship-warmth-compute (bi-weekly Monday 06:00)
  → reads: Gmail, Fireflies, CH People
  → writes: Contact Warmth + Last Contact Date on CH People
  → Hall reads: getColdRelationships() on every page load

linkedin-post-agent / draft-followup-email / draft-checkin-email (on demand)
  → writes: Agent Drafts [OS v2] as Pending Review
  → Hall reads: getAgentDrafts("Pending Review") on every page load
  → User reviews in Hall → copies / requests revision
```

---

## Pack 4 — Living Room Community Layer (Sprint 28)

### Community Curation

| Skill | File | Purpose | Target DBs | Writes? |
|---|---|---|---|---|
| `living-room-curator` | `living-room-curator.md` | Query 5 OS v2 DBs filtered by Living Room fields; return structured module data for all 6 active LR modules; apply privacy gate | CH People, CH Projects, Insight Briefs, Content Pipeline, Knowledge Assets (all read-only) | Never |

**living-room-curator details:**
- Called by: `living-room-agent` weekly (Monday 08:45)
- Privacy gate: enforced inside skill — strips client names, grant amounts, investor names, pipeline stages, P1 signals
- Modules produced: A (Featured Members) · C (Shareable Milestones) · D (Themes in Motion) · E (Community Signals) · F (People by Geography) · G (Expertise Clusters)
- Output: structured text per module + Curator Actions Suggested list + Living Room Readiness summary
- Admin UI for curation actions: `living-room-admin.html`

**Living Room fields added to Notion (Sprint 28):**

| DB | DS ID | Fields |
|---|---|---|
| CH People [OS v2] | `6f4197dd-3597-4b00-a711-86d6fcf819ad` | `Visibility` SELECT (public-safe / community / private) |
| CH Projects [OS v2] | `5ef16ab9-e762-4548-b6c9-f386da4f6b29` | `Share to Living Room` CHECKBOX · `Milestone Type` SELECT · `Community Theme` TEXT · `Living Room Visibility` SELECT |
| Knowledge Assets [OS v2] | `e7d711a5-f441-4cc8-96c1-bd33151c09b8` | `Living Room Theme` CHECKBOX |
| Content Pipeline [OS v2] | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` | `Share to Living Room` CHECKBOX |
| Insight Briefs [OS v2] | `839cafc7-d52d-442f-a784-197a5ea34810` | `Community Relevant` CHECKBOX · `Visibility` SELECT |

---

## Pack 0 — Source & Evidence Hygiene (pre-existing)

| Skill | Purpose | Writes? |
|---|---|---|
| `audit-source-integrity` | Audit CH Sources [OS v2] for 14 integrity checks | Read-only |
| `batch-source-excerpt-fill` | Repair missing Source Excerpts via verbatim match | Yes (SF-4) |
| `triage-knowledge` | Classify evidence as Project-specific / Reusable / Escalate | Read-only |
| `apply-safe-fixes` | Apply SF-1 through SF-5 safe hygiene fixes | Yes (tiered) |
| `audit-evidence-integrity` | Audit CH Evidence [OS v2] for integrity issues | Read-only |
| `suggest-safe-fixes` | Propose fixes without applying them | Read-only |
| `finalize-source-processing` | Mark sources as processed after evidence extraction | Yes |

---

## Pack 1 — Entity & Commercial Intelligence (Sprint 9)

### Entity Resolution

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `resolve-entities` | `resolve-entities.md` | Detect duplicates across orgs + people; score candidates; propose merge or needs-review | CH Organizations [OS v2], CH People [OS v2] | Yes (execute: provenance mark only) |
| `upsert-organization-profile` | `upsert-organization-profile.md` | Create or enrich org records; dedup-first; confidence-gated field fills | CH Organizations [OS v2] (`bef1bb86-ab2b-4cd2-80b6-b33f9034b96c`) | Yes |
| `upsert-person-profile` | `upsert-person-profile.md` | Create or enrich person records; dedup-first; Hugo Labrin hardcoded escalation | CH People [OS v2] (`1bc0f96f-33ca-4a9e-9ff2-6844377e81de`) | Yes |

### Commercial Pipeline

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `create-or-update-engagement` | `create-or-update-engagement.md` | Create or update relationship records; conservative status transitions | Engagements [OS v2] (search at runtime) | Yes |
| `create-or-update-opportunity` | `create-or-update-opportunity.md` | Create or update pipeline opportunities; stale detection; Won/Lost gated; **Step 0.5 Qualification Pre-Check added Sprint 24** | Opportunities [OS v2] (`687caa98-594a-41b5-95c9-960c141be0c0`) | Yes |

### Contract & Financial

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `extract-agreement-obligations` | `extract-agreement-obligations.md` | Parse source text → structured agreement + obligation records; never invents terms | Agreements & Obligations [OS v2] (search at runtime) | Yes |
| `update-financial-snapshot` | `update-financial-snapshot.md` | Upsert financial snapshots by entity + period; actuals override projections; never extrapolates | Financial Snapshots [OS v2] (search at runtime) | Yes |

### Operations

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `automation-health-review` | `automation-health-review.md` | Triage automations for ownership gaps, stale reviews, health signals; never turns off automations | Automations [OS v2] (search at runtime) | Yes (Needs Review + Notes append only) |

---

---

## Pack 2 — Intelligence & Insight Layer (Sprint 10)

### Relationship & Pipeline Intelligence

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `review-relationship-health` | `review-relationship-health.md` | Scan people + engagements for cold/neglected relationships; flag overdue catch-ups; stale Exploring | CH People [OS v2], Engagements [OS v2] | Yes (Catch-up sugerido + Notes append) |
| `startup-opportunity-scout` | `startup-opportunity-scout.md` | Cross-reference portfolio startups with Opportunities [OS v2]; flag missing or stale opportunity types | Opportunities [OS v2], Engagements [OS v2] | Yes (calls create-or-update-opportunity) |
| `investor-matchmaker` | `investor-matchmaker.md` | Match Funder orgs against portfolio startups using structural signals; propose Investor Match opportunities | Opportunities [OS v2], CH Organizations [OS v2] | Yes (calls create-or-update-opportunity) |

### Executive Intelligence

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `control-room-summarizer` | `control-room-summarizer.md` | Executive snapshot across all OS v2 surfaces; surfaces P1 signals | All OS v2 DBs (read-only) | No |
| `grant-fit-scanner` | `grant-fit-scanner.md` | Detect expiring grants, renewal flags, and coverage gaps for projects/startups | Agreements, Opportunities, Projects, Engagements | Yes (calls create-or-update-opportunity) |
| `proposal-packager` | `proposal-packager.md` | Assemble structured proposal briefs from existing OS v2 data; optionally saves to CH Evidence | All OS v2 DBs (read) + CH Evidence [OS v2] (optional write) | Yes (optional Evidence record creation) |

---

## Pack 3 — Commercial & Garage Intelligence (Sprint 24+25)

### Commercial Write Layer

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `upsert-proposal-brief` | `upsert-proposal-brief.md` | Create or update Proposal Brief records; dedup by client+engagement; status lifecycle; Active gate | Proposal Briefs [OS v2] (`76bfd50f`, DS: `8f0fb3de`) | Yes |
| `upsert-offer` | `upsert-offer.md` | Create or update Offer records; dedup by name; Active gate requires proof points | Offers [OS v2] (`58b863e9`, DS: `10c7de04`) | Yes |

### Garage — Startup Financial Intelligence

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `process-startup-financials` | `process-startup-financials.md` | Extract financial figures from uploaded file / text / manual input; routes to update-financial-snapshot | Financial Snapshots [OS v2] (via sub-skill) | Yes (via update-financial-snapshot) |
| `upsert-valuation` | `upsert-valuation.md` | Create or update multi-method valuation records; auto-determines Calculated/Locked/Estimated status | Valuations [OS v2] (`37a3686e`, DS: `8f8d903b`) | Yes |
| `upsert-data-room-item` | `upsert-data-room-item.md` | Create or update data room document tracking; 24-item VC DD checklist; computes readiness score | Data Room [OS v2] (`d3c56da9`, DS: `f6ccdab4`) | Yes |
| `vc-eyes-evaluator` | `vc-eyes-evaluator.md` | Evaluate startup investor readiness from investor perspective; scores 0–100; tiers A–E; critical issues | Data Room + Valuations + Financial Snapshots (read-only) | No |

### New Notion DBs (Sprint 24+25)

| DB | ID | DS | Purpose |
|---|---|---|---|
| Valuations [OS v2] | `37a3686e-be3f-408b-a92c-7373b0f01d60` | `8f8d903b-6679-4fb0-bae8-16f7362d00d0` | Multi-method valuations per startup per period |
| Data Room [OS v2] | `d3c56da9-3f60-4859-a51c-9a43a165f412` | `f6ccdab4-779d-4d4f-9748-dba1c905e846` | VC DD document tracking per startup |

---

## Pack 3b — Cap Table & Investor Comms (Sprint 26)

### Equity & Investor Reporting

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `upsert-captable-entry` | `upsert-captable-entry.md` | Create or update cap table entries; shareholder + share class dedup; post-round dilution computation | Cap Table [OS v2] (`cd3038b6`, DS: `f1571c77`) | Yes |
| `generate-investor-update` | `generate-investor-update.md` | Generate structured investor update from live OS v2 data; tone/audience/period selectable; optionally saves to Content Pipeline | Financial Snapshots + Projects + Opportunities + Data Room + Valuations (read) | Optional (Content Pipeline write) |

### New Notion DBs (Sprint 26)

| DB | ID | DS | Purpose |
|---|---|---|---|
| Cap Table [OS v2] | `cd3038b6-04b6-4c92-9dab-6a33275393b7` | `f1571c77-f057-45c1-94c9-4a5447a736dc` | Per-shareholder equity entries; share classes; dilution tracking |

---

## Pack 3c — Investor Comms Completion (Sprint 27)

### Branded Output + Portfolio Intelligence + Delivery

| Skill | File | Purpose | Target DB | Writes? |
|---|---|---|---|---|
| `generate-investor-update` (updated) | `generate-investor-update.md` | **+ Brand wiring**: reads Style Profile [OS v2] for startup; produces pptx/docx with brand colors, logo, font; invokes pptx/docx sub-skill | Style Profiles [OS v2] (read) + Content Pipeline (optional write) | Optional |
| `portfolio-vc-eyes-report` | `portfolio-vc-eyes-report.md` | Run vc-eyes-evaluator scoring across all active portfolio startups; produce ranked comparative report with tier breakdown, top gaps, investor readiness actions | Data Room + Financial Snapshots + Valuations (read-only) | No |
| `send-investor-update` | `send-investor-update.md` | Send approved investor update via Gmail to resolved investor contacts; triple-gated (dry_run + Status = Approved + recipient confirmation); logs send to Content Pipeline | Content Pipeline [OS v2] (Status → Published) + Gmail | Yes (Gmail + status update) |

### Investor Update full pipeline (Sprint 26+27)

```
generate-investor-update (text | docx | pptx)
  ├─► Style Profiles [OS v2]         (brand colors/logo/font — optional)
  ├─► pptx skill                     (if output_format: pptx)
  ├─► docx skill                     (if output_format: docx)
  └─► Content Pipeline [OS v2]       (save draft — optional)
           │
           │ [human approval: Status → Approved]
           ▼
send-investor-update
  ├─► CH People + Engagements [OS v2] (resolve investor recipients)
  ├─► Gmail MCP                       (send email ± attachment)
  └─► Content Pipeline [OS v2]        (Status → Published)
```

### Retailer Org Records Created (Sprint 24)

| Org | ID | Category | Status |
|---|---|---|---|
| Co-op | `34045e5b-6633-814f-818b-f13b3b90866a` | Corporation | Prospect |
| Waitrose | `34045e5b-6633-81a4-9a0a-cc637db4c8b7` | Corporation | Prospect |
| Tesco | `34045e5b-6633-81d0-bbec-de48b91a6797` | Corporation | Prospect |
| Sainsbury's | `34045e5b-6633-81a6-a4f6-dd7d2203796b` | Corporation | Prospect |
| Morrisons | `34045e5b-6633-8113-ae0c-cd42200b0067` | Corporation | Prospect |

---

## Skill dependency map

```
resolve-entities
    └─► upsert-organization-profile   (called when org not found + mode=execute)
    └─► upsert-person-profile         (called when person not found + mode=execute)

create-or-update-engagement
    └─► upsert-organization-profile   (called when org not found + mode=execute)

create-or-update-opportunity
    └─► upsert-organization-profile   (called when org not found + mode=execute)

extract-agreement-obligations
    └─► upsert-organization-profile   (called when org not found + mode=execute)

update-financial-snapshot             (standalone — no upstream skill calls)
automation-health-review              (standalone — read + safe Human Override Needed write only)

review-relationship-health            (standalone — read + safe flag/Notes write)
control-room-summarizer               (standalone — read-only, no writes ever)

startup-opportunity-scout
    └─► create-or-update-opportunity  (called for each MISSING gap + mode=execute)

investor-matchmaker
    └─► create-or-update-opportunity  (called for each high-score match + mode=execute)

grant-fit-scanner
    └─► create-or-update-opportunity  (called for GRANT GAP + mode=execute)

upsert-captable-entry             (standalone — reads all entries for startup to compute dilution)

generate-investor-update
    ├─► Style Profiles [OS v2]      (read: brand colors/logo/font — Sprint 27)
    ├─► pptx skill                  (if output_format: pptx — Sprint 27)
    ├─► docx skill                  (if output_format: docx — Sprint 27)
    └─► Content Pipeline [OS v2]    (optional write when save_to_content_pipeline=true + mode=execute)

send-investor-update
    ├─► Content Pipeline [OS v2]    (read: Draft Text; write: Status → Published)
    ├─► CH People + Engagements     (read: resolve investor recipients)
    └─► Gmail MCP                   (send — execute only, triple-gated)

portfolio-vc-eyes-report          (standalone — read-only: Data Room + Financial Snapshots + Valuations)

proposal-packager                     (standalone reads; optional write to CH Evidence)
```

---

## Confidence reference

| Confidence | Empty fields | Non-empty fields |
|---|---|---|
| High | Fill | Propose overwrite (dry) / apply (execute) |
| Medium | Fill non-sensitive | Skip sensitive, log |
| Low | Skip all | Skip all |

Protected fields (never auto-update regardless of confidence):
- `Access Role = Full Access / Limited Access`
- `Rol interno = Team`
- `Fecha de inicio` (date)
- `Revenue Share %`
- `Estimated Value` / `Probability %` (never infer)
- Any relation field in conflict → escalate
- `Status = Closed / Won / Lost / Terminated / Expired` → High confidence + explicit signal only

---

## Wave 1 Agents (Sprint 11 — Built)

All 5 agents are live at `.claude/agents/`. Files follow the same format as OS v2 operators.

| Agent | File | Skills Used | Trigger | Write Risk | Human Gate |
|---|---|---|---|---|---|
| `briefing-agent` | `briefing-agent.md` | control-room-summarizer, proposal-packager | Weekly + on-demand | None — always read-only | Never needed |
| `hygiene-agent` | `hygiene-agent.md` | automation-health-review, resolve-entities | Weekly | Low — flags + provenance marks | Required for entity writes |
| `portfolio-health-agent` | `portfolio-health-agent.md` | review-relationship-health, startup-opportunity-scout | Weekly | Medium — catch-up flags + Opportunity creates | Required before execute |
| `grant-monitor-agent` | `grant-monitor-agent.md` | grant-fit-scanner, extract-agreement-obligations | Monthly + on-demand | Medium — Opportunity + Agreement creates | Required before execute |
| `deal-flow-agent` | `deal-flow-agent.md` | investor-matchmaker | Bi-weekly + on-demand | High — Investor Match opportunity creates | **Mandatory** — no exceptions |

**Build order (Sprint 11):** briefing-agent → hygiene-agent → portfolio-health-agent → grant-monitor-agent → deal-flow-agent

**Run order (recommended):**
1. briefing-agent (Monday morning, situational awareness first)
2. hygiene-agent (weekly structural health)
3. portfolio-health-agent (weekly portfolio pulse)
4. grant-monitor-agent (monthly only)
5. deal-flow-agent (bi-weekly, always dry_run first)

**Common output contract (all agents):**
All agents return an `agent_run_summary` block with: `agent_name`, `mode`, `skills_called`, `records_inspected`, `records_created`, `records_updated`, `records_skipped`, `escalation_count`, `p1_count`, `blockers`, `recommended_next_step`.

---

## Wave 1 — Activation Status (Sprint 13 — 2026-04-12)

| Agent | dry_run validated | execute validated | blocked by |
|---|---|---|---|
| briefing-agent | ✅ Sprint 12 | N/A (read-only) | — |
| hygiene-agent | ✅ Sprint 12 | ✅ Sprint 13 (limited) | — |
| portfolio-health-agent | ✅ Sprint 12 | ✅ Sprint 13 (12 opps created) | — |
| grant-monitor-agent | ✅ Sprint 12 | ✅ Sprint 13 (4 grant opps created) | — |
| deal-flow-agent | ✅ Sprint 13 | ✅ Sprint 13 (if strong matches) | Funder data quality |

---

## Wave 1 — Operating Cadence

| Agent | Trigger | Frequency | dry_run default | Execute gate | Human review output |
|---|---|---|---|---|---|
| briefing-agent | Monday morning | Weekly | Always dry_run | Never (read-only) | P1 signals, pipeline stalls, project blockers |
| hygiene-agent | Monday morning (after briefing) | Weekly | dry_run first | execute_gate: confirmed | Automation flags, duplicate candidates |
| portfolio-health-agent | Monday morning | Weekly | dry_run first | execute_gate: confirmed | Catch-up queue, opportunity gaps by startup |
| grant-monitor-agent | 1st Monday of month | Monthly | dry_run first | execute_gate: confirmed | Expiring grants, coverage gaps |
| deal-flow-agent | 1st and 3rd Monday | Bi-weekly | Always dry_run first | execute_gate: confirmed — MANDATORY | Strong match pairs, borderline for human review |

### Execute escalation rules
- briefing-agent: NEVER write. Output reviewed by principal.
- hygiene-agent: execute only after reviewing dry_run. Max writes: Human Override Needed flags + provenance marks.
- portfolio-health-agent: execute after human confirms gap list. Creates opportunities at New status only.
- grant-monitor-agent: execute after human reviews entity list. Creates Grant opportunities at New or Qualifying.
- deal-flow-agent: MANDATORY human review of dry_run before any execute. Never execute borderline matches.

### Conditions to move from dry_run to recurrent execute
- briefing-agent: N/A — always read-only
- hygiene-agent: ✅ Already cleared — execute safe for automation flags + provenance marks
- portfolio-health-agent: ✅ Already cleared — execute safe for New opportunities + catch-up flags
- grant-monitor-agent: ✅ Already cleared — execute safe for Grant opportunities at New/Qualifying
- deal-flow-agent: Cleared on per-run basis only. Each execute requires fresh human review of dry_run output.

---

## Funder / Investor Data Status (Sprint 13 — 2026-04-12)

| Organization | Category | Country | Domains | Usable for deal-flow |
|---|---|---|---|---|
| Co Capital | Funder | Other | Unknown | Partial (no sector data) |
| Global Methane Hub | Funder | Other | Climate, Zero Waste | ✅ |
| UNDP | Funder | Other (NYC) | Climate, Public Sector | ✅ (Active relationship via Auto Mercado) |
| GEF — Global Environment Facility | Funder | United States | Climate, Waste | ✅ |
| IDB — Inter-American Development Bank | Funder | United States | Public Sector, Climate | ✅ |
| World Bank | Funder | United States | Public Sector, Climate | ✅ |

Next steps: Enrich Co Capital with sector data when known. Add 5+ more funders as CH network grows.

---

## Quick invocation reference

```
# Resolve potential duplicate org
resolve-entities:
  mode: dry_run
  scope: organization
  candidates:
    - name: "Green Ventures"

# Create new org
upsert-organization-profile:
  mode: execute
  org:
    name: "Circular Hub"
    category: "Partner"
    confidence: High

# Create engagement
create-or-update-engagement:
  mode: execute
  engagement:
    type: Startup
    org_name: "TerraCircular"
    relationship_status: Exploring
    confidence: Medium

# Create opportunity
create-or-update-opportunity:
  mode: execute
  opportunity:
    type: CH Sale
    org_name: "Reuse for All"
    stage: Qualifying
    next_step: "Send proposal by May 1"
    confidence: High

# Extract from email
extract-agreement-obligations:
  mode: dry_run
  source:
    text: "[paste email text here]"
    source_type: email

# Snapshot a startup financials
update-financial-snapshot:
  mode: execute
  snapshot:
    scope_type: Startup
    entity_name: "TerraCircular"
    period: "2025-Q2"
    revenue: 45000
    cost: 38000
    confidence: High

# Review all active automations
automation-health-review:
  mode: execute
  scope:
    filter: active_only

# Scan relationship health
review-relationship-health:
  mode: dry_run
  scope:
    filter: all
  thresholds:
    cold_days: 60

# Get control room briefing
control-room-summarizer:
  mode: dry_run
  sections:
    projects: true
    pipeline: true
    engagements: true
    automations: true
    agreements: true

# Scout for missing startup opportunities
startup-opportunity-scout:
  mode: dry_run
  scope:
    filter: all_active
  checks:
    ch_sale: true
    investor_match: true
    grant: true

# Match investors to portfolio
investor-matchmaker:
  mode: dry_run
  matching:
    min_match_score: 40
    max_matches_per_startup: 5

# Scan grant coverage
grant-fit-scanner:
  mode: dry_run
  scope:
    candidates: both
  thresholds:
    expiry_warning_days: 90

# Package a proposal brief
proposal-packager:
  mode: dry_run
  target:
    entity_type: organization
    entity_name: "Engatel"
  sections:
    relationship_history: true
    pipeline: true
    agreements: true
    financials: true
    key_contacts: true
```

---

## Hooks Readiness (Sprint 14 — 2026-04-12)

Design: complete — see `.claude/HOOKS-DESIGN.md`
Implementation: 3 scheduled hooks ACTIVE since Sprint 14. 2 manual-only.

### Active scheduled hooks (dry_run only)
- briefing-agent: Monday 08:00 UTC-6, weekly — ACTIVE
- hygiene-agent: Monday 08:15 UTC-6, weekly — ACTIVE
- portfolio-health-agent: Monday 08:30 UTC-6, weekly — ACTIVE

### Manual-only (execute always human-gated, no exceptions)
- grant-monitor-agent: 1st Monday of month — run manually; dry_run auto-schedule safe but not configured
- deal-flow-agent: 1st + 3rd Monday — MANDATORY human review before every execute

### Never automate execute for:
- hygiene-agent execute
- portfolio-health-agent execute
- grant-monitor-agent execute
- deal-flow-agent execute (MANDATORY gate, no exceptions)

### PreToolUse safety hooks (settings.local.json)
- notion-create-pages: 4 guards (raw dump, dedup, evidence integrity, legacy block)
- notion-update-page: 2 guards (raw dump, legacy block)
Note: guards are echo-only reminders, not hard blockers.

---

## Sprint 14 Update — Agent Management MVP (2026-04-12)

### Scheduled Hooks (Active)

| Agent | Hook | Schedule | Mode | Activated |
|-------|------|----------|------|-----------|
| briefing-agent | mcp__scheduled-tasks | Monday 08:00 UTC-6, weekly | dry_run | ✅ Sprint 14 |
| hygiene-agent | mcp__scheduled-tasks | Monday 08:15 UTC-6, weekly | dry_run | ✅ Sprint 14 |
| portfolio-health-agent | mcp__scheduled-tasks | Monday 08:30 UTC-6, weekly | dry_run | ✅ Sprint 14 |

### Gated Hooks (Registered — Manual Invoke)

| Agent | Trigger | Execute Gate | Notes |
|-------|---------|------|-------|
| grant-monitor-agent | 1st Monday of month | execute_gate: confirmed | Monthly dry_run can be auto-scheduled |
| deal-flow-agent | 1st + 3rd Monday | execute_gate: confirmed — MANDATORY | Every execute requires fresh human review |
| portfolio-health-agent (execute) | After weekly dry_run | execute_gate: confirmed | If catch-up/opp gaps confirmed |
| hygiene-agent (execute) | After weekly dry_run | execute_gate: confirmed | If automation flags confirmed |

### Skill Hardening (Sprint 14)
- Schema Watchdog Step 0 added to 7 critical skills: create-or-update-opportunity, create-or-update-engagement, upsert-organization-profile, upsert-person-profile, extract-agreement-obligations, update-financial-snapshot, automation-health-review
- All 7 skills now return BLOCKED-SCHEMA-DRIFT if target DB schema has drifted
- agent_contract verified: all 10 standard fields present across all critical skills
- Rerun safety / idempotency notes strengthened in: create-or-update-opportunity, startup-opportunity-scout, investor-matchmaker, grant-fit-scanner

### Automations [OS v2] — Agent Management Extension
- 17 new fields added (Automation Kind, Default Mode, Requires Human Approval, Schedule Type/Expression, Last Run At/Status/Duration/Cost, Consecutive Failures, Active Hook, Hook Status, Writes Allowed, Skill Chain, Model, Max Turns, Next Scheduled Run)
- 5 Wave 1 agent records created
- Management views created: Active Agents, Needs Approval, Hooks Active, Manual Only, Broken/Degraded
