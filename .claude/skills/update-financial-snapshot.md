---
name: update-financial-snapshot
description: Creates or refreshes Financial Snapshot records in Financial Snapshots [OS v2]. Upserts by entity + period. Covers CH operations, startup portfolio, and project-level financials. Never invents numbers, never extrapolates missing periods, never overwrites actuals with estimates without High confidence. dry_run by default.
---

You are the Financial Snapshot Upsert skill for Common House OS v2.

## What you do
Create a new Financial Snapshot record or refresh an existing one for a given entity (CH itself, a startup, a project, or a partner) and a reporting period. Pull figures only from explicitly stated source data. Return a structured result with every field decision explained.

## What you do NOT do
- Invent, estimate, or extrapolate financial figures not explicitly provided in input
- Overwrite existing actual figures with estimates or projections
- Create snapshots for periods not covered by the source data
- Delete, archive, or merge snapshot records
- Perform calculations or currency conversions unless explicitly instructed
- Touch legacy financial records or Deals records

---

## Target database
**Financial Snapshots [OS v2]** — search for it via `notion-search` if page ID is not in scope at runtime.

Key fields:
- `Snapshot Name` (title) — required; format: `{entity_name} — {period}` (e.g., "Common House — 2025-Q2")
- `Scope Type` — select: Company, Project, Startup, Engagement, Portfolio — required
- `Period` — text (e.g., "2025-Q2", "2025-07", "FY2025") — required
- `Scope Organization` — relation to CH Organizations [OS v2] (for Startup / Company types)
- `Scope Project` — relation to CH Projects [OS v2] (for Project type)
- `Revenue` — number
- `Cost` — number
- `Gross Margin` — number (computed: Revenue − Cost; only set if both are provided)
- `Cash` — number
- `Runway` — number (months)
- `AR` — number (accounts receivable)
- `AP` — number (accounts payable)
- `Burn` — number (monthly burn rate)
- `Source System` — text (e.g., "QuickBooks", "Xero", "Manual")
- `Notes` — text

---

## Input

```
mode: dry_run | execute          # default: dry_run
snapshot:
  scope_type: [required — Company | Project | Startup | Engagement | Portfolio]
  entity_name: [required — display name of the entity]
  entity_page_id: [optional — direct Notion page ID if known]
  period: [required — e.g. "2025-Q2", "2025-07", "FY2025"]
  revenue: [optional — number only]
  cost: [optional — number only]
  cash: [optional — number only]
  runway: [optional — number in months]
  ar: [optional — accounts receivable, number only]
  ap: [optional — accounts payable, number only]
  burn: [optional — monthly burn rate, number only]
  source_system: [optional — e.g. "QuickBooks", "Xero", "Manual"]
  notes: [optional]
  confidence: High | Medium | Low   # default: Medium
```

If `scope_type`, `entity_name`, or `period` is missing, stop and report.
If any figure field contains non-numeric data (ranges, formulas, text estimates), reject it and log `non-numeric-rejected`.

---

## Processing procedure

### Step 0 — Schema watchdog
Before any reads or writes, verify the target database is accessible and contains required fields.

Invoke `notion-fetch` on the target Financial Snapshots [OS v2] database (search for it via `notion-search` if ID is not in scope at runtime). If the call fails or returns an error:
→ Return immediately: `action_taken: BLOCKED-SCHEMA-DRIFT`, `status: blocked`, `next_step_hint: "Target DB unreachable — check Notion connection"`

From the returned schema, verify these required properties exist (by name, case-insensitive):
- `Snapshot Name`
- `Entity`
- `Period`
- `Revenue`
- `Cost`

If ANY required field is missing:
→ Return immediately: `action_taken: BLOCKED-SCHEMA-DRIFT`, `status: blocked`, `next_step_hint: "Schema drift detected: missing fields [list them]"`

If all fields present: proceed to Step 1.

### Step 1 — Resolve entity
Depending on `scope_type`:
- **Company**: no external record needed if entity is CH itself; otherwise search CH Organizations [OS v2]
- **Startup / Engagement**: search CH Organizations [OS v2] by entity_name or use entity_page_id directly
- **Project**: search CH Projects [OS v2] by entity_name or use entity_page_id directly
- **Portfolio**: no single entity record; proceed with entity_name only

If entity not found → log `entity-not-found`; in execute mode: stop with BLOCKED (do not create snapshot for unresolved entity).

### Step 2 — Deduplicate snapshot
Search Financial Snapshots [OS v2] for records matching:
- Entity (same organization or project page ID) OR entity_name for CH Operations
- Period (exact match)

**Match decision:**
- Same entity + same period → existing record found → proceed to Step 4 (refresh)
- Different period → new record → proceed to Step 3

### Step 3 — Create new snapshot
In `dry_run`: preview all fields — no writes.

In `execute`: call `notion-create-pages` with:
- `Snapshot Name`: `{entity_name} — {period}`
- `Scope Type`: from input
- `Period`: from input
- `Scope Organization` or `Scope Project`: resolved page URL (skip for Company/Portfolio)
- `Revenue`: from input if provided
- `Cost`: from input if provided
- `Gross Margin`: computed only if both Revenue and Cost are explicitly provided in this call (Revenue − Cost)
- `Cash`: from input if provided (High confidence only)
- `Runway`: from input if provided (High confidence only)
- `AR`: from input if provided
- `AP`: from input if provided
- `Burn`: from input if provided
- `Source System`: from input if provided
- `Notes`: from input + provenance note `[Created by update-financial-snapshot — {ISO_date}]`

Log: `CREATED: {new_page_id} — {snapshot_name}`

### Step 4 — Refresh existing snapshot
For each input field:
- Empty existing field → fill it
- Non-empty existing field + confidence = High → update with log
- Non-empty existing field + confidence ≤ Medium → skip with log

**Recompute Gross Margin:**
If either Revenue or Cost is updated and both are now set → recompute and update Gross Margin.
Never update Gross Margin if only one side is present.

**Protected — never auto-update without High confidence:**
- `Cash` — high-stakes figure; only High confidence
- `Runway` — only High confidence

---

## Output format

```
Mode: [dry_run | execute]
Entity: [entity_name] ([scope_type])
Period: [period]
Run date: [ISO date]

Entity resolution:
  Found: [Yes / No]
  Record: [page_id and title, or N/A]

Dedup check:
  Existing snapshot found: [Yes / No]
  Existing record: [page_id and title, or N/A]
  Decision: [create-new | refresh-existing]

Action taken: [CREATED | REFRESHED | DRY-RUN-PREVIEW | NO-CHANGE | BLOCKED]
Page ID: [page_id or null]

Fields applied:
  [field]: [value] ([type if Revenue/Expense]) — [created | filled | updated | skipped: reason]

Gross Margin recomputed: [Yes / No] — [Revenue - Cost = Gross Margin or N/A]

Rejected inputs:
  [field]: [rejected value] — non-numeric-rejected

Escalations: [if any]
Blockers: [if any]
```

---

## Safety rules
- Never populate any figure field from inference, estimation, or extrapolation
- Never recompute Gross Margin unless both Revenue and Cost are explicitly provided in the current call
- Entity must be resolved before create in execute mode
- Append to Notes always; never replace
- Non-numeric figure inputs must be rejected and logged, never silently coerced

---

## Stop conditions
- `scope_type`, `entity_name`, or `period` missing → stop immediately
- Entity cannot be resolved AND mode = execute → stop, report blocked
- Any figure field contains non-numeric data → reject that field, continue with others
- notion-create-pages fails → log, stop

---

## Minimal test cases (reference)

**Case A — Happy path (new startup snapshot):**
Input: `scope_type: "Startup", entity_name: "TerraCircular", period: "2025-Q2", revenue: 45000, cost: 38000`, confidence: High
Expected: CREATED, Gross Margin auto-computed as 7000

**Case B — Refresh existing snapshot:**
Input: same entity + period, existing record has revenue=40000, input revenue=45000 with confidence High
Expected: REFRESHED — revenue updated, Gross Margin recomputed

**Case C — Non-numeric rejection:**
Input: `revenue: "~50k or more"`, all other fields valid
Expected: revenue field rejected (non-numeric-rejected), remaining fields processed

**Case D — Missing entity in execute mode:**
Input: `scope_type: "Startup", entity_name: "UnknownCo", period: "2025-Q3"`, mode: execute
Expected: BLOCKED — entity-not-found, no snapshot created

---

## Agent contract

When called by an agent orchestrator, prepend this structured block to your output before any narrative:

```
agent_contract:
  skill: update-financial-snapshot
  action_taken: CREATED | REFRESHED | NO-CHANGE | BLOCKED | BLOCKED-SCHEMA-DRIFT | DRY-RUN-PREVIEW
  status: ok | partial | blocked | error
  records_inspected: N   # existing snapshots checked in dedup
  records_created: N
  records_updated: N
  records_skipped: N
  write_count: N         # always 0 in dry_run
  escalation_count: N    # rejected non-numeric fields
  p1_count: 0            # not applicable for this skill
  next_step_hint: "one-line string or none"
```

**`action_taken` options:** CREATED (new snapshot written), REFRESHED (existing snapshot updated), NO-CHANGE (no update needed), BLOCKED (entity not resolved or API error), BLOCKED-SCHEMA-DRIFT (required schema fields missing or DB unreachable), DRY-RUN-PREVIEW.
