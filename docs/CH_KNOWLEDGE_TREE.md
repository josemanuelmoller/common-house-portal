# Common House — knowledge tree taxonomy

The canonical structure of `public.knowledge_nodes`. Treat this document as the
contract: any change to the tree shape (add/remove a theme, rename a leaf,
reparent a subtheme) goes here in the same commit, and is mirrored in
`scripts/seed-knowledge-tree.ts`.

## Path convention

Nodes are addressed by hierarchical `path` strings. The depth column equals
the count of `/` separators.

| Depth | Role     | Example                              |
|-------|----------|--------------------------------------|
| 0     | Theme    | `reuse`                              |
| 1     | Subtheme | `reuse/packaging`                    |
| 2     | Subtheme | `reuse/packaging/refill`             |
| 3     | Leaf     | `reuse/packaging/refill/on-the-go`   |

`path` is `UNIQUE`. `parent_id` is resolved from the path (drop the last
segment). `slug` is the last segment.

## Body sections (leaf nodes)

Every leaf carries `body_md` with these standard `##` sections, in order:

1. `## Overview`
2. `## Available solutions`
3. `## How to implement`
4. `## Anti-patterns`
5. `## Case studies`
6. `## Stakeholder concerns`
7. `## References`

Curator writes are constrained to these section headings — see
`src/lib/knowledge-nodes.ts:appendBullet` for the dedup-aware write path.
Sub-sections (`###`) are allowed inside `Stakeholder concerns` (one per
function: IT, Quality, Operations, Legal, …) and inside facetted sections.

## Facets

A leaf MAY define `facets` (jsonb): a list of `{ section, subsections }`
objects that lock down the controlled vocabulary for `###` headings inside
that section. When a facet is defined, the curator MUST place a bullet in one
of the listed subsections (or escalate as a SPLIT proposal).

## Context axes

A leaf MAY define `context_axes` (text[]): cross-cutting dimensions that the
curator records on the bullet itself, not as a section heading. Examples:
`geography`, `format`, `consumer-type`, `regulatory-region`. Used by the
curator's ROUTE phase for keyword overlap scoring.

---

## Current taxonomy (20 nodes)

### `reuse` — Reuse

Cómo se diseña, opera y escala el reuso en distintos verticales.

| Path                                      | Title                | Notes |
|-------------------------------------------|----------------------|-------|
| `reuse/packaging`                         | Packaging            | Empaques reutilizables — refill, retornables, transporte reutilizable. |
| `reuse/packaging/refill`                  | Refill               | EMF taxonomy. User refills their own container. Two modes below. |
| `reuse/packaging/refill/on-the-go`        | Refill on the go     | Leaf. Dispenser in-store, bulk stations, BYO container. |
| `reuse/packaging/refill/at-home`          | Refill at home       | Leaf. Reusable applicator + solid/concentrate refill. |
| `reuse/packaging/return`                  | Return               | EMF taxonomy. Container goes back to the producer. |
| `reuse/packaging/return/on-the-go`        | Return on the go     | Leaf. Customer drops at point (RVM, deposit scheme). |
| `reuse/packaging/return/from-home`        | Return from home     | Leaf. Empty container picked up at the customer's address. |
| `reuse/packaging/transit`                 | Transit packaging    | Cajas, pallets, totes, containers reutilizables. |
| `reuse/construction`                      | Construction         | Demolición selectiva, mercados de segunda. |
| `reuse/electronics`                       | Electronics          | Refurb, partes, segunda vida. |
| `reuse/secondhand`                        | Secondhand & peer-to-peer | Plataformas de reventa y trueque. |
| `reuse/textile`                           | Textile              | Reventa, remake, alquiler. |

### `organics` — Organics

Tratamiento y valorización de orgánicos — de fuente doméstica a industrial.

| Path                          | Title         | Notes |
|-------------------------------|---------------|-------|
| `organics/biodigestor`        | Biodigestor   | Digestión anaeróbica — biogás y digestato. |
| `organics/compost`            | Compost       | Aeróbico, tambor, industrial. |
| `organics/compost/bsf`        | BSF composting | Leaf. Black Soldier Fly — bioconversión a proteína animal. |

### `new-materials` — New materials

Materiales alternativos — biomateriales, sustitutos de plásticos y compuestos
emergentes.

| Path                                               | Title                                 | Notes |
|----------------------------------------------------|---------------------------------------|-------|
| `new-materials/biomaterials`                       | Biomaterials                          | PHA, PLA, micelio, algas. |
| `new-materials/biomaterials/certification-standards` | Certification standards and regulatory frameworks | Leaf. |

---

## Adding a new node

1. Decide depth and parent path. Stop at 3 unless there is a real
   sub-classification need (the curator is tuned for depth ≤ 3).
2. Add the row to `scripts/seed-knowledge-tree.ts` (idempotent
   `INSERT ... ON CONFLICT (path) DO NOTHING`).
3. Update the table above.
4. Optionally pre-populate `summary`. `body_md` can stay empty — the curator
   stubs the seven standard sections on first APPEND.
5. If the node defines `facets` or `context_axes`, document the vocabulary
   in this file directly under the node entry.

## Removing or renaming a node

Don't `DELETE`. Set `status = 'Archived'` so changelog references don't
dangle. If you must rename, update both `path` and `slug` in a migration and
run the seed script — the script is idempotent on `path` so it won't double-insert.
