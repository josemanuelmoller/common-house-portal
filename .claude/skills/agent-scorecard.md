---
name: agent-scorecard
description: Balanced Scorecard for OS v2 agent management. Reads Automations [OS v2] for live health data, applies a static token cost model, and produces a formatted scorecard showing frequency, estimated tokens/run, estimated monthly cost, last run, P1 signals, and health status for every agent. Use to track AI spend, identify heavy consumers, and catch degraded agents.
input_schema:
  time_window_days: integer (default 30) — how far back to look for run history in Automations Notes
  show_cost_breakdown: boolean (default true) — include per-agent cost table
  budget_threshold_usd: number (default 150) — monthly budget ceiling; agents projected to exceed trigger amber/red
output:
  format: structured text
  sections: [KPI Summary, Agent Scorecard Table, Cost Breakdown, Alerts, Recommended Actions]
---

You are the Agent Scorecard skill for Common House OS v2.

## Purpose

Produce a Balanced Score Card (BSC) for all OS v2 agents. Surface:
- Which agents run most frequently and cost the most
- Which agents are healthy vs degraded
- Projected monthly AI spend vs budget
- Recommended tuning actions

## Data sources

### 1. Live data — Automations [OS v2]
Query the Automations database for all records where `Type = Agent` or `Type = Scheduled Hook`.
For each record, extract:
- `Name` — agent name
- `Health` — Green / Amber / Red / Unknown
- `Last Reviewed` — last confirmed run date
- `Owner` — responsible person
- `Notes` — parse for last run summary (agent_run_summary blocks if stored)
- `Status` — Active / Paused / Degraded

If a run summary block is found in Notes, extract:
- `records_inspected`, `records_created`, `records_updated`, `p1_count`, `escalation_count`

### 2. Static cost model (apply regardless of live data)

Use this model to estimate tokens and cost per run. All agents use `claude-haiku-4-5-20251001`.
Haiku pricing: Input $0.80/MTok, Output $4.00/MTok.

| Agent | Freq/month | Input tokens/run | Output tokens/run | Notes |
|-------|-----------|-----------------|------------------|-------|
| os-runner (full cycle) | 4 | 470,000 | 70,000 | Delta-only; scales with active sources |
| briefing-agent (quick) | 3 | 40,000 | 8,000 | quick mode: Projects + Pipeline only |
| briefing-agent (full) | 1 | 120,000 | 15,000 | Monthly deep scan |
| hygiene-agent | 2 | 80,000 | 8,000 | Bi-weekly; all automations + entity scan |
| portfolio-health-agent | 4 | 50,000 | 10,000 | at_risk_only=true; ~60% scope reduction |
| deal-flow-agent | 1 | 100,000 | 15,000 | Monthly; full investor × startup scan |
| grant-monitor-agent | 1 | 50,000 | 10,000 | Monthly; full agreements scan |
| review-queue | 12 | 20,000 | 5,000 | ~3x/week; semi-live, 2-day window |

**Ad-hoc skill usage** (human-triggered, estimated):
| Category | Runs/month | Input tokens/run | Output tokens/run |
|----------|-----------|-----------------|------------------|
| source-intake + evidence-review | 20 | 10,000 | 3,000 |
| ingest-conversation (meetings) | 25 | 15,000 | 5,000 |
| write skills (upsert-*, create-*) | 30 | 8,000 | 3,000 |
| analysis skills (vc-eyes, proposal) | 10 | 25,000 | 8,000 |

## Execution procedure

### Step 1 — Query Automations [OS v2]

Use `notion-query-database-view` or `notion-fetch` to read all records from Automations [OS v2].
Filter: Status = Active OR Status = Degraded.

For each record, map to agent in the cost model above.
If an agent is not found in Automations DB, mark as `untracked` in the scorecard.

### Step 2 — Parse run history from Notes

For each Automation record, scan Notes field for the most recent `agent_run_summary` block.
Extract: `records_inspected`, `p1_count`, `escalation_count`, `recommended_next_step`.

If no summary found: mark `last_run_data: unavailable`.

### Step 3 — Compute cost estimates

For each agent, apply the static cost model:

```
input_cost = (input_tokens_per_run × runs_per_month) / 1,000,000 × 0.80
output_cost = (output_tokens_per_run × runs_per_month) / 1,000,000 × 4.00
monthly_cost = input_cost + output_cost
total_tokens_month = (input_tokens_per_run + output_tokens_per_run) × runs_per_month
```

Sum all agents for `total_monthly_cost` and `total_monthly_tokens`.

Ad-hoc usage: sum separately as `adhoc_monthly_cost`.

`grand_total = total_monthly_cost + adhoc_monthly_cost`

### Step 4 — Assign health scores

For each agent, assign a BSC health status:

**Green** — All of:
- Automation Health = Green in Notion
- Last Reviewed within expected cadence (weekly agents: < 8 days, bi-weekly: < 16 days, monthly: < 35 days)
- projected monthly cost ≤ budget_threshold / number_of_agents

**Amber** — Any of:
- Health = Amber in Notion
- Last Reviewed overdue by < 2× cadence
- projected cost > 120% of per-agent budget share

**Red** — Any of:
- Health = Red or Unknown in Notion
- Last Reviewed overdue by ≥ 2× cadence
- Agent has p1_count > 0 unresolved from last run

### Step 5 — Compile output

---

## Output format

```
═══════════════════════════════════════
AGENT SCORECARD — Common House OS v2
Generated: [today]  |  Window: last [N] days
═══════════════════════════════════════

KPI SUMMARY
───────────────────────────────────────
Total agents tracked:     [N]
Healthy (Green):          [N]
Needs attention (Amber):  [N]
Critical (Red):           [N]
Untracked:                [N]

Estimated monthly spend:
  Scheduled agents:       $[X]
  Ad-hoc skill usage:     $[X]
  Grand total:            $[X]
  Budget ceiling:         $[budget_threshold_usd]
  Budget status:          [Under / At risk / Over]

Total tokens/month (est): [N]M tokens

═══════════════════════════════════════
AGENT SCORECARD
═══════════════════════════════════════

| Agent | Freq | Tokens/mo | Cost/mo | Last Run | P1s | BSC |
|-------|------|-----------|---------|----------|-----|-----|
| os-runner | 4×/mo | 2.2M | $[X] | [date or N/A] | [N] | 🟢/🟡/🔴 |
| briefing-agent | 4×/mo* | 490k | $[X] | [date or N/A] | [N] | 🟢/🟡/🔴 |
| hygiene-agent | 2×/mo | 176k | $[X] | [date or N/A] | [N] | 🟢/🟡/🔴 |
| portfolio-health | 4×/mo | 240k | $[X] | [date or N/A] | [N] | 🟢/🟡/🔴 |
| deal-flow-agent | 1×/mo | 115k | $[X] | [date or N/A] | [N] | 🟢/🟡/🔴 |
| grant-monitor | 1×/mo | 60k | $[X] | [date or N/A] | [N] | 🟢/🟡/🔴 |
| review-queue | 12×/mo | 300k | $[X] | [date or N/A] | [N] | 🟢/🟡/🔴 |
| Ad-hoc skills | — | 1.3M | $[X] | — | — | — |

*briefing-agent: 3× quick + 1× full per month

═══════════════════════════════════════
COST BREAKDOWN (if show_cost_breakdown=true)
═══════════════════════════════════════

By layer:
  OS Core Loop (os-runner):       $[X]  ([N]% of total)
  Monitoring agents:              $[X]  ([N]% of total)
  Ad-hoc skills:                  $[X]  ([N]% of total)

Top 3 cost drivers:
  1. [agent name] — $[X]/mo ([N]% of total)
  2. [agent name] — $[X]/mo ([N]% of total)
  3. [agent name] — $[X]/mo ([N]% of total)

Month-over-month trend:
  [If previous period data available in Notes: +X% / -X%]
  [If not available: "Insufficient history — first scorecard run"]

═══════════════════════════════════════
ALERTS
═══════════════════════════════════════

[List any Red agents with reason]
[List any Amber agents with reason]
[List any untracked agents]
[Budget alert if grand_total > budget_threshold_usd]

═══════════════════════════════════════
RECOMMENDED ACTIONS
═══════════════════════════════════════

[Only list if there are actionable items — max 5]
[Format: PRIORITY — Agent — Action — Expected saving or risk]

Example:
HIGH — hygiene-agent — Last run overdue (12 days, bi-weekly cadence) — Run manually or check scheduled task
MEDIUM — briefing-agent — scan_mode=full detected in last 3 weekly runs — Switch to quick for weekly cadence (-70% cost)
LOW — deal-flow-agent — No run in 35+ days — Confirm monthly schedule is active

skill_contract:
  status: REPORT-COMPLETE | REPORT-PARTIAL | BLOCKED
  agents_scored: N
  agents_red: N
  agents_amber: N
  grand_total_usd: X
  budget_status: under | at_risk | over
  recommended_action_count: N
```

---

## Conservative rules

- Never write to any database — this skill is always read-only
- If Automations DB is unreachable, produce scorecard using static model only — mark all `last_run_data: unavailable`
- Do not infer health status beyond what Notion records show — mark Unknown as Amber
- Do not claim "under budget" if ad-hoc usage data is unavailable — show as "estimate only"
- If cost model is applied to a non-Haiku model (detected from agent file), adjust pricing accordingly

---

## Usage examples

Default (monthly scorecard check):
```
/agent-scorecard
```

With budget ceiling:
```
/agent-scorecard
  budget_threshold_usd: 100
  show_cost_breakdown: true
```

Quick health-only check (no cost detail):
```
/agent-scorecard
  show_cost_breakdown: false
```
