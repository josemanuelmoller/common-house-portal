# Hygiene Audit Runbook — v1 Shadow Mode

Common House Portal — code hygiene system, operational guide

Last reviewed: 2026-04-14 (v2 upgrade)

---

## What this is

A manually-triggered hygiene scan that finds known-bad patterns in the portal codebase and classifies them by risk tier. It produces a structured report with patch previews. It does not apply any changes.

This is v1, shadow mode only. No auto-merge. No PRs. No CI. One instruction, one report.

---

## How to trigger it

Open a Claude Code session in the repo root and run:

```
/hygiene-audit
```

That is the complete trigger. The skill loads its own reference documents and runs all scan passes automatically.

**Expected run time:** 2–5 minutes depending on codebase size.

---

## What it scans (v2 scope)

| Pass | What it looks for | Tier if found |
|---|---|---|
| 1 | `window.location.reload()` in client components | A |
| 2 | Stale priority literals for Decision Items (`"P1"`, `"Urgent"`, `"Normal"`) | A (confirmed) / B (ambiguous) |
| 3 | `"Channel"` used as a Notion property name (canonical is `"Platform"`) | A |
| 4 | Wrong property accessor (`text()` on a select field, etc.) | A (confirmed in contracts) / B (unknown) |
| 5 | Dead imports in `src/lib/notion.ts` after module extraction | A |
| 6 | Refactor plan progress markers out of sync with existing files | A |
| 7 | Stale inline comments contradicting current field contracts | A |
| 8 | Read-path Notion field name aliases (`"Draft Text"` in Agent Drafts context; `"Title"`/`"Name"` near agentDrafts) | A (confirmed Agent Drafts) / B (ambiguous) |
| 9 | Missing `router.refresh()` in `"use client"` components with mutating fetches | B |

Passes NOT included in v2: API auth gaps, Notion schema auditing, cross-file dependency analysis, auto-adding `router.refresh()`. See `docs/AUTO_MAINTENANCE_IMPLEMENTATION_PLAN.md` for the full roadmap.

---

## Output format

The report has four sections:

**Tier A — Safe fix candidates**
Each finding includes: file + line, exact pattern found, contract reference, and a `diff`-style patch preview. These are the highest-confidence findings. The patch shown is exactly what would be applied.

**Tier B — Surface for review**
Each finding includes: file + line, pattern found, why it is not Tier A, and what to verify before acting.

**Tier C/D — Decision required**
Each finding is a Decision Brief: what was found, why it can't be fixed automatically, two options, and a one-sentence risk statement. These need a human call before anything happens.

**Safeguard checklist**
Confirms the auditor applied the tier criteria correctly. `tsc --noEmit` is listed as NOT RUN in shadow mode — the operator must run it before applying any patch.

---

## What to do with the report

### Tier A findings

Each patch preview shows the exact change. To apply:

1. Read the patch — confirm it looks right
2. In the same or a new Claude Code session, say: **"Apply patch A-[n] from the hygiene audit report"**
3. Run `tsc --noEmit` after applying
4. Re-read the changed file
5. Commit: `fix(hygiene): [short title] — [contract reference]`

Apply one Tier A patch at a time per commit unless they are in the same file.

### Tier B findings

Read the finding and the "why not Tier A" note. Decide whether to:
- Investigate the file manually and apply a fix if confirmed
- Promote to Tier A in the next run if you can confirm the context
- Dismiss if it turns out to be a false positive

### Tier C/D findings

Read the Decision Brief. Answer the "Your call" question in one sentence. The next Claude Code session will implement your chosen option.

---

## When to run it

**Recommended cadence:** Once per week, at the start of the week before feature work begins — or immediately after any sprint that touched API routes, Notion query functions, or client components.

**Minimum cadence:** Before any production deployment.

Running it takes ~5 minutes. Ignoring a Tier A finding typically costs a debugging session.

---

## What this system is NOT (v1)

- It does not auto-merge anything
- It does not open GitHub PRs
- It does not run on a schedule
- It does not modify any file
- It does not touch auth, schema, or env vars
- It does not require opening Notion

All of those are deferred to v2 once this run cadence proves its value.

---

## Reference documents

| Document | Role |
|---|---|
| `.claude/skills/hygiene-auditor.md` | The skill implementation — scan logic, tier definitions, output format |
| `docs/AUTO_MAINTENANCE_AGENT_POLICY.md` | Policy: tier definitions, auto-merge policy, escalation format |
| `docs/AUTO_MAINTENANCE_IMPLEMENTATION_PLAN.md` | Implementation plan: v1 scope, safeguards, calibration cases |
| `AGENTS.md` | Hard rules referenced by the auditor at runtime |
| `docs/NOTION_FIELD_CONTRACTS.md` | Field contracts referenced by the auditor at runtime |
