# Notion Layer Refactor Plan

`src/lib/notion.ts` modularisation — planning document only. No code changes.

Last reviewed: 2026-04-14

---

## 1. Current State

### What the file contains

`src/lib/notion.ts` is 2,061 lines and contains every Notion data-access concern
in the portal. It is structured in loose comment-delimited sections:

| Section | Approx. lines | Contents |
|---|---|---|
| Core | 1–56 | `notion` client, `DB` constants map (22 databases) |
| Type helpers | 162–205 | 9 private helper functions: `prop`, `text`, `select`, `multiSelect`, `num`, `checkbox`, `date`, `relationFirst`, `relationIds` |
| Projects | 60–340 | `Project`, `ProjectCard` types; `parseProject`, `getAllProjects`, `getProjectById`, `fetchAllEvidence` (internal), `getProjectsOverview` |
| Evidence | 342–428 | `EvidenceItem` type; `getEvidenceForProject`, `getAllEvidence`, `getReusableEvidence` |
| Sources | 430–508 | `SourceItem`, `DocumentItem` types; `parseSource`, `getSourcesForProject`, `getAllSources`, `getDocumentsForProject` |
| People & Orgs | 510–701 | `PersonRecord`, `OrgRecord`, `ProjectPeople`, `ResidentRecord` types; `resolvePerson`, `resolveOrg`, `getProjectPeople`, `getAllPeople`, `getAllResidents` |
| Knowledge | 703–785 | `KnowledgeAsset` type; `getKnowledgeAssets`, `createKnowledgeAssetDraft` |
| Source Activity / Stats | 787–907 | `MeetingItem`, `SourceActivity`, `DashboardStats` types; `getSourceActivity`, `getDashboardStats` |
| Decisions | 909–1045 | `DecisionItem` type (complex, with embedded metadata); `getDecisionItems` |
| Insight Briefs | 1047–1088 | `InsightBrief` type; `getInsightBriefs` |
| Living Room reads | 1090–1202 | `LivingRoomPerson`, `LivingRoomMilestone`, `LivingRoomTheme` types; `getLivingRoomPeople`, `getLivingRoomMilestones`, `getLivingRoomThemes` |
| Content Pipeline | 1204–1302 | `StyleProfile`, `ContentPipelineItem` types; `getContentPipeline`, `getStyleProfiles` |
| Living Room writes | 1304–1347 | `updatePersonVisibility`, `updateProjectLivingRoom`, `updateInsightBriefCommunityFlag`, `updateKnowledgeAssetTheme` |
| Garage financial | 1349–1618 | `StartupOrgData`, `FinancialSnapshot`, `ValuationRecord`, `CapTableEntry`, `DataRoomItem` types; `getPrimaryOrgIds`, `getStartupOrgData`, `getFinancialsForProject`, `getValuationsForProject`, `getCapTableForProject`, `getDataRoomForProject` |
| Commercial | 1620–1685 | `ProposalBrief`, `CommercialOffer` types; `getProposalBriefs`, `getCommercialOffers` |
| Briefings | 1687–1730 | `DailyBriefing` type; `getDailyBriefing` |
| Agent Drafts | 1732–1774 | `AgentDraft` type; `getAgentDrafts` |
| Opportunities | 1776–1863 | `OpportunityItem` type; `getOpportunitiesByScope`, `getFollowUpOpportunities` |
| Commercial pipeline | 1865–1933 | `PipelineOpportunity` type; `getPipelineOpportunities`, `page_last_edited_after` |
| Relationship warmth | 1935–1975 | `WarmthRecord` type; `getColdRelationships` |
| Ready content | 1977–2008 | `ReadyContent` type; `getReadyContent` |
| Garage portfolio | 2010–2059 | `getPortfolioOpportunities` |

Notable: Living Room reads (line 1090) and Living Room writes (line 1304) are separated
by the entire Content Pipeline section (lines 1204–1302).

### Why it is becoming hard to maintain

1. **No domain isolation.** A change to the Agent Drafts schema requires finding the
   right 40-line block inside a 2,000-line file. Any typo or merge conflict in an
   unrelated section puts the whole data layer at risk.

2. **Private helpers are global.** The 9 helper functions (`prop`, `text`, etc.) are
   defined once near the top and used by every section. They cannot be typed or
   tested in isolation. A change to `text()` affects all 22 databases.

3. **API routes import `DB` and `notion` directly.** Many pipeline routes bypass the
   typed query functions entirely and build raw Notion queries inline, using the
   `DB` map exported from this file. This means the DB IDs and the typed layer are
   coupled in a single file.

4. **Cross-domain aggregates are buried.** `getProjectsOverview()` calls
   `fetchAllEvidence()` (evidence domain) and `getAllSources()` (sources domain),
   but all three live in the same flat file. There is no way to see the dependency
   without reading the whole function body.

5. **Living Room reads and writes are split by 200 lines.** The admin write helpers
   for Living Room (lines 1304–1347) are separated from the read helpers (lines
   1090–1202) by the entire Content Pipeline section. Logical cohesion is gone.

6. **Agent clarity.** An agent asked to "fix the Garage financial layer" must load
   and parse 2,000 lines to find the 270-line block it needs. This causes token
   waste and increases the risk of accidental edits to unrelated sections.

### What kinds of changes are risky in the current structure

- Renaming a shared helper (`text`, `select`) — affects all 22 databases silently
- Adding pagination to `getAllEvidence` — `getProjectsOverview` uses an internal
  private version (`fetchAllEvidence`) with a cursor loop; the public `getAllEvidence`
  does not — easy to confuse
- Adding a new OpportunityItem field — the type is mapped in three separate functions
  (`getOpportunitiesByScope`, `getFollowUpOpportunities`, `getPipelineOpportunities`,
  `getPortfolioOpportunities`); updating only some of them causes field drift
- Any change to the `DB` map — immediately affects every API route that imports
  `{ DB }` from this file

---

## 2. Proposed Target Structure

```
src/lib/notion/
├── core.ts          ← notion client, DB constants, 9 prop helpers
├── projects.ts      ← Project, ProjectCard, DashboardStats + queries
├── evidence.ts      ← EvidenceItem + queries
├── sources.ts       ← SourceItem, DocumentItem, MeetingItem, SourceActivity + queries
├── people.ts        ← PersonRecord, OrgRecord, ProjectPeople, ResidentRecord, WarmthRecord + queries
├── knowledge.ts     ← KnowledgeAsset + queries + createKnowledgeAssetDraft (write)
├── decisions.ts     ← DecisionItem + getDecisionItems (complex metadata parser)
├── insights.ts      ← InsightBrief + getInsightBriefs
├── living-room.ts   ← LivingRoom* types + reads + admin writes (co-located intentionally)
├── content.ts       ← StyleProfile, ContentPipelineItem, ReadyContent + queries
├── commercial.ts    ← ProposalBrief, CommercialOffer, OpportunityItem, PipelineOpportunity + queries
├── garage.ts        ← StartupOrgData, FinancialSnapshot, Valuation, CapTable, DataRoom + queries
├── briefings.ts     ← DailyBriefing + getDailyBriefing
├── drafts.ts        ← AgentDraft + getAgentDrafts
└── index.ts         ← barrel: re-exports everything (compatibility shim)
```

The old `src/lib/notion.ts` becomes a one-line re-export:
```typescript
export * from "./notion/index";
```

This means no existing import breaks during migration.

---

### `core.ts`

**Purpose:** Sole owner of the `notion` client and the `DB` constants. Contains the
9 helper functions shared across all domains.

**Exports:**
```typescript
export const notion: Client
export const DB: Record<string, string>  // 22 database IDs
export function prop(page, key): any
export function text(p): string
export function select(p): string
export function multiSelect(p): string[]
export function num(p): number | null
export function checkbox(p): boolean
export function date(p): string | null
export function relationFirst(p): string | null
export function relationIds(p): string[]
```

**Note:** The helpers are currently unexported private functions. They must be exported
from `core.ts` so domain modules can import them. This is the only behavioral change
during extraction — visibility change only, no logic change.

**Import pattern for all other modules:**
```typescript
import { notion, DB, prop, text, select, ... } from "./core";
```

---

### `projects.ts`

**Purpose:** All queries that target `DB.projects` as their primary database.

**Exports:**
- Types: `Project`, `ProjectCard`, `DashboardStats`
- Functions: `parseProject` (can remain private or be exported), `getAllProjects`,
  `getProjectById`, `getProjectsOverview`, `getDashboardStats`

**Cross-module dependency:** `getProjectsOverview` calls `fetchAllEvidence` (evidence
domain cursor loop) and `getAllSources` (sources domain). After extraction:
```typescript
// projects.ts
import { fetchAllEvidence } from "./evidence";
import { getAllSources } from "./sources";
```

`fetchAllEvidence` must be exported from `evidence.ts` (currently private). It is a
raw pagination helper — exporting it is safe as long as it is not confused with the
public `getAllEvidence`.

`getDashboardStats` also queries `DB.evidence` directly. Move it here rather than
`evidence.ts` since it is an aggregate stat, not a pure evidence query.

---

### `evidence.ts`

**Purpose:** All queries that target `DB.evidence` as their primary database.

**Exports:**
- Types: `EvidenceItem`
- Functions: `fetchAllEvidence` (pagination cursor loop, exported for `projects.ts`),
  `getEvidenceForProject`, `getAllEvidence`, `getReusableEvidence`

**Note:** `fetchAllEvidence` fetches all evidence without filters. It is used only by
`getProjectsOverview`. Naming it clearly (not `getAllEvidence`) avoids confusion with
the public filtered version.

---

### `sources.ts`

**Purpose:** All queries that target `DB.sources`.

**Exports:**
- Types: `SourceItem`, `DocumentItem`, `MeetingItem`, `SourceActivity`
- Functions: `parseSource` (can be private), `getSourcesForProject`, `getAllSources`,
  `getDocumentsForProject`, `getSourceActivity`

No cross-module dependencies. Pure sources queries.

---

### `people.ts`

**Purpose:** All queries for `DB.people` and `DB.organizations`. Includes the
relationship warmth queries since `getColdRelationships` targets `DB.people`.

**Exports:**
- Types: `PersonRecord`, `OrgRecord`, `ProjectPeople`, `ResidentRecord`, `WarmthRecord`
- Functions: `resolvePerson` (private or exported), `resolveOrg` (private or exported),
  `getProjectPeople`, `getAllPeople`, `getAllResidents`, `getColdRelationships`

**Cross-module dependency:** `getAllResidents` calls `getAllProjects`:
```typescript
import { getAllProjects } from "./projects";
```

`resolvePerson` and `resolveOrg` are currently private. They should stay private
(unexported) within `people.ts` since no other module calls them.

---

### `knowledge.ts`

**Purpose:** Queries and writes for `DB.knowledge`.

**Exports:**
- Types: `KnowledgeAsset`
- Functions: `getKnowledgeAssets`, `createKnowledgeAssetDraft`

No cross-module dependencies.

---

### `decisions.ts`

**Purpose:** Decision Items DB queries. Contains the embedded-metadata parser
(`[ENTITY_ID:...]`, `[RESOLUTION_FIELD:...]`, etc.) which is the most complex
parsing logic in the entire data layer.

**Exports:**
- Types: `DecisionItem`
- Functions: `getDecisionItems`

No cross-module dependencies. The metadata parser is private to `getDecisionItems`.

---

### `insights.ts`

**Purpose:** Insight Briefs DB queries.

**Exports:**
- Types: `InsightBrief`
- Functions: `getInsightBriefs`

No cross-module dependencies. Small, self-contained module (~40 lines).

---

### `living-room.ts`

**Purpose:** All Living Room data operations — reads AND writes, co-located
intentionally (the write functions are tightly scoped to Living Room admin and
should not be scattered). Note that `getLivingRoomThemes` queries `DB.knowledge`
and `getLivingRoomMilestones` queries `DB.projects` — these are cross-DB queries
that are logically Living Room concerns.

**Exports:**
- Types: `LivingRoomPerson`, `LivingRoomMilestone`, `LivingRoomTheme`
- Functions (reads): `getLivingRoomPeople`, `getLivingRoomMilestones`, `getLivingRoomThemes`
- Functions (writes): `updatePersonVisibility`, `updateProjectLivingRoom`,
  `updateInsightBriefCommunityFlag`, `updateKnowledgeAssetTheme`

No cross-module function dependencies (all queries go directly to Notion SDK).

---

### `content.ts`

**Purpose:** Content Pipeline and Style Profiles queries. Includes `getReadyContent`
(currently in the "Ready to Publish" section at line 1977) since it targets
`DB.contentPipeline`.

**Exports:**
- Types: `StyleProfile`, `ContentPipelineItem`, `ReadyContent`
- Functions: `getContentPipeline`, `getStyleProfiles`, `getReadyContent`

No cross-module dependencies.

---

### `commercial.ts`

**Purpose:** All commercial-layer queries: Proposals, Offers, Opportunities (CH and
Portfolio scopes), Pipeline stages, and Relationship Warmth (used in the commercial
Control Room view). Also includes `getPortfolioOpportunities` (currently at line 2010
in the "Garage portfolio" section) since it targets `DB.opportunities` and returns
`OpportunityItem` — the same type owned by this module.

**Exports:**
- Types: `ProposalBrief`, `CommercialOffer`, `OpportunityItem`, `PipelineOpportunity`
- Functions: `getProposalBriefs`, `getCommercialOffers`, `getOpportunitiesByScope`,
  `getFollowUpOpportunities`, `getPipelineOpportunities`, `getPortfolioOpportunities`
- Private utility: `page_last_edited_after` (stays private)

No cross-module function dependencies.

**Decision:** `WarmthRecord` and `getColdRelationships` move to `people.ts` not here,
since they query `DB.people`. The Control Room page that renders both follow-up
opportunities and cold relationships will import from two modules — this is acceptable
and accurate.

---

### `garage.ts`

**Purpose:** Garage financial layer: Valuations, Cap Table, Data Room, Financial
Snapshots, and Startup Org Data. All relate to `DB.organizations` via the `"Startup"`
relation.

**Exports:**
- Types: `StartupOrgData`, `FinancialSnapshot`, `ValuationRecord`, `CapTableEntry`,
  `DataRoomItem`
- Functions: `getStartupOrgData`, `getFinancialsForProject`, `getValuationsForProject`,
  `getCapTableForProject`, `getDataRoomForProject`
- Private: `getPrimaryOrgIds` (stays private — it is an internal bridge, not a
  public API)

No cross-module function dependencies.

---

### `briefings.ts`

**Purpose:** Daily Briefings DB. Small, isolated.

**Exports:**
- Types: `DailyBriefing`
- Functions: `getDailyBriefing`

No cross-module dependencies.

---

### `drafts.ts`

**Purpose:** Agent Drafts DB. Small, isolated.

**Exports:**
- Types: `AgentDraft`
- Functions: `getAgentDrafts`

No cross-module dependencies.

---

### `index.ts`

**Purpose:** Barrel file. Re-exports everything from all domain modules.

```typescript
export * from "./core";
export * from "./projects";
export * from "./evidence";
export * from "./sources";
export * from "./people";
export * from "./knowledge";
export * from "./decisions";
export * from "./insights";
export * from "./living-room";
export * from "./content";
export * from "./commercial";
export * from "./garage";
export * from "./briefings";
export * from "./drafts";
```

Once stable, the old `src/lib/notion.ts` becomes:
```typescript
// Compatibility shim — remove when all imports are updated.
export * from "./notion/index";
```

---

## 3. Migration Sequence

Migrate in this order to minimise the blast radius at each step. Each step should
be an isolated commit with a TypeScript check before moving on.

### Step 1 — Create the directory and `core.ts`

```
mkdir src/lib/notion
```

Move into `core.ts`:
- `notion` client instance
- `DB` constants map (with all comments)
- All 9 helper functions (change from `function` to `export function`)

Create `src/lib/notion/index.ts` that re-exports from core only:
```typescript
export * from "./core";
```

Convert `src/lib/notion.ts` to a compatibility shim:
```typescript
export * from "./notion/index";
```

**Validate:** `tsc --noEmit`. No imports anywhere else need to change yet.

---

### Step 2 — Extract leaf modules (no inter-module dependencies)

Extract in any order, one module per commit:

1. **`briefings.ts`** — `DailyBriefing`, `getDailyBriefing` (~44 lines)
2. **`drafts.ts`** — `AgentDraft`, `getAgentDrafts` (~42 lines)
3. **`insights.ts`** — `InsightBrief`, `getInsightBriefs` (~42 lines)
4. **`decisions.ts`** — `DecisionItem`, `getDecisionItems` (~137 lines, complex parser)
5. **`knowledge.ts`** — `KnowledgeAsset`, `getKnowledgeAssets`, `createKnowledgeAssetDraft` (~82 lines)
6. **`living-room.ts`** — all Living Room reads + writes (~260 lines total, co-locate both sections)
7. **`content.ts`** — `StyleProfile`, `ContentPipelineItem`, `ReadyContent`, `getContentPipeline`, `getStyleProfiles`, `getReadyContent` (~100 lines)
8. **`garage.ts`** — all garage types and functions (~270 lines)

For each extraction: move the code, add `import { notion, DB, prop, text, ... } from "./core"` at the top, add the module to `index.ts`, run `tsc --noEmit`.

---

### Step 3 — Extract `sources.ts`

Move `SourceItem`, `DocumentItem`, `MeetingItem`, `SourceActivity`, `parseSource`,
`getSourcesForProject`, `getAllSources`, `getDocumentsForProject`, `getSourceActivity`.

This is needed before `projects.ts` because `getProjectsOverview` depends on
`getAllSources`.

Add `sources.ts` to `index.ts`. Validate.

---

### Step 4 — Extract `evidence.ts`

Move `EvidenceItem`, `fetchAllEvidence` (make it `export function fetchAllEvidence`),
`getEvidenceForProject`, `getAllEvidence`, `getReusableEvidence`.

Add `evidence.ts` to `index.ts`. Validate.

---

### Step 5 — Extract `projects.ts`

Now safe because both `sources.ts` and `evidence.ts` exist.

Move `Project`, `ProjectCard`, `DashboardStats`, `parseProject`, `getAllProjects`,
`getProjectById`, `getProjectsOverview`, `getDashboardStats`.

Add imports:
```typescript
import { fetchAllEvidence } from "./evidence";
import { getAllSources } from "./sources";
```

Add `projects.ts` to `index.ts`. Validate.

---

### Step 6 — Extract `people.ts`

Now safe because `projects.ts` exists.

Move `PersonRecord`, `OrgRecord`, `ProjectPeople`, `ResidentRecord`, `WarmthRecord`,
`resolvePerson`, `resolveOrg`, `getProjectPeople`, `getAllPeople`, `getAllResidents`,
`getColdRelationships`.

Add import:
```typescript
import { getAllProjects } from "./projects";
```

Add `people.ts` to `index.ts`. Validate.

---

### Step 7 — Extract `commercial.ts`

Move `ProposalBrief`, `CommercialOffer`, `OpportunityItem`, `PipelineOpportunity`,
`getProposalBriefs`, `getCommercialOffers`, `getOpportunitiesByScope`,
`getFollowUpOpportunities`, `getPipelineOpportunities`, `getPortfolioOpportunities`,
`page_last_edited_after`.

Add `commercial.ts` to `index.ts`. Validate.

---

### Step 8 — Clean up `src/lib/notion.ts`

At this point the original file should be empty or contain only the compatibility
shim. Verify the file now has nothing left except `export * from "./notion/index"`.

---

### Step 9 — Update direct imports in API routes (optional, lower priority)

Many API routes import `{ notion, DB }` directly from `"@/lib/notion"`. These still
work via the shim. Updating them to `"@/lib/notion/core"` is an optional cleanup
pass that can happen asynchronously.

---

## 4. Compatibility Strategy

### During migration

- The compatibility shim (`src/lib/notion.ts → export * from "./notion/index"`)
  means **zero import changes are required in any consumer file during migration**.
- Each extraction adds to `index.ts`. Existing `import { X } from "@/lib/notion"`
  statements continue to work throughout.
- API routes that import `{ notion, DB }` directly continue to work because
  `core.ts` exports both and `index.ts` re-exports `core.ts`.

### Name collision risk in the barrel

`export *` from multiple modules can cause collision if two modules export the same
name. Risks to watch:

- `text` — the helper is exported from `core.ts`. No domain module should export a
  function named `text`. (The helper is currently private; making it exported from
  `core.ts` is the first time it has a public name.)
- `parseProject`, `parseSource` — keep these private (unexported) in their modules
  to avoid barrel noise.

### Validating nothing broke

At each step:
1. `tsc --noEmit` — catches all type errors immediately.
2. Load the page that exercises the extracted module in the browser (`/admin`,
   `/admin/garage/[id]`, `/admin/decisions`, etc.).
3. The existing tests (if any) for the affected pages should continue to pass.

There are no automated unit tests for the Notion layer, so the validation gate is:
TypeScript clean + manual smoke-test of one affected page per domain.

---

## 5. Risk Areas

### 1. `fetchAllEvidence` visibility change

Currently private (not exported). Used only by `getProjectsOverview`. After
extraction, it must be exported from `evidence.ts` to be importable by `projects.ts`.

**Risk:** Another developer calls `fetchAllEvidence` from an API route, thinking it
is a public function. This returns all evidence with no filter — potentially hundreds
of records.

**Mitigation:** Add a comment above the export: `// Internal: full evidence cursor
scan. Prefer getEvidenceForProject or getAllEvidence for filtered queries.`

---

### 2. `OpportunityItem` mapping duplication

`OpportunityItem` is mapped from raw Notion pages in four separate functions:
`getOpportunitiesByScope`, `getFollowUpOpportunities`, `getPipelineOpportunities`,
`getPortfolioOpportunities`. The mapping logic is copy-pasted in each function.

**Risk:** Adding a new field to `OpportunityItem` requires updating four places.
This is a pre-existing bug, not introduced by the refactor. The refactor does not
fix it, but it makes it more visible.

**Mitigation (during refactor):** Extract a private `parseOpportunity(page)` helper
inside `commercial.ts` before moving the four functions there. This reduces four
mapping blocks to one. Low risk — same file, no cross-module dependency change.

---

### 3. Living Room writes operating on foreign DBs

`updateInsightBriefCommunityFlag` writes to `DB.insightBriefs` (Insight Briefs DB).
`updateKnowledgeAssetTheme` writes to `DB.knowledge`. Both are Living Room admin
operations, but they modify records owned by other domains.

**Risk:** A future developer reading `insights.ts` or `knowledge.ts` may not realise
these fields are also written by `living-room.ts`. Type drift could occur if the
field name changes and only one write path is updated.

**Mitigation:** Add comments in both `insights.ts` and `knowledge.ts` noting that
`Community Relevant` and `Living Room Theme` fields are also written by
`living-room.ts`. Cross-reference `NOTION_FIELD_CONTRACTS.md`.

---

### 4. API routes that bypass typed functions

Several API routes in `src/app/api/` import `{ notion, DB }` and build raw queries
inline, bypassing the typed layer entirely. Examples: `generate-daily-briefing`,
`validation-operator`, `ingest-meetings`. These import from the shim and continue
to work, but they are not tracked by the typed layer.

**Risk:** If `DB.agentDrafts` is renamed or the `Draft Title` field contract changes,
the API route is not caught by the TypeScript type system — only by the field
contract doc.

**Mitigation:** This is a pre-existing architectural risk. The refactor does not
worsen it. Long-term, the pipeline routes should use typed query functions where
possible. This is out of scope for this refactor.

---

### 5. Circular import potential: projects ↔ evidence

`getProjectsOverview` in `projects.ts` calls `fetchAllEvidence` from `evidence.ts`.
If `evidence.ts` ever imports from `projects.ts` (e.g., for `getAllProjects` to get
project names), this becomes circular.

Currently `evidence.ts` does not import from `projects.ts`, so no circular risk
exists at extraction time. This constraint must be maintained.

**Mitigation:** If evidence queries ever need project context, pass project IDs as
parameters rather than importing `getAllProjects`.

---

### 6. `page_last_edited_after` private utility

This tiny function (lines 1930–1933) is a private helper for `getPipelineOpportunities`.
It is easy to miss during extraction if not noted explicitly.

**Mitigation:** It moves with `getPipelineOpportunities` into `commercial.ts` and
remains private (unexported).

---

## 6. Recommended First Extraction

### Extract `core.ts` — client, DB constants, and helpers

**Why first:**

1. Zero dependencies. It imports nothing from other modules and nothing from this
   project. It is the only extraction that can be done without any other module
   existing first.

2. It unblocks every subsequent extraction. Every other module will import
   `{ notion, DB, prop, text, ... }` from `./core`. Having `core.ts` finalized
   before any domain module is created prevents redundant edits.

3. It is the highest-confidence extraction. The `DB` map and the 9 helpers are
   pure constants and pure functions — no side effects, no state, no dependencies.
   TypeScript will confirm correctness immediately.

4. It removes the largest cognitive overhead from the original file: future readers
   of any domain module will not need to scroll past the DB map and helpers to reach
   the domain code they care about.

**What the first PR/commit contains:**

```
src/lib/notion/core.ts         (new — 60 lines)
src/lib/notion/index.ts        (new — 1 line: export * from "./core")
src/lib/notion.ts              (changed — 1 line: export * from "./notion/index")
```

No other files change. `tsc --noEmit` must pass before commit.

---

### Second extraction: `briefings.ts` or `drafts.ts`

The second extraction to do immediately after `core.ts` is either `briefings.ts` or
`drafts.ts` — whichever was most recently edited. These are:

- 40–45 lines each
- Zero inter-module dependencies
- Exercised by a single clear page or API route
- Easy to smoke-test in isolation

These two extractions serve as the proof-of-concept that the pattern (create module →
import from core → add to index → validate) works end to end before tackling the
larger domains.

---

## Areas Requiring Manual Judgment Before Refactor Begins

1. **`fetchAllEvidence` naming.** The current name is descriptive but collides
   conceptually with the public `getAllEvidence`. Before extracting `evidence.ts`,
   decide whether to rename it (e.g., `paginateAllEvidence`, `scanAllEvidence`) or
   keep the current name with a clear comment. Renaming is safe but touches
   `projects.ts` too.

2. **`parseOpportunity` extraction.** The four opportunity-mapping blocks in the
   commercial section are near-identical. Before extracting `commercial.ts`, decide
   whether to consolidate into a private `parseOpportunity(page)` helper. This is
   not required for the refactor to work, but it is the right time to do it.

3. **Whether `DashboardStats` / `getDashboardStats` belongs in `projects.ts` or a
   separate `stats.ts`.** Currently it queries both `DB.projects` and `DB.evidence`
   directly. The current plan puts it in `projects.ts` (it aggregates project-level
   stats). If future stats queries grow significantly, a `stats.ts` module would be
   appropriate. Low priority for now.

4. **API route import updates.** The migration plan leaves API route imports pointed
   at the shim (`@/lib/notion`). A follow-up decision is needed on whether to update
   them incrementally (during each domain extraction) or in a single cleanup pass at
   the end. Updating incrementally adds one import change per commit but keeps
   imports accurate. Bulk update at the end is simpler but defers the cleanup.

5. **TypeScript `any` suppression.** The current file has ~60 `// eslint-disable-next-line
   @typescript-eslint/no-explicit-any` comments. The refactor does not fix these.
   If the team wants to tighten types during the refactor, it should be done module
   by module after extraction, not during. Mixing type improvements with structural
   moves makes rollback harder.
