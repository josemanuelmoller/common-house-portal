# Phase 2 Backfill Runbook

**Script:** `scripts/final-notion-backfill.ts`
**Phase:** 2 of 7 (Supabase consolidation — see `docs/SUPABASE_CONSOLIDATION_FREEZE.md`)
**Target completion:** 2026-05-13
**Owner:** Jose Manuel Moller

This is the operator guide for the one-shot Notion → Supabase backfill. The
script is idempotent and resumable; the runbook is not. Read it end-to-end
before the first execute.

---

## 1. What this script moves

| Source (Notion) | Target (Supabase) |
|---|---|
| 22 OS v2 DBs in `src/lib/notion/core.ts DB` | Their canonical Supabase tables per freeze §3 |
| Organisations [master] (legacy) `26c45e5b…cbed` | Merged into `organizations` via name+domain dedup |
| Deals (legacy) `26f45e5b…59be` | Loaded into `engagements` (won) — see open TODO §6 |
| Projects [master] (legacy) `26c45e5b…2a33` | Merged into `projects` via name dedup |

Out of scope:
- No writes to Notion.
- No deletes anywhere.
- No mirror-table promotion (Phase 4 owns that).
- No agent rewrites (Phase 3).

## 2. Pre-flight

Before the first dry-run:

1. **Phase 1 schema must be applied.** Confirm in Supabase that every table
   in freeze §3 exists with at least `notion_id` (PK), `legacy_notion_id`,
   and `updated_at`. Tables that need a `payload jsonb` column for the
   generic mapper:
   - `engagements`, `sources`, `evidence`, `people`, `decision_items`,
     `knowledge_assets`, `insight_briefs`, `content_pipeline_items`,
     `style_profiles`, `valuations`, `cap_table_entries`,
     `data_room_documents`, `financial_snapshots`, `proposal_briefs`,
     `offers`, `opportunities`, `grant_sources`, `agent_drafts`,
     `daily_briefings`, `watchlist_entities`, `competitive_intel`,
     `conversations`.
   These rows are stuffed into `payload` as JSONB until Phase 4 binds named
   columns. If `payload` is missing, the upsert will error and the manifest
   will record one `skipped` entry per row in that batch.
2. **Env vars present** (`.env.local` or shell):
   - `NOTION_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (preferred; bypasses RLS — required after Phase 1
     enables RLS on every public table)
3. **Verify which Vercel/Supabase project is target.** Per freeze hard rule:
   confirm `SUPABASE_URL` matches the project that serves
   `portal.wearecommonhouse.com`. Do not assume the locally linked project
   is the production project.
4. **Resolve open TODOs in the script** (search for `TODO:` in
   `scripts/final-notion-backfill.ts`):
   - `DB.engagements` placeholder — replace with the real Engagements / CH
     Startup Relationships DB id (`289f7075…1ae9` per freeze §3.1).
   - `DB.conversations` empty string — wire up the Conversations [OS v2] DB
     id once provisioned. Until then the `conversations` table is skipped.
   - Deals legacy → engagements/opportunities split — currently emits all
     legacy deals to `engagements` only. If active deals must instead route
     to `opportunities`, add a Deal Status filter in `mapGeneric` for the
     deals DB.

## 3. Run modes

### Dry-run (default)

```bash
npx tsx scripts/final-notion-backfill.ts
```

- Reads from Notion only.
- Does not connect to Supabase.
- Writes a manifest to `tmp/backfill-manifest-<ISO>.json`.
- Prints a per-table summary.

### Execute

```bash
npx tsx scripts/final-notion-backfill.ts --execute
```

- Same reads as dry-run.
- Upserts batches of 50 to Supabase keyed on `notion_id`.
- Writes the manifest at the end (with per-batch `skipped` entries on error).

### Single-table mode (testing)

```bash
npx tsx scripts/final-notion-backfill.ts --only=organizations
npx tsx scripts/final-notion-backfill.ts --only=organizations --execute
```

Useful for validating Engatel as the dedup test case (see §6) before running
the full set.

## 4. Expected runtime

Rough order-of-magnitude estimate, dominated by Notion read pagination:

| Volume | Estimated runtime |
|---|---|
| ~5,000 OS v2 rows + ~2,000 legacy = ~7,000 reads | 8–15 min on a warm Notion API |
| 50-row Supabase upsert batches (~140 batches) | +1–3 min |

Plan for 20 minutes wall-clock for an `--execute` run. The script logs
progress every batch and every 500 fetched pages.

## 5. Manifest format

`tmp/backfill-manifest-<ISO>.json`:

```json
{
  "startedAt": "...",
  "finishedAt": "...",
  "mode": "dry-run" | "execute",
  "only": null | "organizations",
  "counts": { "imported": N, "merged": N, "skipped": N, "conflict": N },
  "entries": [
    { "table": "organizations", "action": "imported", "notion_id": "...", "name": "..." },
    { "table": "organizations", "action": "merged", "notion_id": "<osv2>", "legacy_ids_merged": ["<legacy1>", "<legacy2>"], "name": "Engatel" },
    { "table": "organizations", "action": "conflict", "notion_ids": ["<a>", "<b>"], "reason": "Multiple OS v2 records share name+domain ..." },
    { "table": "evidence", "action": "skipped", "notion_id": "...", "reason": "Upsert error: column \"payload\" does not exist" }
  ]
}
```

### Handling each action

- **imported** — single record landed cleanly. No action needed.
- **merged** — multiple Notion records collapsed into one Supabase row. Audit
  by spot-checking the OS v2 row in Supabase against the listed
  `legacy_ids_merged`.
- **skipped** — row could not be written. Read the `reason`; usual causes:
  schema column missing, RLS blocking, malformed Notion property. Fix the
  cause and re-run with `--execute` (idempotent).
- **conflict** — **human review required**. Two OS v2 records share the same
  normalised name + domain. The script keeps the most-recently-edited one
  and drops the rest from the upsert. Resolve by:
  1. Open both Notion pages by their IDs.
  2. Decide which is canonical; merge content into it manually in Notion.
  3. Archive (do not delete) the other.
  4. Re-run the script. The conflict should disappear.

The script does NOT auto-merge OS v2 conflicts because that would silently
collapse intentionally-distinct records (e.g. two orgs that share a name in
different geographies).

## 6. Verification

### After the dry-run

1. Open the manifest. Confirm:
   - `counts.conflict` is 0 (or you understand each one).
   - Every canonical table has a non-zero `imported` count where you expect
     data.
2. Search the manifest for "Engatel" — there should be at least one `merged`
   entry combining the legacy Organisations [master] records into the OS v2
   Organizations record.

### After the execute

Run from the production environment (per the freeze hard rule):

1. **Row counts.** Compare Supabase row count vs Notion fetched count from
   the script's per-table log line (`Notion: N OS v2 + M legacy`). Allow for
   `merged` reductions. Quick check via Supabase MCP:
   ```sql
   SELECT count(*) FROM organizations;
   SELECT count(*) FROM organizations WHERE legacy_notion_id IS NOT NULL;
   ```
2. **Engatel spot check** (the canonical dedup test case). In Supabase:
   ```sql
   SELECT notion_id, legacy_notion_id, name, domain, relationship_classes
   FROM organizations
   WHERE lower(name) = 'engatel';
   ```
   Expected: exactly **one** row, `notion_id` = the OS v2 Engatel page id,
   `legacy_notion_id` populated with the most-recently-edited legacy id.
3. **Production API smoke.** Hit the read route that consumes
   `organizations` from production and confirm it returns Engatel:
   ```bash
   curl -s https://portal.wearecommonhouse.com/api/hall-organizations \
     | jq '.organizations[] | select(.name | test("Engatel"; "i"))'
   ```
   `200 OK` with empty result is a failure condition — keep debugging.
4. **Re-run the script.** Idempotency check: a second `--execute` must
   produce the same row counts and zero new errors. Skipped/imported splits
   may differ slightly (every row appears as imported on the second run if
   no merge happens) but no data should regress.

## 7. Failure recovery

The script is safe to interrupt and resume because every upsert keys on
`notion_id`. Crash mid-run? Re-run the same command; rows already written
will upsert in place, missing rows will be added.

A failed batch logs its error and emits one `skipped` manifest entry per row
in the batch, then continues. The final manifest tells you exactly which
rows did not write — fix the underlying cause (almost always a missing
column or RLS policy on the target table), then re-run.

If a table is structurally broken (e.g. `payload` column not yet added), use
`--only=<table>` after the schema fix instead of re-running the full set.

## 8. After backfill is verified

1. Commit the manifest (or the hash of it) to `docs/migration/` for the
   audit trail. Do NOT commit `tmp/backfill-manifest-*.json` — keep manifests
   out of the repo and store them in the team drive.
2. Mark Phase 2 done in `docs/MIGRATION_STATUS.md`.
3. Hand off to Phase 3 (agent rewrites) and Phase 4 (API route migration).
   Do NOT delete any Notion content yet — the freeze keeps Notion as
   read-only archive through and beyond cutoff.

## 9. Open TODOs (must close before final execute)

| ID | Description | Where |
|---|---|---|
| 1 | Confirm `DB.engagements` real DB id (`289f7075…1ae9`) | `scripts/final-notion-backfill.ts` near line 110 |
| 2 | Confirm or wire up `DB.conversations` DB id | same file, near line 113 |
| 3 | Decide deals legacy split: route active deals to `opportunities`, won deals to `engagements` | mapper for the deals legacy DB |
| 4 | Confirm Phase 1 added `payload jsonb` to every table listed in §2 — or replace `mapGeneric` with table-specific mappers | mappers section |
| 5 | Confirm Supabase RLS service-role bypass works under the env keys actually used | env validation block |

These are intentionally explicit so the operator does not run `--execute`
with placeholders. The script logs `(skipped — no DB id configured)` for
tables whose DB id resolves to an empty string, so partial readiness is
safe.
