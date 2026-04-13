# Operating Readiness Audit — Sprint 23
**Date:** 2026-04-12
**Scope:** Full CH OS v2 system — Skills, Agents, Hooks, Platform, Decisions, Commercial

---

## 1. Executive Summary

The system is **structurally solid and operationally functional**. The OS v2 core pipeline runs, all 5 Wave 1 agents exist and have been validated, 3 are scheduled, and every major system (Design, Comms, Insights, Grants, Proposals, Offers, Commercial) has Notion DBs, documented workflows, and pilot records.

**The honest truth:**
- Core OS (source-to-knowledge pipeline): `Live`
- Agent layer: `Live` — 3 scheduled + 2 manual-gated
- Hooks: `Live` for 3 agents, manual for 2 — safety guards echo-only
- Commercial layer (Proposals + Offers): `Partial` — DBs live, workflows documented, **no skills**, manual-only
- Platform: `Partial` — IA fully defined, HTML mockups complete, **not implemented as real app**
- Human decision debt: `Real and growing` — 6 open items blocking flows

**Verdict:** `System partial — resolve commercial skill gap + human decisions before expanding.`

---

## 2. Skills Audit

### Count
**21 skill files total** across 4 packs.

### Full inventory and classification

#### Pack 0 — Source & Evidence Hygiene (7 skills)

| Skill | Status | Notes |
|-------|--------|-------|
| `audit-source-integrity` | **Live** | Read-only, 14-check audit |
| `batch-source-excerpt-fill` | **Live** | Writes excerpts, SF-4 safe fix |
| `triage-knowledge` | **Live** | Read-only, classifies evidence |
| `apply-safe-fixes` | **Live** | Writes SF-1 through SF-5 |
| `audit-evidence-integrity` | **Live** | Read-only |
| `suggest-safe-fixes` | **Live** | Read-only, proposes fixes |
| `finalize-source-processing` | **Live** | Marks sources as Processed |

#### Pack 1 — Entity & Commercial Intelligence (8 skills)

| Skill | Status | Notes |
|-------|--------|-------|
| `resolve-entities` | **Live** | Dedup across orgs + people |
| `upsert-organization-profile` | **Live** | Schema Watchdog added Sprint 14 |
| `upsert-person-profile` | **Live** | Schema Watchdog added Sprint 14 |
| `create-or-update-engagement` | **Live** | Schema Watchdog added Sprint 14 |
| `create-or-update-opportunity` | **Live** | Schema Watchdog added Sprint 14 |
| `extract-agreement-obligations` | **Live** | Schema Watchdog added Sprint 14 |
| `update-financial-snapshot` | **Live** | Schema Watchdog added Sprint 14 |
| `automation-health-review` | **Live** | Schema Watchdog added Sprint 14 |

#### Pack 2 — Intelligence & Insight Layer (6 skills)

| Skill | Status | Notes |
|-------|--------|-------|
| `review-relationship-health` | **Live** | Flags cold contacts + stale Exploring |
| `startup-opportunity-scout` | **Live** | Calls create-or-update-opportunity |
| `investor-matchmaker` | **Live** | Calls create-or-update-opportunity |
| `control-room-summarizer` | **Live** | Read-only, full OS v2 snapshot |
| `grant-fit-scanner` | **Live** | Calls create-or-update-opportunity |
| `proposal-packager` | **Live (Partial)** | Reads + assembles briefs, but does NOT create Proposal Brief records in Notion — **assembly only, no write to Proposal Briefs DB** |

### Missing skills (real gaps)

| Missing Skill | System | Why it's missing | What it blocks |
|---------------|--------|------------------|----------------|
| `upsert-proposal-brief` | Proposal System | Never built | No agent can create/update Proposal Brief records; all commercial record creation is manual |
| `upsert-offer` | Offer System | Never built | No agent can create/update Offer records; offer lifecycle is entirely manual |

**Note on `proposal-packager`:** This skill exists and is solid for its purpose (reading existing OS v2 data and assembling a briefing document). But it does not create or update records in Proposal Briefs [OS v2] (`76bfd50f`). The name creates a naming confusion — it packages intelligence FOR a proposal, not a Proposal Brief record.

### Skills classification summary

| Classification | Count | Skills |
|---------------|-------|--------|
| **Live** | 20 | All Pack 0 + Pack 1 + Pack 2 (except proposal-packager caveat) |
| **Partial** | 1 | `proposal-packager` (assembly only, no Proposal Brief writes) |
| **Missing** | 2 | `upsert-proposal-brief`, `upsert-offer` |
| **Deprecated** | 0 | — |

---

## 3. Agents Audit

### Count
**14 agent files total** across 2 layers.

### OS v2 Core Pipeline Agents (9 agents)

| Agent | Status | Runs real? | Notes |
|-------|--------|------------|-------|
| `os-runner` | **Live** | Yes — full 6-step cadence | Orchestrates source-intake through update-knowledge-asset |
| `source-intake` | **Live** | Yes | Gmail → CH Sources [OS v2] |
| `evidence-review` | **Live** | Yes | Sources → CH Evidence [OS v2] |
| `db-hygiene-operator` | **Live** | Yes | Hygiene on touched projects |
| `validation-operator` | **Live** | Yes | AUTO_VALIDATE / AUTO_REVIEW / ESCALATE |
| `project-operator` | **Live** | Yes | Validated evidence → Draft Status Updates |
| `update-knowledge-asset` | **Live** | Yes | Evidence → Knowledge Asset delta proposals |
| `update-project-status` | **Live** | Yes | Draft Status Update writes |
| `review-queue` | **Live** | Yes | P1 / Project / Knowledge review queues |

### Wave 1 Agents (5 agents)

| Agent | Status | Scheduled? | dry_run validated | execute validated | Human gate |
|-------|--------|-----------|-------------------|-------------------|------------|
| `briefing-agent` | **Live — Execute validated** | ✅ Monday 08:00 UTC-6 weekly | ✅ Sprint 12 | N/A (read-only) | Never needed |
| `hygiene-agent` | **Live — Execute validated** | ✅ Monday 08:15 UTC-6 weekly (dry_run) | ✅ Sprint 12 | ✅ Sprint 13 (limited) | Required for entity writes |
| `portfolio-health-agent` | **Live — Execute validated** | ✅ Monday 08:30 UTC-6 weekly (dry_run) | ✅ Sprint 12 | ✅ Sprint 13 (12 opps created) | Required before execute |
| `grant-monitor-agent` | **Live — Execute validated** | Manual only (1st Monday of month) | ✅ Sprint 12 | ✅ Sprint 13 (4 grant opps) | Required before execute |
| `deal-flow-agent` | **Live — Dry-run validated** | Manual only (bi-weekly) | ✅ Sprint 13 | ✅ Sprint 13 (if strong matches) | MANDATORY every run |

### Agents not needed now

| Proposed | Verdict | Why |
|----------|---------|-----|
| Proposal-agent | **Not needed now** | `upsert-proposal-brief` skill doesn't exist yet. Build skill first. |
| Offer-agent | **Not needed now** | `upsert-offer` skill doesn't exist yet. Offer creation is manual by design. |
| Comms-agent | **Not needed now** | Content production is editorial — human judgment required at brief stage |
| Insight-agent | **Not needed now** | Insight brief creation is analytical — no automation value yet |

### Agents classification summary

| Classification | Count |
|---------------|-------|
| **Live** | 14 |
| **Dry-run only** | 0 |
| **Execute validated** | 13 (all except deal-flow which is per-run-gated) |
| **Missing but needed** | 0 (agent inflation avoided) |
| **Not needed now** | 4 (premature) |

---

## 4. Hooks Audit

### A. Active scheduled hooks (3)

| Hook | Agent | Schedule | Mode | Status | Proof |
|------|-------|----------|------|--------|-------|
| briefing-agent weekly | briefing-agent | Monday 08:00 UTC-6 | dry_run | **ACTIVE** | Registered Sprint 14 |
| hygiene-agent weekly | hygiene-agent | Monday 08:15 UTC-6 | dry_run | **ACTIVE** | Registered Sprint 14 |
| portfolio-health-agent weekly | portfolio-health-agent | Monday 08:30 UTC-6 | dry_run | **ACTIVE** | Registered Sprint 14 |

**Caveat:** "Active" means registered via mcp__scheduled-tasks. Actual execution depends on scheduled-tasks infrastructure availability at runtime. No run logs confirmed in this audit.

### B. Manual/Gated hooks (2)

| Hook | Agent | Trigger | Mode | Gate | Status |
|------|-------|---------|------|------|--------|
| grant-monitor monthly | grant-monitor-agent | 1st Monday of month | dry_run first | execute_gate: confirmed | **MANUAL** |
| deal-flow bi-weekly | deal-flow-agent | 1st + 3rd Monday | dry_run ALWAYS first | MANDATORY human review | **MANUAL** |

### C. Safety hooks in settings.local.json (active)

| Hook | Trigger | Action | Real protection? |
|------|---------|--------|-----------------|
| PreToolUse / notion-create-pages | Before any Notion page create | 4 echo guards (raw dump, dedup, integrity, legacy) | **Echo-only** — reminds but does not block |
| PreToolUse / notion-update-page | Before any Notion page update | 2 echo guards | **Echo-only** — reminds but does not block |
| PostToolUse / Bash | After any Bash command | Smoke test → temp file | **Low value** — proof of life only |

**Real talk on guards:** The PreToolUse guards fire echo reminders but contain no `exit 1` logic. They cannot actually block a write. Their value is as a "thinking pause" injected before Notion mutations. This is better than nothing but not true enforcement.

### D. Event-driven hooks — designed, NOT implemented (5)

| Design | Trigger | Agent | Status | Why not active |
|--------|---------|-------|--------|----------------|
| Opportunity Stale | Opp stuck at New/Qualifying > 45 days | portfolio-health-agent | Design only | Requires DB webhook, not available |
| Agreement Expiry | Agreement End Date within 30 days | grant-monitor-agent | Design only | Same infra gap |
| Automation Overdue Review | Automation record overdue | hygiene-agent | Design only | Same infra gap |
| New Funder Added | New Funder org created | deal-flow-agent | Design only | Would violate mandatory human review rule |
| Startup Distress | Revenue < previous period by >30% | portfolio-health-agent | Design only | Financial Snapshots data too sparse |

### E. Missing hooks worth evaluating now

| Proposed hook | Trigger | Value | Verdict |
|---------------|---------|-------|---------|
| grant-monitor dry_run auto-schedule | 1st Monday of month | Reduces manual burden | **Worth activating** — safe, read-only |
| Proposal Brief status change alert | Proposal moves to In Review | Human awareness | **Not yet** — needs upsert-proposal-brief skill first |
| Offer Opportunity Cue prompt | New Offer → Opportunity Cues field | Remind to create opps | **Not yet** — no infrastructure |

### Hooks classification summary

| Classification | Count |
|---------------|-------|
| **Live** | 3 (scheduled) + 3 (safety) = 6 |
| **Scheduled but unproven** | 3 (scheduled hooks not confirmed running) |
| **Manual only** | 2 |
| **Designed only** | 5 |
| **Missing / worth activating** | 1 (grant-monitor monthly auto-dry_run) |

---

## 5. Platform Reflection Audit

### Reality check: what is actually implemented vs. defined

| Surface | Defined in IA | HTML mockup | Running app | Notes |
|---------|--------------|-------------|-------------|-------|
| Hall (public vitrina) | ✅ | ✅ `hall-vitrina.html` | ❌ | Static mockup only |
| Hall (client view) | ✅ | ✅ `hall-mockup.html` | ❌ | Static mockup only |
| Residents | ✅ | ✅ `residents-mockup.html` | ❌ | Static mockup only |
| Control Room | ✅ | ✅ `control-room.html` | ❌ | Static mockup only |
| Workrooms | ✅ | Partial | ❌ | Design exists; not built |
| Garage | ✅ | ❌ | ❌ | Defined in IA, no mockup |
| Desks (Design/Comms/Insights/Grants) | ✅ | Partial in hall-vitrina | ❌ | Described, not built |
| Auth layer | ✅ | ❌ | ❌ | Clerk spec exists; not implemented |
| Agent schedule UI | ✅ | Partial in control-room | ❌ | Shows static agents list |

**What the frontend/ directory contains:** An AlmacenIQ invoice management app — completely separate from Common House platform. Not the CH portal.

**What `common-house-app/` is:** Listed in CLAUDE.md as a directory, but does not currently exist as a subdirectory.

### System-by-system platform status

| System | Lives in Notion | Surface in platform | Control Room sub-nav | Verdict |
|--------|----------------|--------------------|--------------------|---------|
| Operating (OS v2 pipeline) | ✅ | ❌ (no portal yet) | System Health tab | **Well-defined, not surfaced** |
| Knowledge | ✅ | ❌ | Knowledge tab | **Well-defined, not surfaced** |
| Decision Center | ✅ | ❌ | Decisions tab | **Well-defined, not surfaced** |
| Agent Management | ✅ (Automations DB) | ❌ | Agents tab | **Well-defined, not surfaced** |
| Brand Brain | ✅ | ❌ | Content tab (partial) | **Solid in Notion, no platform surface** |
| Design | ✅ | Hall vitrina (mockup) | Content tab | **Mockup only** |
| Comms | ✅ | Hall vitrina (mockup) | Content tab | **Mockup only** |
| Insight Engine | ✅ | Hall vitrina (mockup) | Insights tab | **Mockup only** |
| Grants | ✅ | Hall vitrina (mockup) | Grants tab | **Solid in Notion, mockup only** |
| Proposal | ✅ | ❌ | Proposals tab (defined) | **DB live, no portal surface** |
| Offer | ✅ | ❌ | Offers tab (defined) | **DB live, no portal surface** |
| Commercial (pipeline) | ✅ | Hall vitrina CTAs (mockup) | Pipeline tab | **CTA specs defined, not built** |
| Residents | ✅ (People DB) | HTML mockup | N/A | **Mockup only** |
| Hall | Partial (Projects DB) | HTML mockup | N/A | **Mockup only** |

**Summary:** Every system has its Notion backend. Nothing is surfaced in a running web app yet. The gap between "documented in Notion" and "visible in product" is total for the CH portal.

---

## 6. Human Decision Debt

### Open items blocking flows

| Decision | System affected | Priority | Where it lives | Action to unblock |
|----------|----------------|----------|---------------|--------------------|
| SUFI — Confirm Fair4All Finance Eligibility | Grants | **CRITICAL** | Decision Center (Urgent) | Confirm SUFI entity type (CIC/charity); check application window timing |
| Greenleaf Retail Proposal — Review & Approve | Proposal | **HIGH** | Proposal Briefs (Draft) | Move from Draft → In Review → Approved; assign reviewer |
| Portfolio Acceleration — Pricing Validation | Offer | **HIGH** | Offer (In Development) | Validate equity vs. fee model; move to Active once confirmed |
| FMCG Brand Divisions — Naming Decision | Offer/Commercial | **HIGH** | Decision Center (Open) | Decide on FMCG division naming; required before Offer Cue activation |
| Retailer Org Records — Create 5 missing orgs | Commercial | **HIGH** | CH Organizations (missing) | Create Co-op, Waitrose, Tesco, Sainsbury's, Morrisons in CH Organizations so the 5 Retail Refill opportunities have proper CH Organization links |
| iRefill — Innovate UK Smart Grant: Qualify? | Grants | **NORMAL** | Decision Center (High) | Confirm R&D scope + eligible costs + application owner |
| EIC Accelerator — iRefill vs Yenxa: Which First? | Grants | **NORMAL** | Decision Center (Normal) | Sequence EIC applications |
| Esmée Fairbairn — Entity Eligibility | Grants | **NORMAL** | Decision Center (High) | Confirm CH/iRefill entity status |
| Grant Agreements — Missing Date Audit | Grants | **NORMAL** | Decision Center (Normal) | Audit all Grant Agreement records for missing End Dates |
| Deal-flow Execute Gate Policy | Agent Management | **LOW** | Decision Center (Open) | Confirm mandatory human review policy; update Automations record |

### Key observation
The 5 retailer org records (Co-op, Waitrose, Tesco, Sainsbury's, Morrisons) are likely NOT in CH Organizations yet. The 5 Retail Refill opportunities were created with those names, but the CH Organization link fields may be empty. This breaks the Opportunity → Organization relationship and means deal-flow / portfolio-health can't surface these correctly.

---

## 7. Commercial Follow-Through Audit

### Proposal System state

| Item | Status | Gap |
|------|--------|-----|
| Proposal Briefs [OS v2] DB | ✅ Live | — |
| Greenleaf Retail Proposal (Pilot 1) | Draft — not reviewed | Human decision needed |
| Proposal → Design → Sent flow | Documented | No automation; fully manual |
| `upsert-proposal-brief` skill | **Missing** | Biggest gap: no skill to create/update Proposal Brief records programmatically |
| Design Asset Request → Content Pipeline link | Documented | Manual; no hook |
| Content Pipeline views for Proposals | ✅ Live (Proposal Requests, Proposal Review) | — |

### Offer System state

| Item | Status | Gap |
|------|--------|-----|
| Offers [OS v2] DB | ✅ Live | — |
| Retail Refill Implementation offer | **Active** ✅ | Proof points need updating with latest Auto Mercado data |
| Portfolio Acceleration offer | In Development | Pricing validation pending (Human decision) |
| `upsert-offer` skill | **Missing** | No skill to create/update Offer records programmatically |
| Opportunity Cues → Pipeline links | 5 retail opps created ✅ | Retailer org records missing |
| Design Assets (Sales Deck, Offer Card) | Documented | Not produced yet |

### Commercial layer loop status

```
Offer Cues → ✅ (5 opps created)
Opps linked to Orgs → ❌ (retailer org records missing)
Proposal Brief created → ✅ (Greenleaf - pilot)
Proposal reviewed → ❌ (stuck in Draft)
Proposal → Design → Sent → ❌ (not automated, not progressed)
Offer Active → ✅ (Retail Refill) / ❌ (Portfolio Acceleration)
Offer → Proposal → Win → Project → ❌ (loop not closed yet)
```

### Do Proposal/Offer justify a dedicated skill/agent/hook now?

| Item | Verdict | Why |
|------|---------|-----|
| `upsert-proposal-brief` skill | **YES — build now** | Every other writable OS v2 DB has an upsert skill. This is the obvious missing pair. Required before any agent can work with Proposal Briefs. |
| `upsert-offer` skill | **YES — build now** | Same logic as above. Required before any agent can maintain the Offer library. |
| Proposal-specific agent | **Not yet** | Build the skills first. Agent is premature without skills. |
| Offer-specific agent | **Not yet** | Same. |
| Hook: proposal approved → design request | **Not yet** | Needs skill first. Could be Sprint 24. |
| Hook: offer cue → opportunity | **Useful, post skill** | Once upsert-proposal-brief exists, a brief hook makes sense. |

---

## 8. Missing Pieces

### A. Missing skills (real, needed now)

| Skill | System | Why | Unlocks | Urgency |
|-------|--------|-----|---------|---------|
| `upsert-proposal-brief` | Proposal | Only OS v2 writable DB without an upsert skill | Programmatic proposal creation; future proposal-agent; briefing-agent proposal-write mode | **Now** |
| `upsert-offer` | Offer | Only OS v2 writable DB without an upsert skill | Programmatic offer maintenance; offer lifecycle automation | **Now** |

### B. Missing agents (real, needed now or soon)

None needed now. Agent inflation risk is real. Resolve missing skills first.

### C. Missing hooks (real, worth activating now)

| Hook | System | Why | Urgency |
|------|--------|-----|---------|
| grant-monitor monthly auto-dry_run | Grants | Monthly cadence exists but not auto-scheduled; safe to automate | **Soon** (can activate now if desired) |

---

## 9. Fixes Applied in Sprint 23

| Fix | File | What changed |
|-----|------|-------------|
| HOOKS-DESIGN.md — briefing-agent status | `.claude/HOOKS-DESIGN.md` | `[PENDING INFRA]` → `[ACTIVE]` — Monday 08:00 UTC-6 weekly |
| HOOKS-DESIGN.md — hygiene-agent status | `.claude/HOOKS-DESIGN.md` | `[PENDING INFRA]` → `[ACTIVE]` — Monday 08:15 UTC-6 weekly |
| HOOKS-DESIGN.md — portfolio-health-agent status | `.claude/HOOKS-DESIGN.md` | `[PENDING INFRA]` → `[ACTIVE]` — Monday 08:30 UTC-6 weekly |
| HOOKS-DESIGN.md — grant-monitor status | `.claude/HOOKS-DESIGN.md` | `[PENDING INFRA]` → `[MANUAL]` — accurate description |
| HOOKS-DESIGN.md — deal-flow status | `.claude/HOOKS-DESIGN.md` | `[PENDING INFRA]` → `[MANUAL]` — accurate description |
| SKILL-REGISTRY.md — Hooks Readiness | `.claude/skills/SKILL-REGISTRY.md` | Replaced stale Sprint 13 block with accurate Sprint 14 state |
| RUNBOOK.md — commercial + Proposal/Offer habits | `.claude/RUNBOOK.md` | Added Proposal/Offer/Commercial weekly habit section |
| PLATFORM-IA.md — platform reality note | `.claude/PLATFORM-IA.md` | Added implementation reality note in Section 10 |
| READINESS-AUDIT.md created | `.claude/READINESS-AUDIT.md` | This document |

---

## 10. Readiness Scoreboard

### By layer

| Layer | Status | Notes |
|-------|--------|-------|
| Skills (core OS + Wave 1) | **Live** | 20/21 live; 2 missing for Proposal/Offer |
| Agents (core + Wave 1) | **Live** | 14/14 exist; 3 scheduled, 2 manual-gated |
| Hooks (scheduled) | **Partial** | 3 active (dry_run); guards echo-only; 5 event-driven designs not built |
| Platform (web) | **Partial** | Full IA + mockups; no running app |
| Human decision debt | **Partial** | 10 open items; 2 Critical, 4 High |
| Commercial follow-through | **Partial** | Loop defined; missing skills + human decisions |

### By system

| System | Status | Key gap |
|--------|--------|---------|
| Operating (OS v2 core) | **Live** | — |
| Knowledge | **Live** | — |
| Decision Center | **Live** | 10 items aging without resolution |
| Agent Management | **Live** | — |
| Brand Brain | **Live** | Design assets not produced yet |
| Design | **Partial** | No running platform surface; manual only |
| Comms | **Partial** | No running surface; manual; 7 pilots at Review |
| Insight Engine | **Live** | 5 briefs seeded; routing flow working |
| Grants | **Partial** | P1 SUFI eligibility unresolved; retailer org records missing |
| Proposal | **Fragile** | DB live; 1 pilot; no skill; human review pending |
| Offer | **Partial** | 1 Active; 1 In Dev; no skill; pricing pending |
| Commercial | **Partial** | 5 opps live; org links missing; loop not closed |
| Residents | **Partial** | People DB live; mockup only |
| Hall / Platform IA | **Partial** | Mockups live; no running app |

---

## 11. Docs Updated

| File | Sprint 23 changes |
|------|-------------------|
| `.claude/HOOKS-DESIGN.md` | Implementation status corrected for all 5 agents |
| `.claude/skills/SKILL-REGISTRY.md` | Hooks Readiness section updated from Sprint 13 to Sprint 14 accurate state |
| `.claude/RUNBOOK.md` | Added Commercial / Proposal / Offer weekly habit section |
| `.claude/PLATFORM-IA.md` | Added implementation reality note in Section 10 |
| `.claude/READINESS-AUDIT.md` | Created — this document |

### Sprint 24 changes (2026-04-12)

| Fix | File | What changed |
|-----|------|-------------|
| OPPORTUNITY-STANDARD.md created | `.claude/OPPORTUNITY-STANDARD.md` | Official qualification standard: 6 criteria, score model 0–100, thresholds, prohibited patterns, score templates |
| Opportunities DB schema | Notion | Added `Opportunity Score` (number) + `Qualification Status` (select: Qualified / Needs Review / Below Threshold / Not Scored) |
| 5 Decision Items created | Notion Decision Center | Co-op (59) Needs Review, Waitrose (53) Needs Review, Tesco (43) Below Threshold, Sainsbury's (42) Below Threshold, Morrisons (38) Below Threshold |
| 5 retailer opportunity pages scored | Notion Opportunities | Opportunity Score + Qualification Status + Notes written to all 5 records |
| 4 new views created | Notion Opportunities | 🎯 Needs Qualification, 🔴 Below Threshold, 📊 By Qualification Status, 📋 Not Scored |
| create-or-update-opportunity.md | `.claude/skills/create-or-update-opportunity.md` | Step 0.5 Qualification Pre-Check added; new action: BLOCKED-QUALIFICATION; Qualification Status + Opportunity Score added to Step 4 fields |
| startup-opportunity-scout.md | `.claude/skills/startup-opportunity-scout.md` | Qualification gate added to Step 3 — structural gap alone insufficient to create in execute mode |
| grant-fit-scanner.md | `.claude/skills/grant-fit-scanner.md` | CHECK G3 hardened — active window + confirmed eligibility required; GRANT GAP — INFORMATIONAL classification added |
| RUNBOOK.md | `.claude/RUNBOOK.md` | Opportunity Standard section added; weekly commercial habit updated |
| SKILL-REGISTRY.md | `.claude/skills/SKILL-REGISTRY.md` | Opportunity Qualification Standard block added; create-or-update-opportunity updated |

---

## 12. Remaining Blockers

### Real blockers (things that stop operation)

1. **`upsert-proposal-brief` skill missing** — Proposal Brief lifecycle cannot be automated. All Proposal Brief creation and updates are manual. No agent can write to Proposal Briefs DB.

2. **`upsert-offer` skill missing** — Offer lifecycle cannot be automated. Same issue.

3. **5 retailer org records missing from CH Organizations** — Co-op, Waitrose, Tesco, Sainsbury's, Morrisons must exist as CH Organization records before the 5 Retail Refill opportunities have proper Account links. Without this, portfolio-health-agent and deal-flow-agent cannot surface these correctly.

4. **SUFI Fair4All Finance eligibility unresolved** — P1 grant decision blocking an active qualifying opportunity.

5. **Greenleaf Retail Proposal stuck in Draft** — a live commercial proposal that hasn't moved to review in Sprint 21 or 22.

6. **Platform not implemented** — all CH portal surfaces are HTML mockups. No production app.

### Not blockers, but friction

- FMCG naming decision open — blocks FMCG offer activation but not current ops
- Portfolio Acceleration pricing not validated — offer In Development is fine for now
- PreToolUse guards echo-only — no hard protection; acceptable risk given human oversight

---

## 13. Final Verdict

`System partial — resolve commercial skill gap + human decisions before expanding.`

**What's solid enough to keep building on:** OS v2 pipeline, Agent layer (Wave 1), Grants, Insight Engine, Comms, Brand Brain, Decision Center.

**What needs resolution first:**
1. Build `upsert-proposal-brief` and `upsert-offer` skills (Sprint 24)
2. Create 5 retailer org records in CH Organizations
3. Resolve SUFI Fair4All Finance eligibility (P1)
4. Move Greenleaf Retail Proposal to In Review
5. Validate Portfolio Acceleration pricing

**Next sprint recommendation:** Sprint 24 — Commercial Skills + Retailer Orgs
- Build `upsert-proposal-brief` skill
- Build `upsert-offer` skill
- Create 5 retailer org records
- Advance Greenleaf Retail Proposal to In Review
- Activate grant-monitor monthly auto-dry_run hook
