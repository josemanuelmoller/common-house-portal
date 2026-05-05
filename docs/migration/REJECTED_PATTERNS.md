# Rejected patterns — do NOT propose these

This document exists so that future Claude sessions (or humans) don't
spend hours re-litigating decisions that were already made and rejected.

If you are reading this and you are about to propose one of the patterns
below, **stop**. The owner has already considered it and chosen
otherwise. The "Why rejected" section explains the reasoning. If your
context truly invalidates that reasoning, escalate to the owner before
acting — don't unilaterally reverse the call.

---

## R-001 — Write-through mirror (Notion + Supabase coexist forever)

**Date rejected:** 2026-05-05
**Decided by:** Jose Manuel Moller
**See also:** `docs/SUPABASE_CONSOLIDATION_FREEZE.md` §11

### The pattern (what was tried)

A parallel session on `main` extended `src/lib/notion-mirror-push.ts`
(+527 lines) and `src/lib/notion-push.ts` (+653 lines) to make every
agent and skill write to Supabase first and then mirror-push the same
row into Notion via the extended helpers. Hall surfaces continued to
read through the mirror layer. Notion remained a perpetual co-source
of truth.

Commit fingerprints (on main, before reject):
- `8b4ad52 feat(hall): Phase 4 — all Hall reads served from Supabase`
- `d9d844d feat(hall): Phase 3 full — all skills/agents write to Supabase first`
- `6431c64 feat(hall): Phase 4 wave 1 — extend mirror push to Pattern B + 4 endpoints`
- `f0b86c5 feat(hall): Phase 4 wave 2 — agent operators write through mirror`

### Why rejected

1. **Cost compounds, never resolves.** Two writers per record means two
   schema drift surfaces, two failure modes, two audit trails. The
   surface area only grows over time as new fields are added.
2. **Cutoff becomes infinite.** The freeze plan
   (`docs/SUPABASE_CONSOLIDATION_FREEZE.md`) sets 2026-06-02 as the day
   Notion goes read-only. Write-through has no cutoff — the mirror is
   load-bearing forever. That is the same problem we started with.
3. **Sync is a permanent maintenance tax.** Every minute of engineering
   on `notion-mirror-push.ts` is engineering not spent on the OS v2
   improvements that actually move the business. The freeze direction
   is the only one that lets us delete this code, not extend it.
4. **The owner ran the cost-benefit and chose freeze.** Re-litigating
   that decision because a particular code change is "easier" with
   write-through is exactly the failure mode this document prevents.

### Symptoms a future session is heading toward this pattern

- Adding new exports to `src/lib/notion-mirror-push.ts`,
  `src/lib/notion-mirror.ts`, or `src/lib/notion-push.ts`.
- Adding new `notion.pages.create` / `notion.pages.update` /
  `notion.databases.update` / `notion.blocks.children.append` call sites
  anywhere in `src/`.
- Restoring deleted code from these files because "the mirror still
  needs to know about X."
- "We can't delete the mirror until everyone migrates" reasoning that
  ends with leaving the mirror in place indefinitely.

### What to do instead

If you find a real Hall surface that still reads from the mirror after
the freeze direction shipped, the correct move is:
1. Migrate that surface to read directly from the canonical Supabase
   table per `docs/SUPABASE_CONSOLIDATION_FREEZE.md` §3.
2. Once nothing reads the mirror, delete the mirror code and the
   `notion_*` mirror tables (`notion_decision_items`,
   `notion_daily_briefings`, `notion_insight_briefs`,
   `notion_watchlist`, `notion_competitive_intel`,
   `notion_agent_drafts`, `notion_content_pipeline`, `notion_sync_runs`).
3. Confirm with `git grep "@notionhq/client" src/` that nothing in
   `src/` still imports the Notion client outside of one-off legacy
   archive viewers.

---

## R-002 — Deleting Phase 1 migration SQL files from the repo

**Date rejected:** 2026-05-05
**Decided by:** Jose Manuel Moller

### The pattern

The same parallel session deleted the six Phase 1 migration SQL files
under `supabase/migrations/2026050512*.sql` from the repo. The schema
remained applied in Supabase prod (`commonhouse` project, ref
`rjcsasbaxihaubkkkxrt`) but the SQL artifacts were gone from the repo.

### Why rejected

A schema with no migration files in the repo is a schema you cannot
reproduce on a fresh environment. The migration files are the canonical
record of how prod got to its current shape. Deleting them is destroying
audit trail.

### What to do instead

If a Phase 1 migration is "redundant" because a later migration
supersedes it, **leave the older file in place**. Migrations are
append-only; the chain is the history. If you need to alter a column
that an older migration created, write a new migration that does the
alter — don't go back and edit the old one and don't delete it.

---

## R-003 — Domain-tagging gating contact creation forever

**Date noted:** 2026-05-05 (during Engatel data fix)

### The pattern

The Gmail observer creates `people` rows only for emails on already-classified
domains. If a domain is tagged Client AFTER the email observations were
recorded, the observations stay orphaned: the `people` rows are never
created, the `hall_organizations` row shows "0 contacts · 0 touches ·
last never" even though there were 80+ messages in the system.

This was the visible symptom for Engatel: the org existed, the
engagement existed, the WhatsApp messages existed, but the contacts
table was empty because none of those emails had been on a tagged
domain at the time of ingest.

### Why this is a bug, not a feature

Domain classification is a slow human signal that lags evidence by
weeks or months. Refusing to create contacts until classification
arrives means the system is permanently behind the actual relationship
state. By the time you classify Engatel as Client, the historical
contacts are invisible — exactly when you need them.

### What to do instead

Trigger a backfill from `hall_email_observations`,
`hall_transcript_observations`, and `conversation_messages` whenever:
- `hall_organizations.relationship_classes` changes
- A new `engagements` row is created
- `approveRelationshipClassification` resolves a decision_item

Plus: schedule a daily reconciler that walks all classified domains
and ensures every observed email has a `people` row.

The reusable function lives in `src/lib/promote-people-from-observations.ts`
(if it does not exist yet, create it and wire from the four trigger
points above).
