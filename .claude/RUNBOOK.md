# Common House OS v2 — Weekly Operations Runbook
Last updated: 2026-04-13 (Sprint A — agents audit: review-queue auto-trigger, 3 new monthly scheduled tasks, source-intake non-Gmail triggers)

## Overview
15 agents total: 4 weekly auto (briefing, hygiene, portfolio-health, living-room) + 3 monthly auto (grant-monitor, briefing-full, deal-flow) + 7 pipeline sub-agents (called by os-runner) + 1 on-demand (review-queue, auto-triggered by os-runner when P1 signals found). Execute always requires human gate.

## Monday Morning Cadence (weekly)

### ~08:08 — briefing-agent (AUTO — dry_run)
*(Scheduled at 08:00; system applies ~8 min deterministic delay)*
**What runs:** control-room-summarizer + optional proposal-packager
**Where to look:** [agent output in Claude Code terminal / scheduled task output]
**What to review:** P1 signals table, pipeline stalls, project blockers, any Critical or At Risk items
**When to escalate:** If p1_count > 0 → read full output before proceeding to other agents
**Execute gate:** NEVER — briefing-agent is permanently read-only
**Action required:** None unless P1 signals found. Log findings in relevant Notion pages.

### ~08:23 — hygiene-agent (AUTO — dry_run)
*(Scheduled at 08:15; system applies ~8 min deterministic delay)*
**What runs:** automation-health-review + resolve-entities
**Where to look:** Terminal output
**What to review:** Automation health flags (Critical/At Risk), entity duplicate candidates
**When to escalate to execute:** If automation flags set Human Override Needed → confirm list, then run execute
**Execute invocation:**
```
hygiene-agent:
  mode: execute
  execute_gate: confirmed
```
**Max writes in execute:** Human Override Needed flags on automations + provenance marks on duplicate candidates
**Action required:** Review automation flags. For duplicate orgs — verify manually before allowing merge.

### ~08:31 — portfolio-health-agent (AUTO — dry_run)
*(Scheduled at 08:30; system applies ~1 min deterministic delay)*
**What runs:** review-relationship-health + startup-opportunity-scout
**Where to look:** Terminal output
**What to review:** Hot/Warm contacts overdue for catch-up, startups with zero open opportunities
**When to escalate to execute:** If catch-up flags or opportunity gaps found → review list, confirm, then execute
**Execute invocation:**
```
portfolio-health-agent:
  mode: execute
  execute_gate: confirmed
```
**Max writes in execute:** Catch-up sugerido flags on people + New opportunities for gap startups
**Action required:** Review catch-up queue. Review proposed opportunities — confirm org resolution before execute.

### ~08:49 — living-room-agent (AUTO — dry_run · permanently read-only)
*(Scheduled at 08:45; system applies ~4 min jitter)*
**What runs:** `/living-room-curator` across 5 OS v2 DBs filtered by Living Room fields
**Where to look:** Terminal output / Claude Code agent output
**What to review:** Module readiness table (A / C / D / E / F / G), privacy gate omissions, curator action suggestions
**Execute gate:** NEVER — living-room-agent has no execute mode; it is permanently read-only
**Action required:** Review flagged items in `living-room-admin.html` → adjust Visibility / Share to Living Room / Community Relevant settings as needed
**Preview:** `localhost:5500/living-room.html`

**Module status definitions:**
- ✅ Ready — 3+ items available
- ⚠ Low — 1–2 items (still renders but thin)
- ❌ Empty — 0 items (module would be blank)

**Invocation (on-demand):**
```
living-room-agent:
  mode: dry_run
  modules:
    featured_members: true
    milestones: true
    themes: true
    signals: true
    geography: true
    expertise: true
  limits:
    members: 6
    milestones: 5
    themes: 6
    signals: 4
```

---

## Monthly Cadence (1st Monday of month)

1st Monday order: `ch-grant-monitor-monthly` (07:00) → `ch-briefing-agent-monthly-full` (07:30) → `ch-agent-scorecard-monthly` (07:45) → `ch-briefing-agent-weekly` (08:00) → `ch-deal-flow-monthly` (08:00)

### ~07:00 — grant-monitor-agent (AUTO — dry_run)
*(Scheduled via `ch-grant-monitor-monthly`; also triggered by os-runner when agreement-type sources are ingested)*
**What runs:** grant-fit-scanner across all active agreements + CH projects + portfolio startups
**Where to look:** Terminal output / scheduled task output
**What to review:** Grants expiring < 30 days (P1), coverage gaps, renewal overdue
**When to escalate to execute:** If p1_count > 0 OR grant gaps found
**Execute gate:** Always dry_run in automated runs. Requires explicit human confirmation.
**Execute invocation:**
```
grant-monitor-agent:
  mode: execute
  execute_gate: confirmed
  grant_scan:
    candidates: both
```

### ~07:30 — briefing-agent full scan (AUTO — dry_run)
*(Scheduled via `ch-briefing-agent-monthly-full` — 1st Monday only; replaces the quick scan for that Monday)*
**What runs:** control-room-summarizer (all surfaces) + portfolio-vc-eyes-report + Financial Snapshot detection
**Where to look:** Terminal output
**What to review:** Full engagement/automation/agreement health + VC investor readiness ranking + investor update signals
**Execute gate:** NEVER — permanently read-only
**Note:** This replaces the weekly quick scan on the 1st Monday. Both scheduled tasks run; full scan runs first (07:30), weekly at 08:00.

### ~08:00 — deal-flow-agent (AUTO — dry_run)
*(Scheduled via `ch-deal-flow-monthly`)*
**What runs:** investor-matchmaker across full portfolio
**Where to look:** Terminal output
**What to review:** Strong matches (score ≥ 60) — verify each pair makes sense before any execute
**MANDATORY gate:** Review every strong match pair before execute. No borderline matches ever auto-created.
**Execute invocation (only after reviewing dry_run output):**
```
deal-flow-agent:
  mode: execute
  execute_gate: confirmed
  matching:
    min_match_score: 40
    strong_match_threshold: 60
    skip_existing_opportunities: true
```

---

## Escalation Rules

| Signal | Action |
|--------|--------|
| Any agent returns status: blocked | Check Notion connection, retry once, escalate to infra if persists |
| BLOCKED-SCHEMA-DRIFT | Schema has drifted — DO NOT run execute until resolved. Check Automations [OS v2] field list. |
| p1_count > 0 on briefing-agent | Review output fully before running other agents |
| Consecutive Failures ≥ 3 on any agent | Pause scheduled hook, investigate, fix before re-enabling |
| Health = Degraded on any automation record | Human must investigate — never auto-fix |
| deal-flow strong match with Funder missing sector data | Flag funder record for enrichment; do not create Investor Match |

---

## Decision Center Integration

All items requiring human judgement from agent runs flow into **Decision Items [OS v2]**.
Full guide: `.claude/DECISION-CENTER.md`

### When to open Decision Center after an agent run

| Agent output signal | Action |
|---|---|
| `decision_items_proposed: N > 0` | Open 🚨 High Risk / P1 and work queue before next run |
| `p1_count > 0` | Resolve P1 items before running any other agent |
| `escalation_count > 0` | Check ⏳ Pending Execute — may be blocked |
| Agent output mentions ambiguity | Create Ambiguity Resolution item manually |
| Funder missing sector data | Create Missing Input item for Co Capital or equivalent |

### Decision Center daily habit (2 min)
1. 🚨 High Risk / P1 — resolve or escalate
2. ⏳ Pending Execute — unblock if approved
3. 📥 Needs Input — fill in what you know

### Execute gate rule
Before running any agent in execute mode: verify no open Pending Execute items exist for that agent. If Execute Approved = false → do not run execute.

---

## Where to Find Things

| Item | Location |
|------|----------|
| Agent output | Claude Code terminal (agent run output) |
| **Decision Center** | **Decision Items [OS v2] — Notion** |
| Automations [OS v2] | Notion — Agent Management views |
| Opportunity pipeline | Opportunities [OS v2] DB |
| Relationship health | CH People [OS v2] — Confianza + Last Activity |
| Grant agreements | Agreements & Obligations [OS v2] |
| Financial snapshots | Financial Snapshots [OS v2] |

---

## Adding a New Agent

1. Create skill files in `.claude/skills/`
2. Create agent file in `.claude/agents/`
3. Add agent record to Automations [OS v2]
4. Register in SKILL-REGISTRY.md
5. Add to this runbook
6. Schedule hook (dry_run only — execute always manual)
7. Add agent name to `Source Agent` select options in Decision Items [OS v2]

---

## Proposal System + Offer System

Full guide: `.claude/PROPOSAL-SYSTEM.md` and `.claude/OFFER-SYSTEM.md`

The Proposal System converts sales conversations into structured proposal briefs. The Offer System captures reusable, productised offers that can be sold again and again.

| Database | DB ID | Purpose |
|----------|-------|---------|
| Proposal Briefs [OS v2] | `76bfd50f-a991-4361-9b9b-51de4b8eae67` | Client-specific proposal scopes |
| Offers [OS v2] | `58b863e9-c789-465b-82eb-244674bc394f` | Reusable offer library |

### Quick proposal workflow
1. Sales meeting / inbound → identify Buyer Problem + budget signal
2. Check Offers [OS v2] → ✅ Active Offers — does a reusable offer cover this?
3. If yes: copy Modules + Pricing Logic + Why CH from Offer → create Proposal Brief, customise for client
4. If no: create Proposal Brief from scratch (Type, Budget Range, Scope, Phases, Deliverables, Assumptions, Exclusions)
5. Set Design Asset Requested → create Content Pipeline item (Content Type = Proposal Deck, Status = Briefed)
6. Link Related Opportunity → advance Opportunity stage

### Quick offer workflow
1. After winning / delivering an engagement → identify reusable pattern
2. Create Offer → fill Core Problem Solved, ICP, Modules, Pricing Logic, Proof Points, Opportunity Cues
3. Set Offer Status = In Development → Active once delivery evidence exists
4. Named Opportunity Cues → create Opportunity records in pipeline
5. Design Assets Needed → create Content Pipeline item (Content Type = Sales Deck)

### Weekly commercial habit
- 📝 New / Drafting — finish open proposal briefs before they go cold

---

## On-Demand — Investor Update Cycle

Full 3-step sequence for generating and sending a branded investor update.

### Step 1 — Generate
```
generate-investor-update:
  startup: [startup name]
  period: [e.g. "Q1 2026"]
  audience: [investors | board | advisors]
  tone: [formal | direct | narrative]
  output_format: [pptx | docx | text]
  save_to_content_pipeline: true
```
Output: structured investor update with financials, milestones, pipeline, asks. Brand wiring reads Style Profile for startup → produces formatted pptx/docx. Saves to Content Pipeline with Status = In Review.

### Step 2 — Approve
1. Open Content Pipeline [OS v2] → find the generated record (Status = In Review)
2. Review the full update — edit if needed
3. Set Status = Approved (human write — never auto)

### Step 3 — Send
```
send-investor-update:
  content_pipeline_id: [page ID of the Approved record]
  dry_run: true    # always dry_run first
```
Review dry_run output (recipient list + message text). Then:
```
send-investor-update:
  content_pipeline_id: [page ID]
  dry_run: false
  execute_gate: confirmed
```
The skill triple-checks: dry_run flag, Status = Approved, and recipient confirmation before any send.

---

## On-Demand — Agent Scorecard (Monthly)

Run on the 1st Monday of each month before the briefing-agent run to monitor AI spend and agent health.

```
agent-scorecard:
  time_window_days: 30
  show_cost_breakdown: true
  budget_threshold_usd: 150
```

**What to review:** Agents projected to exceed budget (amber/red), degraded health scores, any agent with no recent run history (may have silently stopped).

**Automated:** Runs via `ch-agent-scorecard-monthly` scheduled task (1st Monday, 07:45 — before briefing-agent).

---

## On-Demand — Garage Layer (Startup Documents)

When a new startup document arrives (pitch deck, financial model, cap table):

```
ingest-garage-docs:
  mode: dry_run
  project_name: [startup name, e.g. "SUFI"]
  files:
    - path: [absolute path to file]
      type: [pitch_deck | financial_model | cap_table | one_pager | legal]
```

Review dry_run output → confirm which fields will be created/updated → then run with `mode: execute`.

This single skill orchestrates: Financial Snapshots, Cap Table, Valuation, Data Room, and Org Profile updates. After ingestion, run `portfolio-vc-eyes-report` to see updated investor-readiness scores.

---

## On-Demand — Personal Content + Delegation

### Draft LinkedIn post
```
linkedin-post-agent:
  topic_hint: [optional — e.g. "UK circular economy policy shift"]
  source_hint: [optional — Insight Brief title or Fireflies meeting ID]
```
Draft appears in Agent Drafts [OS v2] (Status = Pending Review). Review in Hall Agent Queue.

### Delegate a task
```
delegate-to-desk:
  task: [clear task description]
  assignee_name: [optional — name from CH People]
  due_date: [optional — ISO date]
  context: [optional — project or opportunity name]
```
Draft appears in Agent Drafts [OS v2]. Review in Hall before any message is sent.

---

## On-Demand — Source Intake (Non-Gmail)

The automated os-runner only ingests Gmail threads. Use these manual flows for other source types.

### Meeting transcripts (Fireflies)
After any significant meeting captured in Fireflies:
```
source-intake:
  mode: execute
  source_type: meeting_transcript
  fireflies_meeting_id: [ID from Fireflies]
  project_scope: [project name — e.g. "Auto Mercado"]
```
Then run the full os-runner pipeline from Step 2 onward:
```
os-runner:
  skip_intake: true
  source_ids: [source record ID returned by source-intake]
```

### Startup documents (Garage)
Startup documents (pitch deck, financial model, cap table) use `ingest-garage-docs` directly — they bypass source-intake and populate the Garage profile in Notion. After ingestion, create a CH Source record manually or via:
```
source-intake:
  mode: execute
  source_type: document
  document_path: [absolute path]
  project_scope: [startup name]
  notes: [filename + date received]
```
This creates a Source record for audit trail without re-extracting evidence (evidence was already created by ingest-garage-docs).

### Trigger signals for non-Gmail intake
| Signal | Action |
|---|---|
| Meeting with portfolio startup / funder / retailer | Run Fireflies intake within 24h |
| Startup sends pitch deck or updated financials | Run `ingest-garage-docs` first, then optionally create Source record |
| Policy document / report received | Save file locally → `source-intake` with `source_type: document` |
| Contract or agreement email not in Gmail | Forward to connected Gmail account OR paste text into `grant-monitor-agent` with `extract_mode.enabled: true` |
- 👀 Needs Review — approve or give feedback on briefs in review
- ✅ Active Offers — ensure proof points and opportunity cues are up to date
- 🔗 Opportunity-Linked Offers — are opportunity cues actioned in the pipeline?
- 🏢 Retailer org records — Co-op, Waitrose, Tesco, Sainsbury's, Morrisons must exist in CH Organizations with Account links to Retail Refill opportunities
- 🎯 Opportunity Qualification — open 🎯 Needs Qualification view: are open Decision Items resolved? Have Needs Review opportunities been upgraded or closed?

### Escalation rule
Any Proposal Brief with Pricing Logic that is genuinely novel → create Decision Item (Type: Policy Decision) before quoting client.

### Skill boundary note (Sprint 23)
**No `upsert-proposal-brief` or `upsert-offer` skill exists yet.** All Proposal Brief and Offer record creation/updates are manual in Notion. Do not attempt to create these records via agents until those skills are built (Sprint 24).

### Opportunity Standard (Sprint 24)
All Opportunities must pass the qualification standard before entering the pipeline. Full spec: `.claude/OPPORTUNITY-STANDARD.md`.

**Minimum to create an Opportunity:**
- Named entity (org record in CH Organizations)
- Trigger / Why Now (specific, dated signal — not a permanent truth)
- Buyer Probable (named contact or confirmed access path)

**Score thresholds:** ≥70 = Qualified | 50–69 = Needs Review | <50 = Below Threshold / do not create

**New views in Opportunities [OS v2]:**
- 🎯 Needs Qualification — Qualification Status = Needs Review
- 🔴 Below Threshold — Qualification Status = Below Threshold
- 📊 By Qualification Status — board grouped by qualification
- 📋 Not Scored — legacy records without a score

**Retailer opportunities status (Sprint 24):**
- Co-op (59) + Waitrose (53): Needs Review — Decision Items open — add buyer contact to qualify
- Tesco (43) + Sainsbury's (42) + Morrisons (38): Below Threshold — Decision Items open recommending Closed Lost / Deprioritized

---

## Grants System

Full guide: `.claude/GRANTS-SYSTEM.md`

The Grants System tracks grant funders, pipeline, and active agreements using existing OS v2 databases — no new DB needed.

| Database | DB ID | Purpose |
|----------|-------|---------|
| CH Organizations [OS v2] | `bef1bb86-ab2b-4cd2-80b6-b33f9034b96c` | Funders (Category = Funder) |
| Opportunities [OS v2] | `687caa98-594a-41b5-95c9-960c141be0c0` | Grant pipeline (Type = Grant) |
| Agreements & Obligations [OS v2] | `c48ca387-ab09-4bae-9134-604915ff39f7` | Active grant agreements |

### Quick grant workflow
1. Identify funder signal (Insight Brief Grant Angles, grant-monitor-agent, external)
2. Create/update funder in CH Organizations → Category = Funder
3. Open Opportunities → New → Opportunity Type = Grant → set Priority, Why There Is Fit, Suggested Next Step
4. Route eligibility gaps to Decision Center (Missing Input / Ambiguity Resolution)
5. When confirmed eligible → Status = Qualifying → begin application
6. On award → create Grant Agreement record in Agreements & Obligations

### Grant cadence habit
- 💰 Grant Opportunities — review priorities, update statuses
- ⚡ Qualifying Grants — unblock open Decision Items
- ❓ Grant Missing Input — resolve eligibility checks
- 📋 Grant Agreements — check End Dates and Obligation Due Dates

### Escalation
Fair4All Finance window open → Urgent Decision Item. Innovate UK round < 8 weeks → move to Qualifying. Grant Agreement End Date < 30 days → P1 — Critical.

---

## Comms System

Full guide: `.claude/COMMS-SYSTEM.md`

The Comms System converts Insight Briefs, project signals, and portfolio news into channel-specific, voice-specific content tracked from signal to published output.

**Three-layer model:** Voice (who) + Platform (where) + Format (shape). All three required. Never mix.

| Database | DB ID | DS ID | Purpose |
|----------|-------|-------|---------|
| Style Profiles [OS v2] | `606b1aafe63849a1a81ac6199683dc14` | `3119b5c0-3b8b-4c17-bde0-2772fc9ba4a6` | Voice Profiles + Channel Profiles |
| Content Pipeline [OS v2] | `3bf5cf81f45c4db2840590f3878bfdc0` | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` | Signal → Published tracking |

### Quick content production flow
1. Find signal in Insight Briefs → Comms Angles or identify project/portfolio news
2. Open Content Pipeline → New item → set Platform, Voice/Speaker, Content Type
3. Link Related Style Profile (voice guide) + check Channel Profile for format rules
4. Draft with Claude using Voice Profile Master Prompt + Channel Profile restrictions
5. Paste draft into Draft Text field → Status = Review
6. Human reviews → sets Feedback Status → promotes to Approved → Ready to Publish

### Weekly editorial habit (Content Pipeline)
- 📅 Comms Queue — active items, check publish windows
- 👀 Needs Review — approve or give feedback on drafts
- ✍️ Draft Review Queue (Decision Center) — resolve open editorial items

### Escalation rule
After 3+ items with Wrong tone / Too generic / Rejected on the same Style Profile → create Decision Item (Type: Draft Review, Priority: Normal).

---

## Insight Engine

Full guide: `.claude/INSIGHT-ENGINE.md`

The Insight Engine converts reports, policy documents, and sector research into structured insight briefs that feed the Design System, Knowledge Assets, Content Pipeline, Decision Center, and Opportunities.

| Database | DB ID | DS ID | Purpose |
|----------|-------|-------|---------|
| Insight Briefs [OS v2] | `04bed3a3-fd1a-4b3a-9964-3cd21562e08a` | `839cafc7-d52d-442f-a784-197a5ea34810` | Structured analysis: Executive Summary, Key Facts, Key Insights, Grant/Comms/Opportunity Angles |

### Quick insight brief flow
1. Read a valuable report or policy document
2. Create Insight Brief → fill Executive Summary, Key Facts, Key Insights, Implications, Angles
3. Set routing flags (Routed to Content Pipeline / Knowledge / Decision Center)
4. Create routing targets (Content Pipeline items, Knowledge Assets, Decision Items)
5. Set Status = Routed

### Weekly review habit (Insight Briefs)
- 📥 New / To Review — briefs not yet analysed
- 📣 Routed to Comms — ensure Content Pipeline items created
- 🏛️ Routed to Grants — ensure grant opportunities actioned

---

## Design System (Brand Brain)

Full guide: `.claude/BRAND-BRAIN.md`

The Design System is the canonical source for voice, style, and content production. Three databases:

| Database | DB ID | DS ID | Purpose |
|----------|-------|-------|---------|
| Style Profiles [OS v2] | `606b1aafe63849a1a81ac6199683dc14` | `3119b5c0-3b8b-4c17-bde0-2772fc9ba4a6` | Voice/style rules + Master Prompts |
| Reference Assets [OS v2] | `264f5e5e179c4449ba12a44fad9491f4` | `fc498f7b-9f90-40ef-9e74-2a7077ce1cb0` | Annotated good examples |
| Content Pipeline [OS v2] | `3bf5cf81f45c4db2840590f3878bfdc0` | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` | Content requests: Brief → Approved |

### Quick content production
1. Open Style Profiles → find profile for entity + channel
2. Copy Master Prompt from page body → fill [SPECIFY] placeholders
3. Check Reference Assets for structural patterns
4. Draft with Claude
5. Log in Content Pipeline → Status = Review
6. Human reviews → sets Feedback Status → promotes to Approved

### Feedback loop
Feedback Status in Content Pipeline feeds back to Style Profile improvement. After 5+ rejections on a profile, create a Decision Item (Type: Draft Review) in Decision Center.

### Content Pipeline review habit (weekly)
- 👀 Needs Review — approve or give feedback on pending drafts
- 📅 Calendar — check upcoming due dates

---

## Living Room (Sprint 28)

Full spec: `.claude/LIVING-ROOM.md`
Admin UI: `living-room-admin.html` (localhost:5500/living-room-admin.html)
Preview: `living-room.html` (localhost:5500/living-room.html)

The Living Room is the community layer of Common House. It surfaces member profiles, shareable milestones, themes in motion, community signals, and geographic/expertise views — all curated and privacy-gated.

### New Notion fields (Sprint 28)

| DB | DS ID | Fields added |
|---|---|---|
| CH People [OS v2] | `6f4197dd-3597-4b00-a711-86d6fcf819ad` | `Visibility` (public-safe / community / private) |
| CH Projects [OS v2] | `5ef16ab9-e762-4548-b6c9-f386da4f6b29` | `Share to Living Room` (checkbox), `Milestone Type` (select), `Community Theme` (text), `Living Room Visibility` (select) |
| Knowledge Assets [OS v2] | `e7d711a5-f441-4cc8-96c1-bd33151c09b8` | `Living Room Theme` (checkbox) |
| Content Pipeline [OS v2] | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` | `Share to Living Room` (checkbox) |
| Insight Briefs [OS v2] | `839cafc7-d52d-442f-a784-197a5ea34810` | `Community Relevant` (checkbox), `Visibility` (select) |

### Curation workflow

1. **People** — open `living-room-admin.html` → People Visibility tab → set each person's Visibility flag
2. **Milestones** — Milestones tab → toggle `Share to Living Room`, set Milestone Type and Visibility per project
3. **Signals** — Community Signals tab → toggle `Community Relevant` and set Visibility per Insight Brief
4. **Themes** — Themes in Motion tab → activate / deactivate Knowledge Asset themes

### Weekly Living Room habit (Monday ~08:49 — AUTO)
- living-room-agent runs automatically at 08:45 Monday
- Review output: Module Readiness table — flag any ❌ Empty or ⚠ Low modules
- Open `living-room-admin.html` and act on Curator Actions Suggested
- living-room-agent is permanently read-only — no execute mode

### Scheduled hook
- Agent: living-room-agent
- Schedule: Monday 08:45 UTC-6, weekly (hook ID: ch-living-room-agent-weekly)
- Mode: always dry_run — no execute ever
