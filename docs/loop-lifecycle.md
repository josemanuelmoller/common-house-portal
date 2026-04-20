# Loop Lifecycle

Internal engineering reference for the Loop Engine. Source of truth for status meanings, identity model, and reopen rules.

---

## Identity model

Loops have two tiers of identity:

| Field | Scope | Stable against |
|---|---|---|
| `normalized_key` | Page-level | Re-syncs of the same Notion page |
| `intent_key` | Semantic | Notion page re-creation, title rewrite |

**normalized_key** is `{entity_type}:{page_id}[:{variant}]`. It deduplicates within a single Notion record across multiple sync runs. Collision on insert = update, not insert.

**intent_key** is `{entity_type}:{entity_slug}:{loop_type}:{variant}:{content_slug}`. It groups loops describing the same underlying issue even when the Notion page ID changes (e.g., a regenerator deletes and recreates an Evidence record). On insert, the sync first tries to find an existing loop by `normalized_key`; if that misses, it tries `intent_key`. A hit on `intent_key` merges into the existing loop rather than creating a new one.

---

## Status meanings

| Status | DB value | Meaning |
|---|---|---|
| Open | `open` | Unresolved, no action taken yet |
| In Progress | `in_progress` | Actively being worked (user clicked "In progress") |
| Parked | `waiting` | Intentionally deferred — out of urgent queue; user clicked "Waiting" |
| Reopened | `reopened` | Was resolved or dismissed; new materially-different evidence arrived |
| Done | `resolved` | User confirmed it is complete |
| Dropped | `dismissed` | User decided not to act on it |

**Active surface** (`ACTIVE_LOOP_STATUSES`): `open`, `in_progress`, `reopened` — what the CoS Desk queries.

**Parked surface** (`PARKED_LOOP_STATUSES`): `waiting` — rendered separately in the compact Parked strip below the CoS Desk.

**Terminal**: `resolved`, `dismissed` — excluded from all live surfaces.

---

## Parked section

`status = 'waiting'` is a distinct DB state with its own surface. It is NOT mixed into the main CoS urgent queue. The Parked strip renders between the CoS Desk and the Radar, with Resume / Done / Drop buttons per item.

- Resume → transitions to `open` (status: "Needed" in the button API)
- Done / Drop → terminal (same as from the main desk)
- Auto-resolve never touches `waiting` loops — only `open` and `reopened` are eligible for auto-resolve

---

## Reopen gate

A resolved or dismissed loop is only reopened when all three conditions hold:

1. The loop was **auto-resolved** (system action, not user action) OR it was **user-dismissed AND the incoming signal type is different** from the prior one
2. The incoming evidence fingerprint is **materially different** from `last_evidence_fingerprint` (Jaccard similarity < 0.55)
3. The topic is **not founder-dropped** (`founder_interest != 'dropped'`)

**NULL fingerprint = conservative.** If `last_evidence_fingerprint` is NULL (legacy closed row with no baseline), the gate defaults to NOT materially new. This prevents legacy rows from flickering back on first re-sync. A signal-type change still overrides.

**Fingerprint seeding** happens at three points:
- Fresh insert: fingerprint is set from the incoming content
- Existing match where fingerprint is NULL: baseline is written on next sync (backfill)
- Done/Drop button press: title is snapshotted into fingerprint immediately, so the first post-close sync has a baseline

---

## Lineage

Every loop is born with `lineage_id = id` (self-referential). On reopen:
- `lineage_id` is preserved from the prior instance (same family)
- `reopen_count` is incremented
- `reopened_at` is stamped
- `parent_loop_id` is set to the prior loop's ID

This allows the UI to surface "Reopened ×N" context and trace a topic's full history.

---

## UI button → DB state mapping

| Button | DB status written | Timestamp set |
|---|---|---|
| In progress | `in_progress` | — |
| Waiting | `waiting` | — |
| Done | `resolved` | `resolved_at` |
| Drop task | `dismissed` | `dismissed_at` |
| Resume (Parked) | `open` | — |

---

## Known limitations

- **Historical duplicates**: Two rows about the same underlying topic but with different entity slugs (e.g., created before `intent_key` was introduced) are NOT auto-merged. Only additive backfill was applied in the Phase 1 migration.
- **Fingerprint backfill latency**: Open loops created before fingerprint seeding only get their baseline written the next time the 30-min sync cron touches them.
- **`in_progress` hides its own button**: A loop with `status = 'in_progress'` suppresses the "In progress" button but still shows Waiting and Done — consistent with standard kanban hygiene.
- **Notion-fallback tasks** (tasks not backed by a Loop Engine row): These do not have `loopEngineId` set. Status changes on these tasks call `/api/followup-status` and do not write to the loops table.
