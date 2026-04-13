# Common House OS v2 — Operational Runbook

Short reference for scheduled and on-demand runs.

---

## Pipeline

```
source-intake → evidence-review → db-hygiene-operator → validation-operator → project-operator → update-knowledge-asset → [review-queue]
```

Each step feeds the next. Steps skip cleanly when there is nothing to process.

**Validation gate:** `validation-operator` (Step 4) is the gate between evidence creation and project/knowledge updates. Evidence must reach `Validation Status = Validated` before project-operator or knowledge routing will act on it.
- AUTO_VALIDATE: High confidence + Source Excerpt directly supports claim + material type + no speculative language
- AUTO_REVIEW: Plausible, excerpt present, Medium confidence or softer type → Reviewed (not passed downstream this run)
- ESCALATE: No excerpt, Low confidence, ambiguous project, constructed inference → left at New for human judgment

---

## Recommended cadence

| Schedule | Command | Mode | Notes |
|---|---|---|---|
| **Weekday mornings (automated)** | `os-runner` | execute | Default 24h window; touched-scope hygiene; validation auto-fires |
| **Monday morning (automated)** | `os-runner portfolio_hygiene:true` | execute | Broader hygiene sweep across all active projects |
| **After a client interaction** | `os-runner skip_intake:true source_ids:[ids]` | execute | Process specific threads immediately; skip full intake |
| **Before a project review meeting** | `os-runner human_review_summary:true` | execute | Produces the 3 human-facing queues alongside machine summary |
| **Weekly knowledge review** | `os-runner knowledge_routing:true human_review_summary:true` | execute | Surfaces knowledge proposals for batch human review |
| **First run on a new scope** | `os-runner mode:dry_run` | dry_run | Preview what would happen before committing writes |
| **Hygiene-only pass** | `db-hygiene-operator project_ids:[p1,p2]` | — | Direct; no intake/evidence needed |

**Default automated command (no flags needed):**
```
os-runner
```

---

## dry_run vs. execute

### dry_run
```
os-runner mode:dry_run
```
- Reads all databases normally — no writes at any step
- Reports what WOULD be created, updated, or fixed and why
- Counts are prefixed `[DRY RUN]`
- Use before: first run on a new scope, first run after a long gap, testing a config change

### execute (default)
```
os-runner
```
- Full pipeline with writes where appropriate
- Steps skip automatically when there is no signal
- review-queue (Step 7) is read-only regardless of mode

---

## When to enable `human_review_summary`

Enable `human_review_summary:true` when:
- Running before a project review or client meeting
- Starting a weekly review session
- Catching up after a gap of 2+ days
- Wanting to see all open items in one structured output

Do NOT enable it for automated background runs — the machine summary is sufficient and the extra queries add latency.

```
os-runner human_review_summary:true
```

---

## Human review queues

After a run with `human_review_summary:true`, three queues are produced by the `review-queue` agent. Process them in order.

### 1 — P1 Action Queue
**Source:** Validated Blockers + Dependencies from recent evidence; validation escalations for material types.
**Cadence:** Review immediately after every run that produces P1 items. Do not let P1 signals age more than 1 business day.
**Action per item:**
- BLOCKER → resolve the blocking condition or explicitly decide to accept and document the constraint
- DEPENDENCY → confirm the dependency is tracked in the project; assign an owner if not assigned
- ESCALATED → review the evidence record; manually set Validation Status if the record is clearly correct

### 2 — Project Review Queue
**Source:** CH Projects with `Project Update Needed? = YES` or non-empty `Draft Status Update`.
**Cadence:** Review 1–2× per week, or before any client-facing update.
**Action per item:**
- Read the Draft Status Update
- If correct: copy relevant content to Status Summary and clear the draft (human-owned write)
- If partially correct: edit inline, promote what is accurate, discard what is not
- If incorrect: reject — do not promote; the evidence that triggered it may need to be re-reviewed

### 3 — Knowledge Review Queue
**Source:** Evidence at Possibly Reusable / Reusable / Canonical; asset delta proposals; new stub proposals; contradictions.
**Cadence:** Batch-review weekly. Do not review one item at a time — let the queue accumulate and review in one sitting.
**Action per item:**
- POSSIBLY REUSABLE → decide: create a new asset, link to an existing one, or reclassify as Project-Specific
- DELTA PROPOSAL → approve or reject the specific proposed change to an existing asset
- NEW STUB → approve or reject the proposed new knowledge asset
- CONTRADICTION → resolve: which evidence is correct; update or supersede the stale record

---

## What is automatic vs. proposal-first

| Action | Automatic | Notes |
|---|---|---|
| Source record creation (intake) | YES | Within delta window and dedup rules |
| Evidence record creation | YES | From Ingested sources only; new records at Validation Status = New |
| Evidence validation (New → Validated) | YES — conditional | AUTO_VALIDATE: High confidence + excerpt directly supports claim |
| Evidence review (New → Reviewed) | YES — conditional | AUTO_REVIEW: plausible but softer; not passed downstream until human confirms |
| Excerpt fill (SF-4, High confidence) | YES | Verbatim match only; Medium stays in escalation queue |
| Tier 1 safe fixes | YES | Via `apply-safe-fixes`; fixed list, no expansion |
| Source finalization (Ingested → Processed) | YES | Only when all C1–C9 conditions pass |
| Draft Status Update write | YES | After project-operator passes material-change gate on Validated evidence |
| Knowledge asset deltas | **NO — proposal only** | Proposals surface in Knowledge Review Queue; no auto-writes |
| New knowledge asset stub creation | **NO — proposal only** | Canonical-quality evidence only; requires human approval |
| Possibly Reusable routing | **NO — proposal only** | Surfaced in Knowledge Review Queue for human decision |

---

## What must never auto-fix

- Any Evidence Type change
- Any Project relation change
- Validation Status demotion (Validated → anything lower)
- Duplicate evidence resolution
- Initiative vs. workstream ambiguity
- Alias or previous-name resolution
- Entity creation, deletion, or merging
- Project Status or Stage changes
- Any Knowledge Asset write (including new stubs)
- Source Excerpt requiring interpretation rather than verbatim match
- Status Summary field (human-owned; Draft Status Update is the safe intermediary)

---

## What remains proposal-first by design

These outputs from the pipeline are always proposals — never auto-applied:
- All knowledge asset delta proposals (update-knowledge-asset output)
- All new knowledge asset stub proposals
- All `Possibly Reusable` evidence routing decisions
- Draft Status Updates (written by the system; promotion to Status Summary is human-owned)
- Any `Reviewed` evidence advancement to `Validated` (requires human sign-off)

---

## Scopes

Default active scopes (edit in os-runner parameters if these change):
- Auto Mercado
- Reuse for All
- COP31
- ZWF Forum 2026
- Engatel
- Zero Waste Foundation

---

## Quick reference — run patterns

```bash
# Standard daily run (automated, no flags needed)
os-runner

# Standard daily run with human queues
os-runner human_review_summary:true

# Weekly hygiene + review
os-runner portfolio_hygiene:true human_review_summary:true

# Process specific sources (skip intake)
os-runner skip_intake:true source_ids:[id1,id2]

# Full run without knowledge routing
os-runner knowledge_routing:false

# Dry run to preview
os-runner mode:dry_run

# Hygiene on specific projects only
db-hygiene-operator project_ids:[p1,p2] portfolio_run:false

# Human queues only (no pipeline run — reads live state)
review-queue
```

---

## Scheduler setup

**Environment requirements:**
- Notion MCP connected and authorized
- Gmail MCP connected (or set `skip_intake:true` if Gmail is unavailable)

**Recommended cron:**
```
# Weekday mornings at 08:00 — standard delta run
0 8 * * 1-5   os-runner

# Monday at 08:30 — portfolio hygiene
30 8 * * 1    os-runner portfolio_hygiene:true
```

**If a run fails:**
1. Check which step errored in the compact output
2. Re-run with `skip_intake:true source_ids:[affected_ids]` to reprocess without re-ingesting
3. If Notion is unreachable: wait — do not retry in a loop
4. If validation-operator skipped all records: check Source Excerpt population on the evidence records

---

## Step 3 hygiene gating — behavior reference

| Situation | What Step 3 does |
|---|---|
| Steps 1–2 touched projects | Touched-scope only — hygiene on those projects only |
| Steps 1–2 produced nothing AND `portfolio_hygiene: true` | Portfolio mode — up to 5 active projects, last 30 days |
| Steps 1–2 produced nothing AND `portfolio_hygiene: false` | Skipped |
