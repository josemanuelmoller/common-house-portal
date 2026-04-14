# Automated Maintenance Implementation Plan — v1

Common House Portal — code hygiene system, first implementation

Last reviewed: 2026-04-15

---

## 1. Objective of v1

Eliminate the recurring class of mechanical coding errors in this repo — field name drift, wrong property accessors, stale enum literals, missing auth guards — without requiring the repo owner to review every small fix.

**v1 is deliberately narrow.** It is not a CI pipeline, not a GitHub Actions workflow, and not an autonomous agent. It is a manually-triggered Claude Code skill that scans the codebase, classifies findings, proposes Tier A fixes in the same session, and surfaces Tier B/C/D issues as structured output for human action.

The primary payoff: in one ~60-second skill run, any drift that accumulated during a sprint is caught and either fixed immediately or surfaced for a quick decision — before it causes a debugging session.

**Success criteria for v1:**
- The weekly hygiene run catches at least one Tier A issue per month that would otherwise have surfaced as a bug
- The repo owner never needs to read a diff to decide whether to approve a Tier A fix — the rationale is one sentence and the contract reference is cited
- Zero false positives in the Tier A auto-fix set (if something is proposed, it is correct)

---

## 2. Recommended v1 scope

### In scope

| Capability | Detail |
|---|---|
| **Scan** | Read-only pass over `src/` and `docs/` looking for known-bad patterns |
| **Classify** | Group all findings into Tier A / B / C / D per the policy doc |
| **Tier A: propose + apply** | For high-confidence mechanical fixes: propose the exact change, cite the contract, apply after the operator confirms or in auto-mode on the second pass |
| **Tier B: report only** | Surface with a confidence statement and the file/line; do not apply |
| **Tier C/D: brief only** | Produce a one-paragraph Decision Brief; no code change |
| **tsc --noEmit gate** | Run after every Tier A change batch before reporting success |

### Explicitly out of scope for v1

| Not in v1 | Why deferred |
|---|---|
| GitHub Actions / CI integration | Adds infrastructure overhead before the value is proven |
| Automatic PR creation | Requires GitHub token wiring; manual session is sufficient for v1 |
| Scheduled / cron execution | Manual weekly trigger is lower risk for calibration phase |
| Tier B auto-merge | Tier B requires human click-approve; no auto-merge path until Tier A is stable |
| Notion schema auditing | Notion API calls add latency and risk; contracts doc is the source of truth for v1 |
| New env var detection | Low frequency; not worth the scan complexity for v1 |
| Cross-file dependency graph analysis | Too complex; defer to v2 |

---

## 3. Inputs and sources of truth

The skill must load and actively reference these documents. It must not guess or infer values not present in them.

### Primary references (skill must read at start)

| Document | What it provides |
|---|---|
| `AGENTS.md` | Hard rules: API auth patterns, client refresh rules, pre-merge sanity checklist |
| `docs/NOTION_FIELD_CONTRACTS.md` | Canonical Notion field names, property types, and risk notes per DB |
| `docs/AUTO_MAINTENANCE_AGENT_POLICY.md` | Tier definitions, auto-merge policy, escalation format |

### Secondary references (checked when relevant)

| Document | What it provides |
|---|---|
| `docs/ROUTES_AND_SURFACES.md` | Which API routes are intentionally public (auth exceptions) |
| `src/lib/notion/core.ts` | The canonical `DB` constants map and helper function signatures |
| `src/lib/notion/index.ts` | Current barrel exports (dead import detection) |

### What the skill must NOT rely on

- **Guessing Notion field names** — if a field is not in `docs/NOTION_FIELD_CONTRACTS.md`, the finding is Tier C (cannot confirm), not Tier A
- **Undocumented assumptions about route intent** — if a route is not documented in `docs/ROUTES_AND_SURFACES.md`, the auth finding is Tier B minimum
- **Inferred product behaviour** — any fix that would change what a user sees on screen, even slightly, is Tier C minimum
- **Schema assumptions** — the DB IDs and field names in `core.ts` are assumed correct; the skill does not validate them against live Notion

---

## 4. Suggested workflow

### Step 1 — Trigger

The operator runs `/hygiene-audit` (or the equivalent skill invocation) once per week, or at the end of any sprint that touched API routes, Notion query functions, or client components.

The skill requires no arguments. It reads the current working directory.

### Step 2 — Scan pass (read-only)

The skill performs a structured read pass over the following file sets, in order:

**Pass 1 — API auth gaps**
- Glob: `src/app/api/**/route.ts`
- For each file: confirm the presence of `adminGuardApi()` or a `CRON_SECRET` check in every exported `POST`, `PATCH`, `DELETE`, and `PUT` handler
- Cross-reference `docs/ROUTES_AND_SURFACES.md` for documented public exceptions
- Output: list of routes missing auth, each flagged as Tier A (clearly admin-only) or Tier B/C (ambiguous intent)

**Pass 2 — Notion field name drift**
- Glob: `src/lib/notion/**/*.ts`, `src/app/api/**/route.ts`
- For each Notion property access (string literals in `prop(page, "...")`, `p["..."]`, `page.properties["..."]`): look up the field name in `docs/NOTION_FIELD_CONTRACTS.md`
- If the field name is not in the contracts doc: flag as Tier B (unknown, cannot confirm)
- If the field name differs from the documented canonical name: flag as Tier A (confirmed drift)

**Pass 3 — Property accessor mismatch**
- Glob: `src/lib/notion/**/*.ts`
- For each `text(prop(...))`, `select(prop(...))`, `checkbox(prop(...))`, `date(prop(...))`, `num(prop(...))`: look up the property type in `docs/NOTION_FIELD_CONTRACTS.md`
- If the accessor does not match the documented property type: flag as Tier A (confirmed mismatch)

**Pass 4 — Enum/literal drift**
- Glob: `src/**/*.ts`, `src/**/*.tsx`
- Scan for string comparisons involving known contract value sets:
  - Decision Items priority: `"P1 Critical" | "High" | "Medium" | "Low"`
  - Content Pipeline channel: `"Platform"` (not `"Channel"`)
  - Project workspace: `"hall" | "garage" | "workroom"`
  - Agent Draft status: `"Pending Review" | "Approved" | "Revision Requested" | "Sent" | "Draft Created" | "Superseded"`
  - Evidence validation: `"New" | "Validated" | "Reviewed"`
- Any comparison using a known-wrong alias (`"P1"`, `"Urgent"`, `"Normal"`, `"Channel"`) is Tier A if the correct value is documented
- Any comparison where the correct value is uncertain is Tier B

**Pass 5 — Client mutations missing refresh**
- Glob: `src/app/**/*.tsx`
- For each file with `"use client"` and a `fetch(...method: "POST"...)` or `fetch(...method: "PATCH"...)` or `fetch(...method: "DELETE"...)`:
  - Check if `router.refresh()` is called in the success branch
  - If not: flag as Tier B (requires tree inspection to confirm server-rendered UI exists above it)
- `window.location.reload()` usage: Tier A replacement with `router.refresh()`

**Pass 6 — Dead imports**
- Glob: `src/lib/notion.ts`, `src/lib/notion/index.ts`
- Any symbol imported in the shim that is also exported from a domain module AND is no longer used in the shim file itself: Tier A removal

### Step 3 — Classification pass

After the scan, the Technical Reviewer (same session, second pass) re-reads each finding and applies the tier criteria from the policy doc. For every Tier A finding it additionally confirms:
- The fix is derivable from the cited doc without any product judgment
- The change is self-contained (no transitive file effects)
- `tsc --noEmit` is predicted to pass after the change

Any Tier A finding that fails the re-read check is promoted to Tier B.

### Step 4 — Output and action

| Tier | Output | Action |
|---|---|---|
| **A** | Exact diff + one-line rationale + contract citation | Applied immediately in the same session (or batched and applied after operator confirmation) |
| **B** | File, line, finding description, confidence statement | Listed for human review; no code change |
| **C** | Decision Brief in the standard format (see §7) | Surfaces to owner; no code change |
| **D** | Flag only: "Do not act without explicit instruction" | Surfaces to owner; no code change |

### Step 5 — Verification

After all Tier A fixes are applied:
1. Re-read every changed file
2. Run `tsc --noEmit` — must be clean before reporting done
3. Verify no AGENTS.md rule was violated by any change
4. Output a summary: N Tier A fixes applied, N Tier B surfaced, N decisions needed

---

## 5. Safe first auto-fix set

These are the only fix types eligible for Tier A auto-application in v1. The list is intentionally narrow. It expands only after v1 runs cleanly for at least 4 weeks.

| Fix type | Condition for Tier A | Example from this repo |
|---|---|---|
| **Priority literal correction** | Wrong literal is documented in `NOTION_FIELD_CONTRACTS.md`; correct literal appears elsewhere in the same codebase and is confirmed correct | `"P1" || "Urgent"` → `"P1 Critical"` in `admin/page.tsx` |
| **Status literal correction** | Same condition as above | Any `"Draft Created"` vs `"Sent"` misuse in Agent Draft status paths |
| **Platform/channel literal correction** | Wrong field name is documented; correct name confirmed in contracts doc | `"Channel"` → `"Platform"` in Content Pipeline reads |
| **Property accessor correction** | Accessor type and correct accessor both documented in contracts doc | `text()` on a `select` field → `select()` |
| **`window.location.reload()` replacement** | Unconditional; pattern replacement, no context needed | Any occurrence in `src/app/**/*.tsx` → `router.refresh()` |
| **Dead import removal** | Symbol not used in the file and confirmed exported from a domain module | Leftover `import { getAllSources }` after module extraction |
| **Stale comment correction** | Comment contradicts the current implementation in the same file | `// "Channel"` field comment after rename to `"Platform"` |
| **Refactor plan progress marker** | A module listed as "pending" in `NOTION_LAYER_REFACTOR_PLAN.md` has been extracted and the module file exists | Marking `projects.ts` as extracted after the file exists |

### What is NOT in the Tier A auto-fix set for v1

- Adding `adminGuardApi()` to any route (Tier B — auth is too sensitive even when obvious)
- Adding `router.refresh()` to a client component (Tier B — requires tree inspection)
- Any Notion field name change in a write path (Tier B — write paths are higher risk than reads)
- Any fix where the correct value is not confirmed in an existing doc (Tier C)
- Any fix that touches more than one logical concern in the same change (split into separate findings)

---

## 6. Required safeguards before any auto-merge

All of the following must pass before a Tier A change is applied. The skill must not skip any item.

| # | Safeguard | Failure action |
|---|---|---|
| 1 | Re-read the changed file after editing | If output differs from intent: revert, promote to Tier B |
| 2 | `tsc --noEmit` passes clean | If any error: revert all Tier A changes in the batch, report as blocked |
| 3 | No AGENTS.md rule violated | Evaluate each of the 8 checklist items for applicability |
| 4 | Fix matches a documented contract value | If the correct value is not in `NOTION_FIELD_CONTRACTS.md` or `AGENTS.md`: promote to Tier B |
| 5 | Change is self-contained | If any other file would be affected by this change that is not included in the fix: promote to Tier B |
| 6 | Fix confidence is ~95%+ | If there is any scenario where the proposed value could be wrong: promote to Tier B |
| 7 | No schema-adjacent change | If the fix touches a DB ID, env var, or auth logic: hard stop, promote to Tier D |

If three or more Tier A fixes fail safeguard checks in a single run, the skill stops the auto-apply batch and requires operator confirmation before continuing.

---

## 7. Manual escalation format

When a Tier C or D finding is surfaced, the skill produces a Decision Brief in this exact format. It must fit in a single short paragraph plus a decision prompt. No long explanations.

---

**Decision Brief — [one-line title of the issue]**

**Location:** `[file path]`, line [N]

**What was found:**
[One sentence describing the pattern detected.]

**Why this cannot be fixed automatically:**
[One sentence on the ambiguity — what information would be needed that is not in the repo docs.]

**Options:**
1. [First option — usually the safer/more restrictive one]
2. [Second option — the alternative]

**Your call:** Which option, or provide the missing context.

**Risk if left unfixed:** [One sentence on what breaks or drifts if this is ignored.]

---

**Example — auth ambiguity:**

**Decision Brief — `/api/living-room/signals` has no auth guard**

**Location:** `src/app/api/living-room/signals/route.ts`, line 8

**What was found:**
This route handles a POST mutation but does not call `adminGuardApi()` or check `CRON_SECRET`. Other Living Room routes at this path are documented as read-only public routes.

**Why this cannot be fixed automatically:**
`docs/ROUTES_AND_SURFACES.md` does not document this route. It is unclear whether it is an admin write route or a pipeline agent route.

**Options:**
1. Add `adminGuardApi()` — if this is triggered by an admin action in the portal
2. Add `CRON_SECRET` check — if this is triggered by a cron or agent pipeline

**Your call:** Which option, or confirm the intended caller.

**Risk if left unfixed:** Unauthenticated write access to Living Room data.

---

The owner's response is one sentence. The skill then applies the correct option and runs safeguards.

---

## 8. First practical rollout step

**Create the skill file `.claude/skills/hygiene-auditor.md` this week.**

The skill file should:
1. Load `AGENTS.md`, `docs/NOTION_FIELD_CONTRACTS.md`, and `docs/ROUTES_AND_SURFACES.md` at the start of every run
2. Implement the 6 scan passes from §4 as explicit numbered steps
3. Hard-code the Tier A auto-fix set from §5 as the only changes it may propose and apply
4. Run `tsc --noEmit` before reporting any Tier A fix as complete
5. Output a structured run summary: N applied, N surfaced (Tier B), N decisions needed (Tier C/D)

**Do not wire it to any schedule or CI yet.** Run it manually at the end of each sprint for the first month. After 4 clean-or-productive runs, evaluate whether to add a weekly cron trigger.

**The skill mirrors the existing `suggest-safe-fixes` / `apply-safe-fixes` pattern already in this repo** — same proposal-first approach, same tiered classification, same refusal policy. The only difference is the target (portal codebase rather than Notion OS v2 records) and the tools used (Read + Edit + Bash rather than notion-update-page).

The measure of whether this is working: after the first month, count how many Tier A findings were caught that were not known bugs at the time of the run. If it finds at least one per month, it is paying for itself.

---

## Appendix — known Tier A patterns from recent bug-hunting sweeps

These are confirmed examples from this repo. The hygiene auditor should treat them as calibration cases — if it would not have caught these, the scan patterns need refinement.

| Bug caught | File | Fix applied | Tier |
|---|---|---|---|
| `"P1" \|\| "Urgent"` instead of `"P1 Critical"` in urgentDecisions filter | `src/app/admin/page.tsx` line 171 | Literal correction | A |
| `"P1" \|\| "Urgent"` in P1 badge styling | `src/app/admin/page.tsx` lines 436–437 | Literal correction | A |
| `"Urgent"/"Normal"` in PRIORITY_ORDER map | `src/app/api/hall-data/route.ts` | Literal correction | A |
| `"Urgent"/"Normal"` in PRIORITY_ORDER map | `src/app/api/decisions-queue/route.ts` | Literal correction | A |
| `text()` on `"Source Agent"` (select property) | `src/app/api/decisions-queue/route.ts` | Accessor correction | A |
| `"Draft Text"` field name (canonical is `"Content"`) | `src/app/api/send-draft/route.ts` | Field name correction | A |
| `"Title"` / `"Name"` instead of `"Draft Title"` | `src/app/api/send-draft/route.ts` | Field name correction | A |
| `"Channel"` instead of `"Platform"` in getContentPipeline | `src/lib/notion.ts` (now `projects.ts`) | Field name correction | A |
