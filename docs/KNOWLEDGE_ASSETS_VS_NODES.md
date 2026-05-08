# Knowledge assets vs knowledge nodes — policy

The OS v2 stores reusable knowledge in two related tables that are easy to
confuse:

- `public.knowledge_nodes` — hierarchical domain tree (themes / subthemes /
  leaves with body_md). Owner agent: `knowledge-curator`. Mutable via
  `appendBullet()`, `updateNodeBody()`, `appendChangelog()`.
- `public.knowledge_assets` — a flat catalogue of reusable rules /
  playbooks distilled from validated evidence (e.g. "Refill SKU pricing must
  carry a unit-price disclaimer in Chile"). Owner agent: `update-knowledge-asset`.
  Mutable via canonical write helpers; proposal-first.

This doc pins the contract for when to use which, and how the two relate.

## When to write to `knowledge_nodes`

Write to a node when the insight is a **domain pattern** that any project
in the same theme would benefit from. The bullet should describe the
domain, not the project that surfaced it.

Examples:

- "Cardboard tube format offers the lowest tooling cost (USD 5,000) vs flow
  pack (USD 28,500) — most capital-efficient for solid refill launch."
  → `reuse/packaging/refill/at-home`
- "BSF substrate moisture <60% kills larvae within 48h."
  → `organics/compost/bsf`
- "DRS UK schemes report ≥85% return rates after 12 months when deposit
  ≥ £0.20."
  → `reuse/packaging/return/on-the-go`

`knowledge-curator` writes these via APPEND under one of the standard
sections (Overview / Available solutions / How to implement / Anti-patterns /
Case studies / Stakeholder concerns / References).

## When to write to `knowledge_assets`

Write a `knowledge_asset` when the insight is a **canonical rule** that
needs human approval before reuse. Assets are heavier than node bullets:
they carry `summary`, `body_md`, `asset_type`, and `status`.

Typical asset types:

- `Decision rule` — "If X then Y" rules that gate action.
- `Playbook` — multi-step process distilled across projects.
- `Insight` — synthesised pattern that doesn't fit a leaf yet.
- `Reference` — canonical source (paper, regulation) summarised once for
  reuse.

Assets are created at `status='Draft'`. Promotion to `Active` is a human
gate. `update-knowledge-asset` only proposes deltas — it never writes
directly to a Draft / Active asset.

## Required link: assets ↔ nodes

**Hard rule for new assets created from 2026-05-08 onward:**

`knowledge_assets.knowledge_node_id` MUST be populated whenever the asset
clearly belongs under a leaf in `knowledge_nodes`. If the asset spans
multiple themes or no leaf is a clear fit, leave `knowledge_node_id` NULL
and surface a SPLIT proposal in `knowledge_node_changelog` (so the curator
can create a leaf and the asset can be re-pointed).

Why: today many assets exist with `knowledge_node_id IS NULL`, which
fragments search ("show me everything we know about refill") and makes the
admin tree feel emptier than it is. The curator and the asset writer
operate on the same evidence stream; they should converge on the same
taxonomy.

Implementation hooks:

- `update-knowledge-asset` MUST resolve a target leaf path (matching by
  `affected_theme`, `topics`, or evidence's parent project's primary
  domain) and pass `knowledge_node_id` into the canonical write.
- `knowledge-curator` MUST emit a SPLIT proposal whenever it sees an asset
  with `knowledge_node_id IS NULL` whose evidence routes to a non-existing
  leaf — so a human can confirm the leaf creation and the relink in one
  decision.

## Querying both together

Search of "everything Common House knows about refill on the go" should
fan-out to:

```sql
SELECT 'node' AS kind, id, path AS locator, title, summary
FROM   public.knowledge_nodes
WHERE  path LIKE 'reuse/packaging/refill/on-the-go%'

UNION ALL

SELECT 'asset' AS kind, id, asset_type AS locator, title, summary
FROM   public.knowledge_assets
WHERE  knowledge_node_id IN (
  SELECT id FROM public.knowledge_nodes
   WHERE path LIKE 'reuse/packaging/refill/on-the-go%'
);
```

If many assets show up with `knowledge_node_id IS NULL` in such a query,
the writer agents are violating the hard rule above — open a hygiene task.

## Migration path for existing rows

1. Run a one-off audit:
   ```sql
   SELECT count(*) FROM public.knowledge_assets WHERE knowledge_node_id IS NULL;
   ```
2. For each asset, propose a leaf via curator's ROUTE phase logic and
   surface the proposed link as a `decision_items` row of type
   `link_asset_to_node` for human approval.
3. Once linked, update the asset row.

This audit is a follow-up; it is NOT part of the os-runner cadence.
