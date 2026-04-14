# Notion Field Contracts

Last reviewed: 2026-04-14

---

## What is a field contract?

A "field contract" in this repo is the exact Notion property name that a query or parser in the portal code expects to find. The portal does not use a schema discovery layer. It calls `page.properties["Field Name"]` directly. If the property is renamed in Notion, the code silently gets `undefined` and returns an empty string, zero, or null — with no error thrown. This makes field renames in Notion invisible failures.

**The portal depends on exact property names. Renaming a field in Notion does not break a build. It silently breaks product behaviour.**

`src/lib/notion.ts` is the code-level source of truth for current usage. The tables below are derived from that file only. Fields used only in agent skill files (`.claude/skills/`) or one-off API routes are noted where relevant, but the primary audit is from `src/lib/notion.ts`.

**If something is uncertain, it is marked "Not fully verified".**

---

## CH Projects [OS v2]

DB constant: `DB.projects`  
Used by: `/hall`, `/workroom`, `/garage`, `/admin`, `/living-room`, all project-scoped surfaces.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Project Name` | Yes | All surfaces | Title display and fuzzy-match fallback for org lookup | Every surface shows "Untitled"; garage org lookup fails |
| `Project Status` | Yes | `getAllProjects()`, stats | Filter: only `"Active"` projects are loaded | All projects disappear from portal; stats show zero |
| `Current Stage` | Recommended | Hall, Workroom, Admin | Displayed as project stage badge | Stage shows blank |
| `Status Summary` | Recommended | Hall, Admin | Narrative status block | Empty narrative block |
| `Draft Status Update` | Recommended | Admin agents, `/admin/projects/[id]` | Pending update text shown for approval | Update approval UI shows blank |
| `Last Status Update` | Recommended | `getAllProjects()` sort | Primary sort for project ordering; also date display | Projects appear in random order |
| `Project Update Needed?` | Recommended | Admin dashboard | Flag on project cards | Update-needed indicator always off |
| `Geography` | Recommended | Hall, Admin filters | Multi-select display and filter | Geography shows blank |
| `Themes / Topics` | Recommended | Hall, Admin filters | Multi-select display | Themes show blank |
| `Hall Welcome Note` | Only for Hall | `/hall` | First editorial block on Hall load | Hall shows no welcome content |
| `Hall Current Focus` | Only for Hall | `/hall` — "What's Happening Now" | Current focus text | Section renders empty |
| `Hall Next Milestone` | Only for Hall | `/hall` — "What's Happening Now" | Next milestone text | Section renders empty |
| `Hall Challenge` | Only for Hall | `/hall` — "What We Heard" | Challenge framing | What We Heard section empty |
| `Hall Matters Most` | Only for Hall | `/hall` — "What We Heard" | What matters most text | What We Heard section empty |
| `Hall Obstacles` | Only for Hall | `/hall` — "What We Heard" | Obstacles text | What We Heard section empty |
| `Hall Success` | Only for Hall | `/hall` — "What We Heard" | Success definition text | What We Heard section empty |
| `Primary Workspace` | Yes | Workspace routing | **Select: `"hall"` \| `"workroom"` \| `"garage"`.** Code default is `"hall"` if blank. Drives which workspace link appears in sidebar. | Workroom and Garage never activate for any client |
| `Hall Mode` | Recommended | `/hall` | Select: `"explore"` \| `"live"`. Default `"explore"` if blank. Controls what Hall content is shown. | Hall always renders in explore/orientation mode |
| `Engagement Stage` | Recommended | Admin, Hall | Displayed stage for engagement lifecycle | Shows blank |
| `Engagement Model` | Recommended | Admin | Displayed engagement model | Shows blank |
| `Workroom Mode` | Only for Workroom | `/workroom` | Controls Workroom display mode | Workroom renders without mode context |
| `Grant Eligible` | Only for grants | Admin grants surface | Checkbox to flag grant-eligible projects | Project excluded from grant views |
| `Last Meeting Date` | Recommended | Hall, Admin | Last meeting date display | Shows blank |
| `Project Lead` | Recommended | Hall team section, Residents | Relation to CH People — lead persons shown in Hall | No lead shown in Hall |
| `Team` | Recommended | Hall team section, Residents | Relation to CH People — team members shown | No team shown in Hall |
| `Primary Organization` | Yes (for Garage) | Garage financial layer, `getPrimaryOrgIds()` | **Relation to CH Organizations.** Required to load Valuations, Cap Table, Data Room. Has a fuzzy-match fallback by project name, but the fallback is imprecise. | All Garage financial data returns empty |
| `Other Organizations` | Recommended | Hall team section | Relation to CH Organizations for secondary orgs | Secondary orgs absent from Hall |
| `Share to Living Room` | Only for Living Room | `/living-room` milestones, `updateProjectLivingRoom()` | Checkbox gate — only projects with this checked appear in Living Room milestones | Project never appears in Living Room |
| `Milestone Type` | Only for Living Room | `/living-room` | Select — type of milestone shown in community view | Milestone type blank in Living Room |
| `Community Theme` | Only for Living Room | `/living-room` | Text shown as community theme in Living Room | Theme text blank |

---

## CH Evidence [OS v2]

DB constant: `DB.evidence`  
Used by: validation-operator cron, evidence queue, project cards, OS pipeline stats, P1 banner.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Evidence Title` | Yes | All evidence views | Title display | All evidence shows "Untitled" |
| `Evidence Type` | Yes | Evidence filtering, P1 counts, stats | Select: `"Blocker"` \| `"Decision"` \| `"Dependency"` \| `"Outcome"` \| `"Requirement"` \| `"Process Step"`. Used for per-type counts on project cards and in evidence queue. | Blocker count, decision count, dependency count always zero; P1 banner never fires |
| `Validation Status` | Yes | **Everything in the OS pipeline.** `getAllEvidence()`, validation-operator, `getProjectsOverview()`, stats, P1 counts | Select: `"New"` \| `"Reviewed"` \| `"Validated"`. Validation-operator filters for `"Reviewed"` and writes `"Validated"`. Stats filter for `"New"` (pending) and `"Validated"`. | Entire validation pipeline collapses; P1 banner always blank; knowledge candidates count zero |
| `Confidence Level` | Yes | Validation-operator | Select: `"High"` \| `"Medium"` \| `"Low"`. Controls AUTO_VALIDATE vs AUTO_REVIEW. If missing, validation-operator treats it as Low and skips. | No evidence is ever auto-validated |
| `Reusability Level` | Recommended | Knowledge system, stats | Select: `"Reusable"` \| `"Canonical"`. Both tiers are included in knowledge candidate counts. | Knowledge candidates count zero; Library never populates |
| `Date Captured` | Recommended | Sort field, `lastEvidenceDate` on project cards | Primary sort for evidence queries; date of last evidence on project card | Evidence appears in random order; "last evidence" date blank |
| `Source Excerpt` | Yes | Validation-operator ESCALATE rule | Rich text. Validation-operator checks `item.excerpt?.trim()` — empty excerpt triggers ESCALATE (skips auto-validation). | All evidence without an excerpt is escalated silently |
| `Project` | Yes | All project-scoped evidence queries | Relation to CH Projects. Primary filter for `getEvidenceForProject()`. | Project-scoped evidence never loads; all project cards show zero counts |

---

## CH Sources [OS v2]

DB constant: `DB.sources`  
Used by: Hall Conversations section, Shared Materials section, project source counts, OS pipeline intake.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Source Title` | Yes | Hall Conversations, Shared Materials | Title display | All sources show "Untitled" |
| `Source Type` | Yes | Source routing in `getSourceActivity()` | Select. Values including `"Meeting"`, `"Email"`, `"Document"` drive which counter increments (email count, meeting count, document count). | All sources counted as "other"; email/meeting/document counts always zero |
| `Source Platform` | Yes | Source routing — fallback alongside Source Type | Select: `"Fireflies"` \| `"Gmail"` \| `"Google Drive"`. Acts as secondary routing signal alongside Source Type. | Meeting/email/document routing degrades if Source Type also missing |
| `Processing Status` | Recommended | OS pipeline status views | Select pipeline status of source processing | Pipeline status unknown |
| `Linked Projects` | Yes | All project-scoped source queries | Relation to CH Projects — primary filter for `getSourcesForProject()`, `getDocumentsForProject()`, `getSourceActivity()` | Project sees no sources, meetings, or documents |
| `Source Date` | Recommended | Sort field; document list | Date sort for source queries and document display | Documents/sources appear in random order |
| `Source URL` | Only for documents | `getDocumentsForProject()` filter | URL field. Documents without a URL are filtered out entirely (`.filter(d => d.url)`). | Document appears in DB but never shown in Hall |
| `Processed Summary` | Recommended | Hall Conversations section | Rich text written by OS engine after meeting intake. Code comments note it may be empty for older sources. | Meeting entry shows in Conversations but without any summary text |

---

## CH People [OS v2]

DB constant: `DB.people`  
Used by: Hall team section, `/residents`, Living Room, relationship warmth queue, skill routes.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Full Name` | Yes | All people surfaces | Rich text — primary display name. Records with empty Full Name are filtered out entirely. | Person silently disappears from all views |
| `Job Title / Role` | Recommended | Hall team, Residents, relationship queue | Rich text | Title shows blank in all views |
| `Email` | Recommended | Clerk user mapping, skill routes | Email property | Person not matchable to Clerk session; delegation routes can't resolve person |
| `Person Classification` | Yes | Residents routing | Select: `"Internal"` \| `"External"`. Drives section assignment: Internal+Founder → Co-Founders; Internal+other → Core Team; External+Startup Founder → EIRs. | Residents page shows all people in wrong sections or none |
| `Relationship Roles` | Recommended | Residents, Living Room | Multi-select — roles displayed on person cards | Role tags absent |
| `LinkedIn` | Recommended | Living Room, Residents | URL | LinkedIn links absent |
| `Country` | Recommended | Living Room, Residents | Select — combined with City to form location string | Location shows blank |
| `City` | Recommended | Living Room, Residents | Rich text — combined with Country | Location shows blank |
| `Visibility` | Yes (for Living Room) | `getLivingRoomPeople()` — filter gate | Select: `"public-safe"` \| `"community"` \| `"private"`. Only `"public-safe"` and `"community"` are shown in Living Room. | Person never appears in Living Room regardless of intent |
| `Contact Warmth` | Recommended | Relationship queue in admin, portfolio-health-agent | Select: `"Hot"` \| `"Warm"` \| `"Cold"` \| `"Dormant"`. Used to filter cold/dormant contacts for the admin dashboard queue. | Relationship queue always empty; warmth-based alerts never fire |
| `Last Contact Date` | Recommended | Relationship queue sort | Date — sort field for cold contacts list | Cold contacts appear in random order |
| `Follow-up Status` | Recommended | `identify-quick-win` skill route | Select: `"Needed"`. Filtered by skill to surface hot contacts needing follow-up. | Quick-win skill never surfaces contact follow-ups |

---

## CH Organizations [OS v2]

DB constant: `DB.organizations`  
Used by: Hall team section, Garage financial layer (primary bridge), grants system (via Category = Funder).

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Name` | Yes | Hall team, Garage bridge lookup, grants system | Title property — primary identifier. Also used in `getPrimaryOrgIds()` fuzzy-match fallback (first word search + normalize). | Org shows "Untitled"; fuzzy fallback fails to match; Garage financial layer returns empty |
| `Organization Category` | Recommended | Grants system | Select — includes `"Funder"` value to filter grant funders. | Funders not identifiable as a distinct category |
| `Relationship Stage` | Recommended | Admin, Hall | Select — relationship lifecycle stage | Shows blank |
| `Website` | Recommended | Hall team section | URL property | Website link absent |
| `City / HQ City` | Recommended | Hall team section | Rich text — combined with Country | Location shows blank |
| `Country` | Recommended | Hall team section | Select | Location shows blank |
| `Startup MRR` | Only for Garage | `/garage`, `getStartupOrgData()` | Rich text — MRR metric for startup | MRR shows blank in Garage |
| `Startup Funding Round` | Only for Garage | `/garage` | Select | Funding round shows blank |
| `Startup Investment Status` | Only for Garage | `/garage` | Select | Investment status shows blank |
| `Startup Team Size` | Only for Garage | `/garage` | Rich text | Team size shows blank |
| `Startup Stage` | Only for Garage | `/garage` | Select | Stage shows blank in Garage |

---

## CH Knowledge Assets [OS v2]

DB constant: `DB.knowledge`  
Used by: `/library`, Living Room themes, `createKnowledgeAssetDraft()`.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Asset Name` | Yes | Library, Living Room themes | Title — primary identifier | Asset shows "Untitled" |
| `Asset Type` | Recommended | Library browser, Living Room | Select | Asset type shows blank |
| `Domain / Theme` | Recommended | Library categorisation, Living Room | Multi-select. **Note:** code comment explicitly states `"Category"` and `"Asset Category"` do not exist in the schema — only `"Domain / Theme"` is valid. | Category column blank in Library; Living Room themes uncategorised |
| `Status` | Recommended | Library filter | Select: `"Draft"` \| `"Active"`. `createKnowledgeAssetDraft()` writes `"Draft"`. | Library shows all assets regardless of draft/live state |
| `Portal Visibility` | Recommended | Library access control | Select — default `"admin-only"`. Set on create. | Visibility logic silent-fails; code uses `?? "admin-only"` fallback |
| `Source File URL` | Recommended | Library, ingest pipeline | URL — Supabase file link | Source file link absent in Library |
| `Living Room Theme` | Only for Living Room | `getLivingRoomThemes()` — filter gate | Checkbox. Only assets with this checked appear in Living Room Themes section. | Asset never appears as a Living Room theme |

---

## Decision Items [OS v2]

DB constant: `DB.decisions`  
Used by: Admin dashboard P1 banner, `/admin/decisions`, agent resolution flow.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| Title property (any name) | Yes | `getDecisionItems()` | Code detects the title property by Notion type `"title"`, not by name. Fallbacks: `"Decision Title"`, then `"Name"`. This is one of the few type-safe title reads. | Low risk from rename, but explicit name lookup fallbacks would break if both "Decision Title" and "Name" are absent |
| `Decision Type` | Yes | Admin decisions view | Select: `"Approval"` \| `"Missing Input"` \| `"Ambiguity Resolution"` \| `"Policy/Automation Decision"` \| `"Draft Review"` | Type column blank |
| `Priority` | Yes | Sort field; P1 banner | Select: `"P1 Critical"` \| `"High"` \| `"Medium"` \| `"Low"`. Primary sort. P1 banner checks for P1 items. | Decisions unsorted; P1 banner never fires |
| `Status` | Yes | Decision queue filter | Select: `"Open"` \| `"Resolved"` \| `"Dismissed"`. Primary filter for `getDecisionItems()`. | Queue always empty or always full depending on filter |
| `Proposed Action` | Yes | Agent resolution UI | Rich text parsed for embedded agent metadata markers (`[ENTITY_ID:...]`, `[RESOLUTION_FIELD:...]`, etc.). Also shown as human-readable notes after stripping markers. | Resolution UI shows blank; agent metadata not parsed; inline resolve actions absent |
| `Source Agent` | Recommended | Decision view | Select — which agent created this item | Source column blank |
| `Requires Execute` | Yes | Agent resolution gate | Checkbox — controls whether Execute gate UI appears | Execute gate never shown |
| `Execute Approved` | Yes | Agent execution safety | Checkbox — checked before any agent execute run | Safety gate disabled |
| `Decision Due Date` | Recommended | Admin decisions view | Date — deadline display | Due date absent |
| `Decision Category` | Recommended | Admin filters | Select — optional category tag | Category column blank |

---

## Content Pipeline [OS v2]

DB constant: `DB.contentPipeline`  
Used by: Admin comms view, Living Room signals (via Insight Briefs), `getReadyContent()`, skill routes that publish.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Title` or `Name` | Yes | All content views | Title property. Code tries `"Title"` first, then `"Name"`. | Shows "Untitled" if neither matches |
| `Status` | Yes | All content filtering | Select: `"Draft"` \| `"Review"` \| `"Approved"` \| `"Ready to Publish"` \| `"Published"` \| `"Archived"`. Used as primary filter in most queries. | Content queue filtering breaks entirely |
| `Content Type` | Recommended | Admin, skill routes | Select: `"Post"` \| `"Newsletter"` \| `"Investor Update"` \| `"Proposal"` etc. | Type column blank |
| `Channel` or `Platform` | Recommended | `getReadyContent()` | Tries `"Platform"` first, falls back to `"Channel"`. | Channel/platform blank in Ready to Publish list |
| `Desk` | Recommended | Admin comms view | Select: `"Comms"` \| `"Design"` \| `"Insights"` \| `"Grants"` | Desk routing blank |
| `Projects` or `Project` | Recommended | Project-scoped queries | Relation to CH Projects. Tries `"Projects"` first, falls back to `"Project"`. | Content not linked to any project |
| `Draft Text` | Recommended | Admin content view, approval UI | Rich text (multi-chunk). Read in `getContentPipeline()`. **Note:** run-skill routes write to `"Content"` not `"Draft Text"` — see schema note below. | Body text absent from content viewer |
| `Slide HTML` | Only for deck content | Deck/presentation render | Rich text (multi-chunk) — HTML string for slide decks | Deck renders blank |
| `Publish Date` or `Published Date` | Recommended | Date display | Tries `"Publish Date"` first, falls back to `"Published Date"`. | Publish date blank |
| `Publish Window` | Recommended | `getReadyContent()` | Rich text — shown as publish timing note | Window text blank |

---

## Opportunities [OS v2]

DB constant: `DB.opportunities`  
Used by: Admin pipeline, commercial views, follow-up queue, `getFollowUpOpportunities()`, `identify-quick-win` skill.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Opportunity Name` or `Name` | Yes | All opportunity views | Title. Tries `"Opportunity Name"` first, falls back to `"Name"`. | Shows "Untitled" |
| `Stage` | Yes | Pipeline routing and filtering | Select: `"New"` \| `"Exploring"` \| `"Qualifying"` \| `"Active"` \| `"Proposal Sent"` \| `"Negotiation"` \| `"Won"` \| `"Lost"` \| `"Archived"`. Primary filter in nearly every query. | Entire pipeline view breaks; follow-up queue breaks |
| `Scope` | Yes | Routing between CH and Portfolio views | Select: `"CH"` \| `"Portfolio"` \| `"Both"`. Routes to CH vs Portfolio section. | All opportunities appear in wrong section or missing from both |
| `Follow-up Status` | Yes | Follow-up queue | Select: `"None"` \| `"Needed"` \| `"Sent"` \| `"Waiting"`. Filter for `"Needed"`. | Follow-up queue always empty |
| `Type` or `Opportunity Type` | Recommended | Pipeline filters | Tries `"Type"` first, falls back to `"Opportunity Type"`. | Type column blank |
| `Organization` | Recommended | Display only | Rich text — org name display | Org column blank |
| `Opportunity Score` | Recommended | Sort field for pipeline | Number 0–100 — sort by score in pipeline view | Pipeline unsorted by score |
| `Qualification Status` | Recommended | Admin qualification views | Select: `"Qualified"` \| `"Needs Review"` \| `"Below Threshold"` \| `"Not Scored"`. Default `"Not Scored"`. | Qualification column always "Not Scored" |

---

## Financial Snapshots [OS v2]

DB constant: `DB.financialSnapshots`  
Used by: Garage financial view. Only applies to projects with a Garage workspace.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Snapshot Name` | Yes | Garage financial view | Title | Shows "Untitled" |
| `Scope Project` | Yes | `getFinancialsForProject()` | Relation to CH Projects — primary filter | No financials load for any project |
| `Period` | Recommended | Sort field, time-axis display | Date | Snapshots appear in random order |
| `Revenue` | Recommended | Financial chart | Number | Revenue line absent |
| `Cost` | Recommended | Financial chart | Number | Cost line absent |
| `Gross Margin` | Recommended | Financial chart | Number | Gross margin absent |
| `Burn` | Recommended | Financial chart | Number | Burn absent |
| `Cash` | Recommended | Financial chart | Number | Cash absent |
| `AR` | Recommended | Financial view | Number — accounts receivable | AR blank |
| `AP` | Recommended | Financial view | Number — accounts payable | AP blank |
| `Runway` | Recommended | Financial view | Number — months | Runway blank |

---

## Valuations [OS v2]

DB constant: `DB.valuations`  
Used by: Garage valuation section. Requires `Primary Organization` relation on CH Projects.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Valuation Name` | Yes | Garage | Title | Shows "Untitled" |
| `Startup` | Yes | `getValuationsForProject()` | Relation to CH Organizations — primary filter | No valuations load |
| `Method` | Recommended | Garage | Select — valuation method | Method blank |
| `Status` | Recommended | Garage | Select | Status blank |
| `Pre-money Min (£)` | Recommended | Garage | Number — includes currency symbol in field name | Min value blank |
| `Pre-money Max (£)` | Recommended | Garage | Number — includes currency symbol in field name | Max value blank |
| `Confidence` | Recommended | Garage | Select | Confidence blank |
| `Period` | Recommended | Sort field | Date | Valuations unordered |
| `Key Assumptions` | Recommended | Garage | Rich text | Assumptions blank |

---

## Cap Table [OS v2]

DB constant: `DB.capTable`  
Used by: Garage cap table view. Requires `Primary Organization` relation on CH Projects.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Entry Name` | Yes | Garage | Title | Shows "Untitled" |
| `Startup` | Yes | `getCapTableForProject()` | Relation to CH Organizations — primary filter | No cap table entries load |
| `Shareholder Name` | Recommended | Garage | Rich text | Name column blank |
| `Shareholder Type` | Recommended | Garage | Select | Type blank |
| `Share Class` | Recommended | Garage | Select | Class blank |
| `Round` | Recommended | Garage | Select | Round blank |
| `Shares` | Recommended | Garage | Number | Share count blank |
| `Ownership Pct` | Recommended | Garage | Number | Ownership % blank |
| `Diluted Pct` | Recommended | Garage | Number | Diluted % blank |
| `Invested Amount (£)` | Recommended | Garage | Number — includes currency symbol in field name | Investment amount blank |
| `Investment Date` | Recommended | Sort field | Date | Entries unordered |

---

## Data Room [OS v2]

DB constant: `DB.dataRoom`  
Used by: Garage data room view. Requires `Primary Organization` OR uses `Notes` field as projectId fallback.

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Item Name` | Yes | Garage | Title | Shows "Untitled" |
| `Startup` | Yes (primary) | `getDataRoomForProject()` — primary filter | Relation to CH Organizations | Primary lookup returns empty; falls back to Notes filter |
| `Notes` | Yes (fallback) | `getDataRoomForProject()` — fallback filter | Rich text. When `Startup` relation is not set, code searches for projectId string inside `Notes`. Legacy items uploaded before org was linked rely on this. | Legacy items with no Startup relation disappear entirely |
| `Category` | Recommended | Garage | Select | Category blank |
| `Document Type` | Recommended | Garage | Select | Type blank |
| `File URL` | Recommended | Garage | URL | File link absent |
| `Status` | Recommended | Garage | Select | Status blank |
| `Priority` | Recommended | Sort field, Garage display | Select — also the sort field | Items unordered |
| `VC Relevance` | Recommended | Garage | Select | VC relevance blank |

---

## Daily Briefings [OS v2]

DB constant: `DB.dailyBriefings`  
Used by: Admin dashboard `getDailyBriefing()`. Written by the `generate-daily-briefing` cron (07:30 UTC weekdays).

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Date` | Yes | `getDailyBriefing()` — primary filter | Date property. Queried with exact equality against today's date string (`YYYY-MM-DD`). | Dashboard always shows null briefing regardless of records present |
| `Focus of the Day` | Yes | Admin dashboard — top section | Rich text — primary section of briefing | Focus block blank every day |
| `Meeting Prep` | Recommended | Admin dashboard | Rich text | Section blank |
| `My Commitments` | Recommended | Admin dashboard | Rich text | Section blank |
| `Follow-up Queue` | Recommended | Admin dashboard | Rich text | Section blank |
| `Agent Queue` | Recommended | Admin dashboard | Rich text | Section blank |
| `Market Signals` | Recommended | Admin dashboard | Rich text | Section blank |
| `Ready to Publish` | Recommended | Admin dashboard | Rich text | Section blank |
| `Generated At` | Recommended | Admin — freshness display | Date | Generation time absent |
| `Status` | Recommended | Admin — stale indicator | Select: `"Fresh"` \| `"Stale"` \| `"Generating"` | Freshness status blank |

---

## Agent Drafts [OS v2]

DB constant: `DB.agentDrafts`  
Used by: Admin Hall agent queue, approve-draft route, all `run-skill/*` routes (write), `getAgentDrafts()` (read).

| Field name | Required? | Used by | Purpose | Risk if renamed / removed / left empty |
|---|---|---|---|---|
| `Title` or `Name` | Yes | `getAgentDrafts()` — read path | Title property. Tries `"Title"` first, then `"Name"`. **Schema note — Not fully verified:** `run-skill/*` routes write to `"Draft Title"` (title type) and `"Content"` (rich text). `getAgentDrafts()` reads `"Title"` and `"Draft Text"`. If the actual DB title property is named `"Draft Title"`, then `getAgentDrafts()` silently returns `"Untitled"` for all skill-generated drafts. | All skill-generated drafts show "Untitled" in agent queue |
| `Status` | Yes | Approve-draft route, queue filter | Select: `"Pending Review"` \| `"Approved"` \| `"Revision Requested"` \| `"Superseded"`. Primary filter. | Queue always empty or approve action writes to wrong field |
| `Type` | Recommended | Admin queue — type badge | Select: `"LinkedIn Post"` \| `"Follow-up Email"` \| `"Check-in Email"` | Type badge blank |
| `Voice` | Recommended | Admin queue | Select: `"JMM"` \| `"CH"` | Voice indicator blank |
| `Platform` | Recommended | Admin queue | Select: `"LinkedIn"` \| `"Email"` \| `"Internal"` | Platform indicator blank |
| `Draft Text` | Yes (read path) | `getAgentDrafts()` — body display | Rich text (multi-chunk). **Schema note — Not fully verified:** run-skill routes write to `"Content"`, not `"Draft Text"`. If these are different fields, draft body is blank in the approval UI for skill-generated drafts. | Draft body absent in approval UI |
| `Related Entity` | Recommended | Approval UI — entity linking | Relation — optional link to an org or person | Entity context absent in UI |
| `Created Date` | Recommended | Queue sort | Date | Drafts appear in random order |

---

## Most fragile parts of the Notion contract

These are the five schema dependencies most likely to silently break the portal if changed casually.

### 1. `Validation Status` on CH Evidence [OS v2]

Used in every significant OS pipeline step. The validation-operator cron filters for `"Reviewed"` and writes `"Validated"`. Stats filter for `"New"` (pending) and `"Validated"` (done). Project card counts depend on it. The P1 banner queries it. `getReusableEvidence()` requires both `"Reusability Level"` and `"Validation Status"` to match simultaneously.

Renaming this field, or changing any of the three option values (`"New"` / `"Reviewed"` / `"Validated"`), silently zeroes out all evidence pipeline stats, stops auto-validation, and empties the P1 banner.

### 2. `Project Status` = `"Active"` on CH Projects [OS v2]

`getAllProjects()` filters for `select equals "Active"`. This is the single entry point for almost every project-scoped query in the portal. If the option value is renamed (e.g., to `"Live"` or `"Active Project"`), all projects disappear from every surface simultaneously — Hall, Workroom, Garage, Admin, stats. There is no fallback.

### 3. `Primary Workspace` on CH Projects [OS v2]

This select field drives all workspace routing. The code default for a blank value is `"hall"`, which means Workroom and Garage never activate unless the field contains exactly `"workroom"` or `"garage"`. Renaming the field (not just the option values) silently routes all clients to Hall only, with no error. The routing logic is in `parseProject()` at `src/lib/notion.ts:231`.

### 4. `Startup` relation on Valuations, Cap Table, Data Room [OS v2]

All three Garage financial databases are queried via `filter: { property: "Startup", relation: { contains: orgIds[0] } }`. If this relation field is renamed in any of the three databases, the corresponding `getValuationsForProject()`, `getCapTableForProject()`, or `getDataRoomForProject()` queries return empty with no error. The Data Room has a partial fallback via `Notes` text search, but Valuations and Cap Table have no fallback at all.

### 5. `Date` on Daily Briefings [OS v2]

`getDailyBriefing()` queries with `filter: { property: "Date", date: { equals: target } }` where `target` is today's ISO date string. If this field is renamed, the query matches zero records and the admin dashboard "Focus of the Day" section is permanently blank, silently, every day — with no indication anything is wrong. There is no fallback date field.

---

## Schema areas that still need manual audit

The following areas were not fully verifiable from `src/lib/notion.ts` alone:

1. **Agent Drafts title/body field name discrepancy** — `getAgentDrafts()` reads `"Title"` and `"Draft Text"`, but `run-skill/*` routes write `"Draft Title"` and `"Content"`. Whether the actual Notion schema property is named `"Title"` or `"Draft Title"` needs to be confirmed by inspecting the live DB schema.

2. **Grant Sources [OS v2]** (`DB.grantSources`) — referenced in `seed-grant-sources` route but has no read-path in `notion.ts`. The schema used during seeding (fields: `Source Name`, `URL`, `Type`, `Geography`, `Themes`, `Active`) is not verified against any live read query.

3. **Agreements & Obligations [OS v2]** — referenced in RUNBOOK.md and the grants system but not present in `DB` constants or `notion.ts`. Grant agreements may be read directly via agent skill files only. Not audited here.

4. **Style Profiles [OS v2]** (`DB.styleProfiles`) — `getStyleProfiles()` is defined in `notion.ts` but the fields (`Master Prompt`, `Tone Summary`, `Structural Rules`, `Vocabulary Patterns`, `Forbidden Patterns`, `CTA Style`, `First Person Allowed`) are only confirmed as written in code, not verified against the actual live schema.

5. **Insight Briefs [OS v2]** (`DB.insightBriefs`) — used in `getInsightBriefs()` for Living Room signals. Fields `"Brief Title"` (with fallback to `"Name"`), `"Theme"`, `"Relevance"`, `"Status"`, `"Community Relevant"`, `"Visibility"` are read by code but the schema also has many agent-facing fields (`Executive Summary`, `Key Facts`, `Key Insights`, etc.) referenced in skill files that are not audited here.
