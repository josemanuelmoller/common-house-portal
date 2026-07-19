# Branch convergence — diagnosis & plan

**Date:** 2026-07-19
**Status:** Diagnosis complete; execution pending owner decision (José)
**Repo:** `github.com/josemanuelmoller/common-house-portal` (single GitHub repo)

## Root cause (one line)

`fix/portal-no-notion-links` branched off an **old `main` (`d8a2025`)** and was **never rebased** after the Portal 2.0 merges (PRs #45–51) landed in `main`. This is not two repos and not a design conflict — it is **one branch that fell behind**.

## The map

Divergence point: **`d8a2025`** ("feat(stb): project linkage at ingest time…").

| | Hall line (`fix/portal-no-notion-links` + working-tree WIP) | Production (`origin/main`, head `134a0f1`) |
|---|---|---|
| Since divergence | **+5 commits**, **+34 uncommitted WIP** | **+30 commits, 72 files** |
| Contents | 5 Hall fixes + the "remove Notion writes" WIP | All of Portal 2.0 (Client Rooms, state-refresh, project memory) via PRs #45–51, plus others |

Note: production already absorbed PRs **#34 and #36** *from* `fix/portal-no-notion-links` earlier — so this branch was partially merged before, then continued with 5 more commits that are now stranded.

## Conflict surface (concrete)

**The 5 stranded Hall commits** touch 14 files; **8 also changed in production** → manual resolution:
`competitive-monitor`, `grant-monitor`, `grant-radar`, `portfolio-health`, `agent-scorecard`, `CompetitiveIntelClient.tsx`, `CompetitiveIntelPanel.tsx`, `package-lock.json`.
The 5 commits: feedback-loop (`proposal_outcomes`), competitive-monitor ×2, **form-data 4.0.5→4.0.6 (high CVE)**, routines admin-session 401 fix.

**The 34 WIP** = the "remove Notion writes" work (aligns with the Notion-cutoff hard rule):
- 2 deletions: `src/lib/notion-sync.ts`, `src/app/api/cron/sync-notion-mirror/route.ts`
- 32 modified; **7 also changed in production** → manual resolution: `compute-kpi`, `HallRevenueCard`, `HallOppFreshnessRadar`, `pipeline-state`, `plan.ts`, `xero-sync`, `package-lock`
- ~25 apply cleanly.

Total manual-resolution surface ≈ 15 files, spread across two pieces. Bounded, not catastrophic.

## Convergence plan — forward-only, small PRs onto `origin/main`

- **Phase A — relational-model (ready):** merge **PR #52** (6 ahead / 0 behind, no conflicts) + deploy. Independent.
- **Phase B — rescue the 5 stranded Hall commits:** rebase them onto `origin/main` in an isolated worktree, resolve the ~8 conflicts, verify `tsc` + `next build`, open a PR. **Contains the form-data CVE bump and the routines 401 fix — security/bug fixes missing from production.**
- **Phase C — land the "remove Notion" WIP:** commit the 34 WIP changes onto `origin/main`, resolve the ~7 conflicts, confirm the 2 deletions are still valid against prod, verify, open its own reviewable PR (biggest/riskiest piece).
- **Phase D — retire the stale branches:** once B and C merge, abandon `fix/portal-no-notion-links` and reset local `main` to `origin/main`. Thereafter always branch off `origin/main`.

Recommended order: **A → B → C → D.**

## DECISION — single working copy (explicit)

There are currently **two local clones of the same GitHub repo**, and this is the source of half the confusion:

1. `C:\Users\josem\OneDrive\Escritorio\Claude Code` — active dev/tooling dir (launch configs, Claude sessions). Currently on the stale `fix/portal-no-notion-links` line.
2. `C:\Users\josem\OneDrive\Documentos\New project\common-house-portal` — on `codex/portal-2-foundation` (the Portal 2.0 line that became `main`).

**Decision: keep exactly ONE working copy going forward — `C:\Users\josem\OneDrive\Escritorio\Claude Code`** (it holds the tooling and is the active session dir).

- As part of **Phase D**, reset this copy's `main` to `origin/main` and always cut new branches from `origin/main` here.
- **Retire the second clone** (`Documentos\New project\common-house-portal`): first confirm its `codex/portal-2-foundation` branch is fully pushed to origin (nothing local-only), then archive or delete that directory. Do **not** commit or deploy from it anymore.
- Rule from here on: **one working copy, always `git fetch` + branch off `origin/main`, no long-lived branches on a stale base.**

## Prevention

1. Never create long-lived branches on a stale `main` — `git fetch` and branch off `origin/main` every time.
2. One working copy only (see decision above).
3. Keep PRs small and rebased on current `main` so they never fall 30 commits behind again.
