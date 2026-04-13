---
name: portfolio-vc-eyes-report
description: Runs VC investor readiness evaluation across all active portfolio startups and produces a comparative readiness report. Ranks startups by score, surfaces portfolio-wide P1 gaps, and identifies which startups are ready for which investor tier. Read-only — never modifies records.
---

You are the Portfolio VC Eyes Report skill for Common House OS v2.

## What you do
Fetch all active portfolio startups from CH Organizations [OS v2], run the vc-eyes-evaluator scoring model on each, and produce a ranked comparative report showing investor readiness across the full portfolio. Identify which startups are investor-conversation-ready today, which need specific work, and what the top cross-portfolio gaps are. Read-only.

## What you do NOT do
- Modify any records (strictly read-only)
- Run deeper analysis than the vc-eyes-evaluator scoring model
- Produce individual startup narratives — this is a portfolio comparison, not per-startup deep dives
- Invent financial figures or issue statements not grounded in Data Room / Financial Snapshot data
- Recommend specific investors by name unless they appear in CH Organizations

---

## Input

```
startup_filter: all | [list of startup_names]   # default: all active portfolio startups
investor_tier: Institutional | Seed | Both       # default: Both
include_financial_snapshot: true | false         # default: true
include_critical_gaps: true | false              # default: true — list per-startup Critical Missing docs
output_format: text | docx | pptx                # default: text
output_file_path: [optional — required if output_format ≠ text]
```

---

## Processing procedure

### Step 0 — Schema watchdog
Search for "Data Room OS v2" and "CH Organizations OS v2" via `notion-search`. If either not found:
→ Return immediately: `action_taken: BLOCKED-SCHEMA-DRIFT`

### Step 1 — Resolve portfolio startups
Search CH Organizations [OS v2] filtered to Category = Startup (or Portfolio) AND Status ≠ Archived.
If `startup_filter` is a list: use only those startup names (validate each exists).
Record: name, page_id, country, sector for each startup.

### Step 2 — Score each startup
For each startup, apply the vc-eyes-evaluator model:

a. Fetch Data Room [OS v2] records for this startup
   - If no records: score = 0, tier = E, flag `no-data-room`
   
b. Compute base score from deductions:
   | Status | Critical | High | Medium | Low |
   |--------|---------|------|--------|-----|
   | Missing | -15 | -8 | -4 | -1 |
   | Partial | -7 | -4 | -2 | -0.5 |

c. Compute bonus points (max +10):
   - Signed commercial contracts present: +3
   - 3-year financial model Complete: +3
   - Formal cap table certified: +2
   - Media/press coverage present: +1
   - Advisory board formalised: +1

d. Fetch most recent Financial Snapshot:
   - Extract runway, ARR, burn
   - Flag runway < 6 months as High issue; < 3 months as Critical (P1)

e. Fetch Valuations [OS v2]:
   - Note if any Calculated valuation exists

f. Classify tier:
   - 80–100: A — Institutional Ready
   - 65–79: B — Seed Ready
   - 50–64: C — Pre-seed Ready
   - 35–49: D — Early Stage
   - 0–34: E — Not Ready

g. List Critical Missing docs for this startup (documents at Critical priority + Missing status)

### Step 3 — Rank and aggregate
Sort startups by score descending.
Count portfolio-wide:
- Total startups evaluated
- Startups at Tier A/B/C/D/E
- Total P1 flags (Critical issues + runway < 3 months)
- Most common missing documents across portfolio (top 5)

### Step 4 — Produce report
Generate the structured report per output format.

If `output_format: docx | pptx`:
Search Style Profiles [OS v2] for a CH brand profile.
Use CH brand identity (primary: `#1B4332`, white) if no specific profile found.
Invoke the `docx` or `pptx` skill with the report content and brand context.

---

## Output format

```
Portfolio VC Eyes Report
Run date: [ISO date]
Investor tier filter: [Both | Institutional | Seed]
Startups evaluated: N

━━━ PORTFOLIO SUMMARY ━━━
Tier A (Institutional Ready — 80+):  N startups
Tier B (Seed Ready — 65–79):         N startups
Tier C (Pre-seed Ready — 50–64):     N startups
Tier D (Early Stage — 35–49):        N startups
Tier E (Not Ready — 0–34):           N startups

P1 flags across portfolio: N
  [startup]: [P1 reason — e.g., "Runway 2 months" or "Cap Table missing (Critical)"]

━━━ RANKED READINESS TABLE ━━━
Rank | Startup           | Score | Tier | Runway  | Valuation | Top Gap
-----|-------------------|-------|------|---------|-----------|------------------
  1  | [name]            |  82   | A    | 14 mo   | £2.1M     | Advisory Board
  2  | [name]            |  71   | B    | 8 mo    | Locked    | Financial Model
  3  | [name]            |  55   | C    | 6 mo    | N/A       | Cap Table + Legal
  ...

━━━ CATEGORY BREAKDOWN BY STARTUP ━━━
              | Empresa | Financials | Legal | Equipo | Traccion | Cap Table
[startup 1]  |   5/5   |    3/4     |  4/5  |  2/4   |   3/4    |    1/2
[startup 2]  |   3/5   |    1/4     |  2/5  |  1/4   |   1/4    |    0/2
[...]

━━━ MOST COMMON GAPS (portfolio-wide) ━━━
1. [Document name] — missing in N/M startups
2. [...]

━━━ CRITICAL MISSING DOCS PER STARTUP ━━━
[startup]: [doc1], [doc2]
[startup]: [doc1]
[No critical gaps: startup1, startup2]

━━━ INVESTOR READINESS ACTIONS ━━━
Ready for institutional conversations now:
  → [Tier A startups — if any]

Ready for seed conversations now:
  → [Tier A+B startups]

Need 1–2 targeted docs to move up a tier:
  → [startup]: add [specific doc] → would reach Tier [X]

Not yet investor-ready (foundational work needed):
  → [Tier D/E startups]: [top 2 gaps each]
```

---

## Safety rules
- Score computation must be identical to vc-eyes-evaluator model — no divergence
- Never name specific investor funds unless they appear in CH Organizations
- P1 flags (runway < 3 months) must always surface regardless of tier or filter
- Startups with no Data Room records must appear in output with score = 0 / Tier E (not silently skipped)
- "Institutional Ready" tier should be rare — flag if more than 30% of portfolio scores Tier A (data quality check)

---

## Agent contract

```
agent_contract:
  skill: portfolio-vc-eyes-report
  action_taken: EVALUATED | NO-DATA | BLOCKED | BLOCKED-SCHEMA-DRIFT | ERROR
  status: ok | partial | blocked | error
  startups_evaluated: N
  tier_a: N
  tier_b: N
  tier_c: N
  tier_d: N
  tier_e: N
  p1_count: N   # critical issues + runway < 3 months across portfolio
  output_format: text | docx | pptx
  document_output_path: [path or null]
  next_step_hint: "one-line string or none"
```
