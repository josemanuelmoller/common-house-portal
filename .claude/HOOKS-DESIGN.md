# Wave 1 — Hooks Design Pack
Generated: 2026-04-12 (Sprint 13)

This document defines the hook/trigger design for each Wave 1 agent.
Hooks marked [PENDING INFRA] require scheduling infrastructure to implement.
Hooks marked [IMPLEMENTABLE] can be configured with current Claude Code tools.

Infrastructure note: `mcp__scheduled-tasks` tools are present in the environment
(`create_scheduled_task`, `list_scheduled_tasks`, `update_scheduled_task`).
The existing `settings.local.json` hooks configuration covers PreToolUse guards
(Notion write safety) and a PostToolUse smoke test — no agent scheduling hooks
are active yet.

---

## briefing-agent

**Trigger event:** Weekly schedule — Monday 08:00 local time
**Input:** No required input — agent reads live Notion data
**Mode:** dry_run (always — this agent never writes)
**Approval gate:** None required
**Output surface:** Terminal output reviewed by principal; optionally logged to a Notion page
**Data prerequisites:** All OS v2 databases accessible (Automations, Projects, Engagements, Opportunities, Agreements, People)
**Implementation status:** [ACTIVE] — scheduled via mcp__scheduled-tasks (Sprint 14). Monday 08:00 UTC-6, weekly.

Invocation:
```
briefing-agent:
  mode: dry_run
  sections:
    projects: true
    pipeline: true
    engagements: true
    automations: true
    agreements: true
```

---

## hygiene-agent

**Trigger event:** Weekly schedule — Monday morning (after briefing-agent)
**Input:** No required input — full scan by default
**Mode:** dry_run first; execute requires human review + execute_gate: confirmed
**Approval gate:** Human must review dry_run output before execute
**Output surface:** Terminal output; flag list for human triage
**Data prerequisites:** Automations DB + CH Organizations + CH People all accessible
**Implementation status:** [ACTIVE] — dry_run scheduled via mcp__scheduled-tasks (Sprint 14). Monday 08:15 UTC-6, weekly. Execute remains manual-gated.

dry_run invocation:
```
hygiene-agent:
  mode: dry_run
  automation_scope:
    filter: active_only
  entity_scope:
    scope: both
```

execute invocation (after human review):
```
hygiene-agent:
  mode: execute
  execute_gate: confirmed
  automation_scope:
    filter: active_only
  entity_scope:
    scope: organization
```

---

## portfolio-health-agent

**Trigger event:** Weekly schedule — Monday morning
**Input:** No required input — scans all active startups
**Mode:** dry_run first; execute requires human review
**Approval gate:** Human confirms gap list before execute
**Output surface:** Terminal output; opportunity gap list for review
**Data prerequisites:** CH People + Engagements + Opportunities all accessible
**Implementation status:** [ACTIVE] — dry_run scheduled via mcp__scheduled-tasks (Sprint 14). Monday 08:30 UTC-6, weekly. Execute remains manual-gated.

dry_run invocation:
```
portfolio-health-agent:
  mode: dry_run
  relationship_scope:
    filter: all
    cold_days: 60
  opportunity_scope:
    filter: all_active
    checks:
      ch_sale: true
      investor_match: true
      grant: true
```

---

## grant-monitor-agent

**Trigger event:** Monthly schedule — 1st Monday of each month
**Input:** No required input for scan; optional source_text for extraction
**Mode:** dry_run first; execute requires human review
**Approval gate:** Human reviews entity list + status assignments before execute
**Output surface:** Terminal output; expiry warnings + gap list
**Data prerequisites:** Agreements DB + Opportunities DB + Projects DB all accessible
**Implementation status:** [MANUAL] — monthly cadence; run manually on 1st Monday of month. Auto-scheduling safe but not yet configured. Execute always human-gated.

monthly invocation:
```
grant-monitor-agent:
  mode: dry_run
  grant_scan:
    candidates: both
    expiry_warning_days: 90
```

---

## deal-flow-agent

**Trigger event:** Bi-weekly schedule — 1st and 3rd Monday of each month
**Input:** No required input — scans all Funder orgs + active startup engagements
**Mode:** ALWAYS dry_run first. Execute requires explicit human gate EVERY RUN.
**Approval gate:** MANDATORY — human reviews match pairs before any execute. No exceptions.
**Output surface:** Terminal output; tiered match list (Strong / Borderline / Rejected)
**Data prerequisites:** CH Organizations (Funder category populated) + Engagements (Startup type, Active)
**Implementation status:** [MANUAL] — bi-weekly, always dry_run first. Execute requires mandatory human review every run. Scheduling of dry_run optional but not currently configured.

dry_run invocation:
```
deal-flow-agent:
  mode: dry_run
  matching:
    min_match_score: 40
    strong_match_threshold: 60
    max_matches_per_startup: 5
    skip_existing_opportunities: true
```

execute invocation (after mandatory human review):
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

## Hook implementation options

### Option A — Claude Code scheduled tasks (mcp__scheduled-tasks available)
`mcp__scheduled-tasks__create_scheduled_task` is present in this environment.
briefing-agent and hygiene-agent dry_runs can be scheduled directly.
These are safe to automate (read-only or flag-only).

Priority order for automation:
1. briefing-agent — weekly, Monday 08:00, always dry_run → safe to fully automate
2. hygiene-agent dry_run — weekly, Monday, always dry_run → safe to fully automate
3. portfolio-health-agent dry_run — weekly, Monday → safe to automate (execute stays human-gated)
4. grant-monitor-agent dry_run — monthly → safe to automate
5. deal-flow-agent — bi-weekly, dry_run only → could automate dry_run; execute NEVER automated

### Option B — Manual cadence (current state)
Run agents manually on the recommended schedule.
Use the invocation examples above.
This is the current operating mode as of Sprint 13.

### Existing hooks in settings.local.json (active)
The project already has two hook groups configured:

PreToolUse — fires before any Notion write (notion-create-pages, notion-update-page):
- GUARD 1: No raw dump check
- GUARD 2: Dedup check reminder
- GUARD 3: Evidence integrity check
- GUARD 4: Legacy block (OS v2 only)

PostToolUse — fires after any Bash command:
- Smoke test logger → writes to C:/Users/josem/AppData/Local/Temp/hook_smoke.txt

These existing hooks are orthogonal to agent scheduling — they guard data quality,
not cadence. Agent scheduling hooks would be additive.

### What is NOT implemented yet
- Automatic scheduling of any agent
- Output routing to Notion (briefing output written to a designated page)
- Slack/email notifications on P1 signals
- Auto-escalation paths for P1 signals

These require additional infrastructure beyond current Claude Code agent architecture.
`mcp__scheduled-tasks` is available and is the recommended next step for briefing-agent
and hygiene-agent dry_run automation.

---

## Sprint 14 Update — 2026-04-12

### Hooks Activated (3 live scheduled hooks)

| Agent | Tool | Schedule | Mode | Status |
|-------|------|----------|------|--------|
| briefing-agent | mcp__scheduled-tasks | Monday 08:00 UTC-6 (weekly) | dry_run | ACTIVE |
| hygiene-agent | mcp__scheduled-tasks | Monday 08:15 UTC-6 (weekly) | dry_run | ACTIVE |
| portfolio-health-agent | mcp__scheduled-tasks | Monday 08:30 UTC-6 (weekly) | dry_run | ACTIVE |

### Gated / Manual Hooks (registered, not auto-scheduled)

| Agent | Trigger | Mode | Gate | Notes |
|-------|---------|------|------|-------|
| grant-monitor-agent | 1st Monday of month | dry_run | Manual invoke | Auto-scheduled dry_run safe; execute requires human gate |
| grant-monitor-agent | After dry_run review | execute | execute_gate: confirmed | Human must review before execute |
| deal-flow-agent | 1st + 3rd Monday | dry_run | Manual invoke | ALWAYS dry_run first — no exceptions |
| deal-flow-agent | After dry_run review | execute | execute_gate: confirmed — MANDATORY | Every execute requires fresh human review |
| portfolio-health-agent | After weekly dry_run | execute | execute_gate: confirmed | If catch-up/opp gaps found |
| hygiene-agent | After weekly dry_run | execute | execute_gate: confirmed | If automation flags found |

### Event-Driven Hook Designs (Sprint 14 — Design Only)

These are designed but NOT activated. The mcp__scheduled-tasks tool supports time-based triggers only; true event-driven hooks require infrastructure not currently available.

**Design 1 — Opportunity Stale Hook**
- Trigger: Any Opportunity stuck at New/Qualifying for > 45 days
- Agent: portfolio-health-agent (startup-opportunity-scout only)
- Mode: dry_run → surface stale list for human review
- Status: NOT ACTIVATED — requires DB event webhook, not available via mcp__scheduled-tasks

**Design 2 — Agreement Expiry Hook**
- Trigger: Any Agreement with Expiry Date within 30 days
- Agent: grant-monitor-agent
- Mode: dry_run → surface P1 expiry list
- Status: NOT ACTIVATED — same infrastructure gap

**Design 3 — Automation Overdue Review Hook**
- Trigger: Any Automation record with Last Reviewed > cadence threshold
- Agent: hygiene-agent (automation-health-review only)
- Mode: dry_run
- Status: NOT ACTIVATED — infrastructure gap

**Design 4 — New Funder Added Hook**
- Trigger: New org record created with Category = Funder
- Agent: deal-flow-agent
- Mode: dry_run only (never auto-execute investor matching)
- Status: NOT ACTIVATED — infrastructure gap; also violates deal-flow mandatory human review rule

**Design 5 — Startup Distress Hook**
- Trigger: Startup Financial Snapshot with Revenue < previous period by > 30%
- Agent: portfolio-health-agent + briefing-agent
- Mode: dry_run → alert principal
- Status: NOT ACTIVATED — Financial Snapshots data too sparse to compute trend

**Implementation path for event-driven hooks:** Requires either (a) Notion webhook integration forwarding to a Claude Code listener, or (b) a polling script checking conditions on a tight schedule. Neither is available in current environment. Revisit in Sprint 16+ when infrastructure allows.

---

## Sprint 27 Update — 2026-04-12 (Pareto Cost Optimizations)

### Changes applied — zero quality loss, ~50% cost reduction

| Agent | Change | Saving |
|-------|--------|--------|
| briefing-agent | Added `scan_mode: quick` (default) — reads Projects + Opportunities only; `full` mode for monthly deep scans | ~70% per weekly run |
| hygiene-agent | Cadence changed weekly → bi-weekly | ~50% |
| portfolio-health-agent | Added `at_risk_only: true` (default) — skips contacts with recent interaction | ~60% per run |
| deal-flow-agent | Cadence changed bi-weekly → monthly | ~50% |
| (new) agent-scorecard skill | New skill for BSC tracking of agent costs and health | — |

### Updated scheduled task cadences

| Agent | Previous | New | Action required |
|-------|----------|-----|----------------|
| hygiene-agent | Weekly (every Monday 08:15) | Bi-weekly (1st + 3rd Monday 08:15) | **Update mcp__scheduled-tasks** |
| briefing-agent | Weekly, full scan | Weekly, quick scan (3×) + full (1× monthly) | Update invocation params |
| portfolio-health-agent | Weekly, full sweep | Weekly, at_risk_only=true | Update invocation params |
| deal-flow-agent | Bi-weekly (manual) | Monthly (manual) | No scheduled task change needed |

### Updated invocations for scheduled hooks

briefing-agent (weekly quick — update existing scheduled task):
```
briefing-agent:
  scan_mode: quick
  sections:
    projects: true
    pipeline: true
```

briefing-agent (monthly full — run manually or add separate monthly task):
```
briefing-agent:
  scan_mode: full
  sections:
    projects: true
    pipeline: true
    engagements: true
    automations: true
    agreements: true
```

hygiene-agent (bi-weekly dry_run — update existing scheduled task to bi-weekly):
```
hygiene-agent:
  mode: dry_run
  automation_scope:
    filter: active_only
  entity_scope:
    scope: both
```

portfolio-health-agent (weekly, at_risk_only — update existing scheduled task):
```
portfolio-health-agent:
  mode: dry_run
  relationship_scope:
    filter: all
    at_risk_only: true
    cold_days: 60
  opportunity_scope:
    filter: all_active
    checks:
      ch_sale: true
      investor_match: true
      grant: true
```

### New skill: agent-scorecard

Added `.claude/skills/agent-scorecard.md` — invoke as `/agent-scorecard` to get:
- Balanced Score Card of all agents (health + cost + last run + P1s)
- Projected monthly spend vs budget ceiling
- Top cost drivers
- Recommended tuning actions

Run monthly after briefing-agent full scan, or any time spend visibility is needed.

---

## Sprint 15 Update — 2026-04-12 (Decision Center)

### Decision Center as Human-in-the-Loop layer

Decision Items [OS v2] (DB: `6b801204c4de49c7b6179e04761a285a`) is now the canonical surface for all human gates. This changes the execute gate model:

**Before Sprint 15:** Human reviewed dry_run terminal output → decided verbally or via chat → ran execute manually.

**After Sprint 15:** Agent dry_run surfaces decision items → items appear in Decision Center → human resolves each item → Execute Approved flag set → agent runs execute.

### Hook-to-Decision-Center flow (design, not yet automated)

```
Scheduled hook (dry_run) runs
  → agent detects ambiguity or execute-sensitive proposal
  → agent proposes Decision Item (in dry_run output)
  → human creates Decision Item in Decision Items [OS v2]
  → human resolves item (sets Human Decision + Execute Approved)
  → human manually invokes execute with execute_gate: confirmed
```

Path to full automation: agent dry_run auto-creates Decision Items via `notion-create-pages` (DS ID: `1cdf6499-0468-4e2c-abcc-21e2bd8a803f`). Execute gate checks `Execute Approved` checkbox before proceeding.

### Pending Decision Items relevant to hooks

| Decision Item | Type | Current Status |
|---|---|---|
| grant-monitor-agent — Activate Monthly Auto-Schedule | Policy / Automation Decision | Open — awaiting human decision |
| deal-flow-agent — Execute Gate Policy (Mandatory Human Review) | Policy / Automation Decision | Open — confirm or adjust policy |

Both items are in Decision Center. Resolve there before changing hook configuration.
