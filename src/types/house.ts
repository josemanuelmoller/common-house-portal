/**
 * House Architecture — Product Model
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The House is Common House's unified client experience system.
 * One shared OS + data backbone (Notion). Multiple experience surfaces on top.
 *
 * ─── SURFACES ─────────────────────────────────────────────────────────────────
 *
 *   The Hall     /hall         BUILT ✓   Universal entry layer. Every client
 *                                         lands here first. Relationship,
 *                                         framing, narrative, team, agreements.
 *
 *   The Workroom /workroom     BUILT ✓   Active delivery workspace for
 *                                         non-startup engagements. Delivery,
 *                                         coordination, status, blockers.
 *                                         Configurable by WorkroomMode.
 *                                         Client-facing: LIVE.
 *
 *   The Garage   /garage       PLANNED ○  Primary workspace for startup /
 *                                         venture / acceleration engagements.
 *                                         Client-facing: NOT YET BUILT.
 *
 *   The Library  /library      PLANNED ○  Transversal intelligence layer.
 *                                         Signals, cases, viewpoints, patterns.
 *                                         Cross-project. Not a project workspace.
 *
 *   The Residents /residents   PLANNED ○  Transversal people / network layer.
 *                                         Core team, partners, specialists.
 *                                         Cross-project. Not a project workspace.
 *
 * ─── DESIGN PRINCIPLES ────────────────────────────────────────────────────────
 *
 *   1. The Hall is always the entry layer. Even when another workspace is
 *      primary, clients arrive at The Hall first.
 *   2. Workspace assignment is human-controlled. No auto-switching.
 *   3. If a primary workspace is not yet built, The Hall is the live surface.
 *   4. Library and Residents are transversal — not project workspaces.
 *   5. No backend silos. All surfaces read the same Notion OS.
 *   6. Garage and Workroom are not separate systems — same data, different lens.
 */

// ─── 3-Layer Architecture ─────────────────────────────────────────────────────
//
// The House has three distinct layers. Understanding the distinction prevents
// confusing client surfaces with internal tooling.
//
// LAYER 1 — ROOMS (how the work is experienced — client-facing)
// ─────────────────────────────────────────────────────────────
// RoomType — Client-facing experience surfaces. Built on top of the OS.
//   "hall"     — Universal entry layer. Every client lands here first.         BUILT ✓
//   "workroom" — Active delivery workspace (delivery / implementation engagements). BUILT ✓
//   "garage"   — Startup / venture / acceleration workspace.                   PLANNED ○
//
// LAYER 2 — SYSTEMS (how the work is run — internal engine)
// ─────────────────────────────────────────────────────────
// SystemType — The operating infrastructure. Not a client surface.
//   "os"       — Common House OS v2 (Notion backbone + Claude Code engine).
//   "knowledge"— Knowledge Assets layer (patterns, signals, cases, viewpoints).
//   "health"   — System health & hygiene monitoring.
//
//   FUTURE SYSTEMS (not yet built — planned additions to the System layer):
//   "commercial"  — Pipeline, proposals, commercial relationships.
//   "capital"     — Funding, investor relations, capital tracking.
//   "publishing"  — Content, publications, external communications.
//   "intelligence"— Radar: macro signals, market intelligence, external scanning.
//
// LAYER 3 — THE CONTROL ROOM (how the work is operated — internal staff)
// ─────────────────────────────────────────────────────────────────────────
// ControlRoomScope — Internal staff layer. Admin-only. Maps to /admin routes.
//   "pmo"      — PMO / Delivery: project health, source activity → /admin
//   "intake"   — Intake / Exceptions: sources, evidence queue → /admin/os
//   "knowledge"— Knowledge review → /admin/knowledge
//   "health"   — System health stats → /admin/health
//
//   Two operating lenses (ControlRoomViewType):
//   "my-rooms"   — Personal lens: my projects, my deadlines, my alerts.
//   "house-view" — Operating lens: all rooms at risk, stale rooms, blockers.
//
// No overlap: Rooms are client-facing. Systems are the backbone. Control Room
// is internal staff tooling. All three read the same Notion OS.

export type RoomType = "hall" | "workroom" | "garage";

export type SystemType = "os" | "knowledge" | "health";

export type ControlRoomScope = "pmo" | "intake" | "knowledge" | "health";

export type ControlRoomViewType = "my-rooms" | "house-view";

// ─── Primary Workspace ────────────────────────────────────────────────────────
// Source of truth: "Primary Workspace" select in CH Projects [OS v2].
// Drives which workspace is the main active surface for the engagement.
// Default/fallback: "hall". Applied by hall/page.tsx via WORKSPACE_READY guard.

export type PrimaryWorkspace = "hall" | "garage" | "workroom";

// ─── Engagement Stage ─────────────────────────────────────────────────────────
// Source of truth: "Engagement Stage" select in CH Projects [OS v2].
// Supporting context — does NOT directly drive routing.
// pre-sale: relationship forming, not yet contracted / scoped
// active:   engagement underway with defined scope and deliverables

export type EngagementStage = "pre-sale" | "active";

// ─── Engagement Model ─────────────────────────────────────────────────────────
// Source of truth: "Engagement Model" select in CH Projects [OS v2].
// Supporting context — informs suggested primary workspace.
// startup:  startup / venture / acceleration / startup-like partnership → Garage
// delivery: delivery / advisory / implementation / corporate / policy → Workroom

export type EngagementModel = "startup" | "delivery";

// ─── Workroom Mode ────────────────────────────────────────────────────────────
// Source of truth: "Workroom Mode" select in CH Projects [OS v2].
// Only meaningful when PrimaryWorkspace = "workroom".
// One Workroom — configurable by mode. No separate rooms per engagement type.
// corporate:      established orgs, governance focus, executive cadence
// implementation: active pilots, delivery milestones, cross-functional teams
// city:           public sector, city/policy, multi-stakeholder
// initiative:     bounded initiatives, campaigns, defined-outcome engagements
// partnership:    bilateral or multi-party ongoing relationships

export type WorkroomMode =
  | "corporate"
  | "implementation"
  | "city"
  | "initiative"
  | "partnership";

// ─── Routing Model ────────────────────────────────────────────────────────────
// Current routing (Hall is universal):
//   /        → /hall  (always — Hall handles workspace routing internally)
//   /hall    → Hall renders for all clients, regardless of primaryWorkspace
//   /workroom → full client Workroom (gated: primaryWorkspace === "workroom")  BUILT ✓
//   /garage  → not yet built
//
// Future routing (once workspace is built + WORKSPACE_READY.x = true):
//   /hall    → renders Hall entry + shows CTA toward primary workspace
//   /workroom → full client Workroom (gated: primaryWorkspace === "workroom")
//   /garage  → full client Garage   (gated: primaryWorkspace === "garage")
//
// RULE: The Hall never auto-redirects away. Workspace navigation is additive
//       (CTA/sidebar link in Hall), never a forced redirect.
// RULE: /workroom redirects to /hall if WORKSPACE_READY.workroom is false.
// RULE: /garage redirects to /hall if WORKSPACE_READY.garage is false.

// ─── Library — Transversal Intelligence Layer ─────────────────────────────────
// Route: /library (not built)
// Scope: Cross-project. Not tied to any single project or engagement.
// Access: CH team always; clients optionally (configurable per project).
//
// Role:
//   The Library is where Common House's accumulated intelligence lives.
//   It is not a project workspace — it is the institutional memory layer.
//   Clients can see curated signals and cases relevant to their domain;
//   the CH team sees the full internal knowledge system.
//
// Content families:
//   signals     — observations, trends, emerging conditions from the field
//   cases       — project references, analogues, precedents (sanitized)
//   viewpoints  — CH perspective pieces, frameworks, positions
//   patterns    — recurring dynamics across projects (from reusable evidence)
//
// Data sources:
//   CH Knowledge Assets [OS v2]      — canonical reusable knowledge
//   CH Evidence [OS v2] (Reusable)   — validated cross-project insights
//   Curated document links           — CH-selected external references
//
// Client access model:
//   summary_only — clients see curated signals + relevant cases
//   restricted   — CH team only
//   project_scoped — only shows content tagged to client's themes/geography

export type LibraryContentFamily =
  | "signal"
  | "case"
  | "viewpoint"
  | "pattern";

export type LibraryItem = {
  id: string;
  title: string;
  family: LibraryContentFamily;
  summary: string;
  tags: string[];           // themes, geography, engagement model
  sourceUrl?: string;       // link to Notion knowledge asset or external ref
  publishedDate?: string;
  accessLevel: "summary_only" | "full" | "restricted";
};

// ─── Residents — Transversal People / Network Layer ───────────────────────────
// Route: /residents (not built)
// Scope: Cross-project people and organization network.
// Access: CH team; clients see their own team + CH team + selected network.
//
// Role:
//   The Residents layer is the people and organizations of Common House.
//   It is not a contact database — it is the network that powers the work.
//   A person in Residents may appear across multiple projects.
//   The goal is to make relationships legible, not just trackable.
//
// Resident categories:
//   core_team     — Common House internal team members (Internal classification)
//   client_team   — Client-side counterparts on active projects
//   eir           — Entrepreneurs in Residence (advisory or embedded)
//   partner       — Powered-by partners: iRefill, UNDP, etc.
//   specialist    — Domain specialists, advisors (engaged per-project)
//   network       — Extended network, not currently engaged
//
// Data source:
//   CH People [Notion] — primary (resolution via getProjectPeople())
//   CH Organizations [Notion] — orgs linked to projects
//
// Minimum profile fields:
//   name, jobTitle, email (where available), classification (Internal/External)
//   roles: string[]    — from Relationship Roles multi-select
//   projects: string[] — list of project IDs this person appears in
//   category: ResidentCategory
//   bio?: string       — optional short bio for client-facing display
//   photoUrl?: string  — optional headshot
//
// Current coverage:
//   The Project type already supports resolution of people via getProjectPeople().
//   PersonRecord in notion.ts has: name, jobTitle, email, classification, roles.
//   Missing for Residents: cross-project index, category, bio, photoUrl.
//   These can be added as Notion properties on CH People without new databases.

export type ResidentCategory =
  | "core_team"
  | "client_team"
  | "eir"
  | "partner"
  | "specialist"
  | "network";

export type ResidentProfile = {
  id: string;
  name: string;
  jobTitle: string;
  email?: string;
  category: ResidentCategory;
  roles: string[];
  projects: string[];   // project IDs this person appears in
  bio?: string;
  photoUrl?: string;
  initials: string;
};

// ─── Workspace Suggestion (future agent) ─────────────────────────────────────
// A future skill should SUGGEST workspace assignment based on:
//   - engagementModel (startup → garage; delivery → workroom)
//   - currentStage (Discovery/Scoping → hall; active → workroom/garage)
//   - evidence patterns (implementation process steps → workroom)
//
// Rules for the suggestion agent:
//   - Propose only. Never auto-apply.
//   - Human confirmation required via admin UI before any workspace changes.
//   - Show current value vs. suggested value clearly.
//   - Log the reason for the suggestion.
//   - Do not suggest a workspace that WORKSPACE_READY marks as not ready.
