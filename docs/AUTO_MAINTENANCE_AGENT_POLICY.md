# Automated Maintenance Agent Policy

Common House Portal — repo maintenance automation design

Last reviewed: 2026-04-15

---

## 1. Goal

This system exists to eliminate the class of bugs that keep reappearing in this repo despite being easy to prevent. The root cause of every regression fixed in the recent bug-hunting sweeps was not complexity — it was drift: a field name assumed without checking, a priority string copied from memory instead of the contract, an auth guard not wired after a route was added.

Manual code review does not reliably catch these because:
- The repo owner is non-technical and cannot distinguish a safe mechanical fix from a subtle logic change
- Claude sessions have limited context windows and do not automatically re-read every file they touch
- No single bug is hard to fix individually — the cost is the repeated root-cause hunting across sessions

**This system is not about catching hard bugs. It is about preventing known-bad patterns from ever landing.**

### What "success" looks like

- A mutating API route is never shipped without an auth guard
- A Notion field reference never silently drifts from the contract
- An enum comparison (priority, status, workspace) never uses a stale literal
- The repo owner is not asked to approve low-risk mechanical fixes — only genuine product/schema decisions
- Debugging time spent on "why is this field empty / why does this count show zero" drops to near zero

---

## 2. Agent roles

### Role A — Hygiene Auditor

**What it does:** Scans the codebase for known-bad patterns. Produces a structured report and opens draft PRs for mechanical fixes. Does not merge anything itself.

**Scan targets:**

| Category | What it checks | Files in scope |
|---|---|---|
| API auth gaps | Every `POST`/`PATCH`/`DELETE` route is missing `adminGuardApi()` or a `CRON_SECRET` check | `src/app/api/**/route.ts` |
| Notion field name drift | Field names used in code against `docs/NOTION_FIELD_CONTRACTS.md` | `src/lib/notion/**`, `src/app/api/**/route.ts` |
| Property accessor mismatch | `text()` on a `select` field, `select()` on a `rich_text` field, etc. | All Notion query functions |
| Enum/literal drift | Priority, status, type, workspace, platform string comparisons against known contract values | All `*.tsx`, `*.ts` files |
| Client mutations missing refresh | `"use client"` components that `POST`/`PATCH`/`DELETE` to `/api/*` without `router.refresh()` where server-rendered UI exists above them | `src/app/**/*.tsx` |
| Duplicated literal maps | `PRIORITY_ORDER`, `PRIORITY_SHORT`, `STATUS_MAP` — same map defined in multiple places that can drift | All files |
| Oversized domain files | Files exceeding ~400 lines that should be candidates for modularization | `src/lib/**`, `src/app/api/**` |
| Stale docs | Field references in `docs/NOTION_FIELD_CONTRACTS.md` not matching current code; refactor plan progress markers outdated | `docs/` |
| Dead imports | Symbols imported from extracted modules that are no longer used | `src/lib/notion.ts` and domain modules |
| `window.location.reload()` usage | Hard reloads that should be `router.refresh()` | `src/app/**/*.tsx` |

**Outputs per scan:**
1. A structured report categorising every finding by risk tier (see §3)
2. For Tier A findings: a ready-to-merge PR with the fix and a one-line rationale
3. For Tier B findings: a draft PR with the proposed change and a confidence statement
4. For Tier C/D findings: a brief written up in the escalation format (see §5) — no code change attached

**Frequency:** See §6.

---

### Role B — Technical Reviewer / Gate

**What it does:** Reviews every proposed change produced by the Hygiene Auditor before it is eligible for merge. Acts as the final safety gate. Its job is to classify confidence and risk, not to re-write the fix.

**Gate questions it answers for every proposed change:**

| Question | Why it matters |
|---|---|
| Does this touch runtime behaviour? | Runtime changes are never Tier A regardless of simplicity |
| Does this touch Notion schema, field names, or DB IDs? | Schema changes need human verification |
| Does this touch auth or auth bypass logic? | Auth regressions are the highest-risk category in this repo |
| Does this introduce or change an environment variable? | Env var changes require deployment coordination |
| Does this violate any rule in `AGENTS.md`? | AGENTS.md is the ground truth for all hard rules |
| Is the fix high-confidence and mechanical, or speculative? | Speculative fixes must not auto-merge |
| Does `tsc --noEmit` pass after the change? | Mandatory for any structural change |
| Does the fix match the existing contract in `docs/NOTION_FIELD_CONTRACTS.md`? | Field renames must be confirmed against this doc |
| Is the change self-contained (no transitive effects)? | Changes with non-obvious downstream effects are Tier C minimum |

**What the Technical Reviewer is NOT permitted to do:**
- Change product behaviour
- Assume a field name is correct without confirming it in the field contracts doc
- Approve a Tier B or higher change without explicit human notification
- Skip `tsc --noEmit` for structural changes

---

### Role C — Decision Router (lightweight, not a separate agent)

Not a full agent role — just a defined escalation path. When the Hygiene Auditor finds a Tier C or D issue, the Technical Reviewer formats a Decision Brief (see §5) and routes it to the repo owner. The owner's response gates all further action on that finding.

---

## 3. Risk tiers

### Tier A — Safe auto-merge

**Definition:** Purely mechanical correction of a known-bad pattern with a known-good replacement. The fix is derivable entirely from `AGENTS.md`, `docs/NOTION_FIELD_CONTRACTS.md`, and the pre-merge sanity checklist. No product logic, no schema change, no auth change.

**Types of changes:**
- Correcting a stale priority/status/workspace string literal to match the field contract (e.g. `"P1"` → `"P1 Critical"`, `"Channel"` → `"Platform"`)
- Correcting a wrong property accessor where both the field type and the correct accessor are documented in the field contracts doc
- Removing a `window.location.reload()` and replacing with `router.refresh()` in a pattern already established elsewhere in the codebase
- Fixing a stale comment or JSDoc that contradicts the current implementation
- Updating a doc to reflect a completed refactor step
- Dead import removal after module extraction (confirmed by `tsc --noEmit`)
- Adding a missing `router.refresh()` call in the exact success-branch-only pattern documented in `AGENTS.md`

**Repo examples:**
- `"P1" || "Urgent"` → `"P1 Critical"` in `admin/page.tsx` filter and styling conditions
- `getContentPipeline()` reading `"Channel"` → `"Platform"` 
- `decisions-queue/route.ts` using `text()` on a `select` property → `sel()`
- `hall-data/route.ts` `PRIORITY_ORDER` using `"Urgent"/"Normal"` keys → `"P1 Critical"/"Medium"`

**Auto-fix:** ✅ Hygiene Auditor may propose  
**Auto-approve:** ✅ Technical Reviewer may approve without human review  
**Human notification:** Optional (weekly digest only, not per-change)

---

### Tier B — Safe PR, no auto-merge

**Definition:** Change is technically sound and likely correct, but involves more than a single literal substitution, touches a module boundary, or has a plausible (even if unlikely) behavioural side effect. Confidence is high but not absolute.

**Types of changes:**
- Adding `adminGuardApi()` to a route that is clearly admin-only (high confidence) but auth is a sensitive category
- Module extraction steps that pass `tsc --noEmit` clean and have no consumer import changes — mechanical but structural
- Aligning a Notion write path field name to match an existing read path (where the field name is confirmed in the contracts doc)
- Adding `router.refresh()` to a route where the server-component tree is complex enough that the audit cannot be 100% certain a stale render would result
- Consolidating a duplicated literal map into a shared constant
- Removing a dead code path confirmed by `tsc --noEmit` and grep

**Repo examples:**
- Extracting `projects.ts` or `people.ts` from `notion.ts` — clean typecheck, no consumer changes, but structural
- Adding `adminGuardApi()` to a new endpoint added in a feature branch
- Fixing `send-draft/route.ts` reading `"Draft Text"` → `"Content"` and `"Title"` → `"Draft Title"` (field contract confirmed, but it's a write path)

**Auto-fix:** ✅ Hygiene Auditor opens a draft PR  
**Auto-approve:** ❌ Human must approve or dismiss  
**Human notification:** ✅ Yes — a concise PR summary, not a full brief

---

### Tier C — Human judgment required

**Definition:** Change involves a decision that cannot be resolved from the contracts docs and AGENTS.md alone. It may be technically correct but requires product, business, or schema judgment to confirm.

**Types of changes:**
- A field contract that appears stale but could also reflect a legitimate Notion DB update not yet reflected in the doc
- An enum value that appears wrong in code but could be a legitimate exception or a DB value that was intentionally changed
- A new route that looks like it should have auth but could be intentionally public (edge cases not covered by `ROUTES_AND_SURFACES.md`)
- A client mutation that calls `router.refresh()` but the server component tree is ambiguous — might cause a flash or duplicate request
- Adding a missing `revalidatePath()` in a server action where the correct path is not obvious
- Any case where the Hygiene Auditor's confidence is below ~85%

**Auto-fix:** ❌  
**Auto-approve:** ❌  
**Human notification:** ✅ Yes — a Decision Brief (see §5), routed before any code is written

---

### Tier D — Do not auto-touch

**Definition:** Changes where automated action, even proposing a fix, introduces unacceptable risk of silent regression or irreversible damage.

**What belongs here:**
- Any change to Notion DB IDs in `DB` constants
- Any change to auth middleware (`src/middleware.ts`)
- Any change to the Clerk auth configuration or `require-admin.ts`
- Any new environment variable addition
- Any business logic change (pricing, routing rules, product behaviour)
- Any change to the Notion schema itself (property additions, renames, type changes) — must come from a human decision, never from automation
- Any speculative refactor where the agent is not certain what the current behaviour should be
- Any change to `vercel.json` cron schedules without corresponding skill/route verification

**Auto-fix:** ❌ Never  
**Auto-approve:** ❌ Never  
**Human notification:** ✅ Yes — flagged explicitly as "Do not act without explicit human instruction"

---

## 4. Auto-merge policy

### Changes eligible for automatic merge

All of the following must be true before auto-merge is allowed:
1. The change is classified Tier A by both the Hygiene Auditor and the Technical Reviewer
2. `tsc --noEmit` passes clean on the PR branch
3. The fix matches a documented contract in `AGENTS.md` or `docs/NOTION_FIELD_CONTRACTS.md`
4. The Technical Reviewer has re-read the changed files and confirmed no unintended side effects
5. No AGENTS.md rule is violated
6. The change is self-contained (no transitive dependency changes, no schema changes, no env var changes)

**Specific categories that may auto-merge:**
- Priority/status/workspace literal corrections confirmed against field contracts
- Wrong accessor corrections (e.g. `text()` → `select()`) confirmed against field contracts
- `window.location.reload()` → `router.refresh()` replacements
- Stale comment/JSDoc corrections that contradict current implementation
- Dead import removal after confirmed module extraction
- Doc updates reflecting completed refactor steps (e.g. marking a module as extracted in `NOTION_LAYER_REFACTOR_PLAN.md`)
- Missing `router.refresh()` in exact success-branch pattern from AGENTS.md

### Changes that must never auto-merge

- Any Notion DB schema change
- Any auth architecture change (middleware, guards, session logic)
- Any new environment variable
- Any change to business or product routing logic
- Any change where the correct value cannot be confirmed from an existing doc (speculative fixes)
- Any change touching `vercel.json`
- Any change touching `src/middleware.ts`
- Any change that adds a new dependency or changes `package.json`
- Any change to database IDs in `DB` constants

---

## 5. Decision policy for the non-technical owner

### When the owner is NOT asked

The owner is not involved in:
- Tier A changes (auto-merge)
- Tier B changes (they get a PR to approve or dismiss, not a brief — this is a "click approve" ask, not a judgment ask)

### When the owner IS asked

The owner is asked only when the finding cannot be resolved from the codebase alone:
- A contract question that requires a Notion DB lookup to confirm (e.g. "was this field renamed in Notion?")
- A product routing decision (e.g. "should this new route be public or admin-only?")
- A schema decision (e.g. "is this DB ID stale?")
- An irreversible operation (e.g. DB field deletion, env var change)
- Any Tier D finding

### Escalation brief format

When a Decision Brief is generated, it must follow this exact structure. Long briefs are rejected.

---

**Decision Brief — [one-line title]**

**File / location:** `src/app/api/some-route/route.ts`, line 47

**What the auditor found:**
This route does not call `adminGuardApi()` or check `CRON_SECRET`. It performs a POST mutation.

**Why this can't be resolved automatically:**
The route name (`/api/living-room/signals`) suggests it might be intentionally public (like other Living Room read routes), but it performs a write. `ROUTES_AND_SURFACES.md` does not document it.

**The two options:**
1. **Add `adminGuardApi()`** — if this is admin-only (most likely)
2. **Document as intentionally public** — if this is a pipeline/agent write route using a different auth pattern

**Your call:**
Which of the two above? Or explain the correct auth model for this route.

**Risk if left unaddressed:** Unauthenticated write access to Living Room data.

---

The owner's response to this brief is one sentence. The agent does not ask follow-up questions — it implements the indicated option.

---

## 6. Recommended operating cadence

| Trigger | What runs | Why |
|---|---|---|
| **Weekly (Monday, pre-standup)** | Full Hygiene Auditor scan → Tier A PR + Tier B draft PR + Tier C briefs | Catches drift accumulated over the week; low overhead for fast-moving solo repo |
| **On PR open** | Technical Reviewer gate only — no Hygiene Auditor scan | Validates that no AGENTS.md rule is violated in the incoming change |
| **On direct push to main** | Technical Reviewer retrospective scan of changed files only | Catches post-hoc regressions on hotfixes |
| **Monthly** | Full doc audit: `NOTION_FIELD_CONTRACTS.md` vs current `src/lib/notion/**` | Field contracts drift slowly; monthly is sufficient |

**What does NOT trigger a scan:**
- Branch pushes to feature branches (too noisy, wrong stage to fix)
- Draft PR updates (wait for ready-for-review)

**Solo repo note:** The weekly cadence is intentionally low-frequency. A daily scan on a fast-moving repo produces noise that trains the owner to ignore it. One sweep per week, with actionable outputs only, preserves trust in the system.

---

## 7. Suggested first implementation shape

The simplest version that is actually useful:

### v1 — Hygiene Auditor as a Claude Code skill (no CI, no pipeline)

**What it is:** A manually-triggered Claude Code skill (`/hygiene-audit`) that:
1. Runs the Tier A/B/C checks from §2A against the live codebase
2. Produces a structured markdown report grouped by tier
3. For Tier A findings: proposes the exact diff inline
4. For Tier B findings: flags them with a one-line confidence statement
5. For Tier C/D findings: produces a Decision Brief

**What it is not:**
- It does not automatically open PRs (v1)
- It does not auto-merge anything (v1)
- It does not run on a schedule (v1 — run manually once a week)

**Why this shape:**
- Zero infrastructure to set up
- The skill can be run in any Claude Code session in ~30 seconds
- Tier A fixes can be applied immediately in the same session
- The output is auditable before any change lands
- Trust is built before automation is added

### v2 — Add scheduled auto-merge for Tier A

Once v1 has been run ~4 times and the owner trusts the output:
- Add a weekly cron that runs the skill in a headless Claude Code session
- Auto-applies Tier A fixes and commits them with a standard message format
- Opens draft PRs for Tier B
- Posts Decision Briefs as GitHub issues for Tier C/D

### v3 — PR gate

Add the Technical Reviewer as a GitHub Actions check that:
- Runs on PR open
- Posts a risk classification comment
- Blocks merge if any AGENTS.md hard rule is violated

---

## 8. Safeguards

Before any automatic merge (Tier A), all of the following must pass:

| Safeguard | Mechanism |
|---|---|
| Re-read changed files | Technical Reviewer re-reads each edited file after the proposed change is applied |
| `tsc --noEmit` | Must pass clean — zero errors, zero new warnings |
| Pre-merge sanity checklist | Every item in `AGENTS.md` `pre-merge-sanity-checklist` evaluated for relevance and confirmed |
| No AGENTS.md rule violation | Technical Reviewer confirms each applicable rule in the file |
| Field contract match | For any Notion field reference, the field name is confirmed against `docs/NOTION_FIELD_CONTRACTS.md` |
| No schema drift | DB IDs and field names in the changed code match the current contracts doc exactly |
| Self-containment | No transitive effects — changed file is the only file affected, or all affected files are included in the same proposed change |
| High-confidence only | If the Reviewer's confidence is below ~85%, the change is promoted to Tier B minimum |

---

## 9. Recommended next step

**Create the `/hygiene-audit` skill as a Claude Code skill file.**

The skill should:
1. Load `AGENTS.md` and `docs/NOTION_FIELD_CONTRACTS.md` as its reference documents
2. Scan `src/app/api/**/route.ts` for missing auth guards
3. Scan `src/lib/notion/**` and inline API routes for field name references — cross-check against the contracts doc
4. Scan all `*.tsx` files for `window.location.reload()` and client mutations missing `router.refresh()`
5. Scan all files for the known-bad priority/status literals (`"P1"`, `"Urgent"`, `"Normal"` for Decision Items; `"Channel"` for Content Pipeline)
6. Output a tiered report: Tier A with exact proposed diffs, Tier B with confidence flags, Tier C with Decision Briefs

No CI, no GitHub Actions, no scheduled jobs yet. Just a skill that runs in 60 seconds and produces a list of concrete fixes.

Run it once a week. Apply Tier A fixes immediately. Treat the output as a pre-flight checklist before any feature work. Add automation only after the manual version proves its value.

The single question that determines whether this system is working: **does the weekly audit ever find a Tier A issue?** If it does, the system is preventing a future regression. If it runs clean for four weeks straight, the codebase hygiene is sound and the cadence can relax.
