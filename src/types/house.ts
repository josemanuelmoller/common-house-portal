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
 *   The Garage   /garage       BUILT ✓   Primary workspace for startup /
 *                                         venture / acceleration engagements.
 *                                         Client-facing: LIVE (waiting for
 *                                         first garage project assignment).
 *
 *   The Library  /library      BUILT ✓   Transversal intelligence layer.
 *                                         Signals, cases, viewpoints, patterns.
 *                                         Cross-project. Admin-only for now.
 *
 *   The Residents /residents   BUILT ✓   Transversal people / network layer.
 *                                         Co-Founders, Core Team, EIRs.
 *                                         Cross-project. Admin-only for now.
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
//   "garage"   — Startup / venture / acceleration workspace.                   BUILT ✓
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

// ─── Residents — The Unified House Layer ──────────────────────────────────────
// Route: /residents   BUILT ✓   Admin-only (for now)
//
// DEFINITION:
//   Residents is the transversal House layer that contains both:
//     1. Human Residents  — the people behind the House
//     2. Digital Residents — the capabilities that inhabit and support the House
//
//   This is the canonical home for all residents. Digital Residents may also appear
//   contextually in Hall, Workroom, and Control Room — but those are surface-specific
//   previews. The full picture lives here.
//
// HUMAN RESIDENTS:
//   The people of Common House — co-founders, team, EIRs, partners.
//   They are not a contact database. They are the network that powers the work.
//   Sourced from: CH People [OS v2] via getAllPeople()
//
//   Human sections (current):
//     co_founder   — Internal + Founder role (2 people)
//     core_team    — Internal, non-Founder (expandable)
//     eir          — External + Startup Founder role (6 EIRs, 5 countries)
//
//   PersonRecord fields: name, jobTitle, email, classification, roles, linkedin?, location?
//
// DIGITAL RESIDENTS:
//   The operational capabilities that inhabit the House.
//   They are NOT people, NOT bots, NOT raw agents.
//   They are the visible face of what the OS does — expressed as coherent roles.
//   Sourced from: DIGITAL_RESIDENTS constant in house.ts (static — no DB)
//
//   Digital roles: memory_keeper, decision_keeper, progress_keeper (client-facing)
//                  knowledge_keeper, house_steward (internal only)
//
//   Surface map:
//     /residents   → canonical home — all 5 roles, full profile, admin view
//     /hall        → contextual preview — client-facing roles (3), focused on Hall use
//     /workroom    → contextual preview — client-facing roles (3), focused on delivery
//     /admin       → knowledge_keeper + house_steward (internal layer)

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

// ─── Onboarding — Lifecycle / Transition Layer ───────────────────────────────
//
// Onboarding is NOT a Room, NOT a System, and NOT a Shared Space.
// It is a lifecycle/transition layer that surfaces within Rooms at key threshold moments.
// It creates continuity between engagement phases — it does not replace Room content.
//
// Onboarding moments:
//   relationship_start    — client first enters the Hall in "explore" mode
//   workroom_activation   — project activates to Workroom (live + workspace = workroom)
//   garage_activation     — project activates to Garage (future — not yet built)
//
// Implementation model:
//   Rendered as conditional blocks inside Rooms — no dedicated route.
//   Triggered by HallMode (explore/live) and project.primaryWorkspace.
//   Tone: editorial and minimal. NOT a checklist. NOT a tutorial. NOT a progress tracker.
//
// Surface map:
//   The Hall     → relationship_start (explore mode) + workroom_activation (live mode)
//   The Workroom → (entry is itself the workroom_activation result)
//   The Garage   → garage_activation (future)

export type OnboardingMoment =
  | "relationship_start"
  | "workroom_activation"
  | "garage_activation";

// ─── Digital Residents — Part of the Residents Layer ─────────────────────────
//
// Digital Residents are the operational capabilities that inhabit the House.
// They are NOT people, NOT bots, NOT raw agents, NOT standalone features.
// They are the visible face of what the OS does — expressed as coherent roles.
//
// CANONICAL HOME: /residents  (full profile, all roles including internal)
// CONTEXTUAL PREVIEWS: /hall, /workroom, /admin  (surface-specific subset)
//
// Roles:
//   memory_keeper     — captures conversations, documents, and exchanges
//   decision_keeper   — records what was agreed, by whom, and when
//   progress_keeper   — monitors what is moving, what is blocked, what has changed
//   knowledge_keeper  — synthesises patterns and intelligence across projects
//   house_steward     — oversees system health and operational continuity
//
// Surface map:
//   /residents   → all 5 roles, full profile, admin-only canonical view
//   /hall        → memory_keeper, decision_keeper, progress_keeper (client-facing preview)
//   /workroom    → memory_keeper, decision_keeper, progress_keeper (delivery preview)
//   /garage      → memory_keeper, decision_keeper, progress_keeper (builder preview)
//   /admin       → knowledge_keeper, house_steward (internal-only layer)
//
// What Digital Residents are NOT:
//   ✗ Chatbots or interactive assistants
//   ✗ Raw subagents with exposed internal names
//   ✗ Automation scripts or marketing features
//   ✓ They are operational inhabitants of the House — they support the work,
//     they do not replace judgment, conversation, or leadership.

export type DigitalResidentRole =
  | "memory_keeper"
  | "decision_keeper"
  | "progress_keeper"
  | "knowledge_keeper"
  | "house_steward";

export type DigitalResidentProfile = {
  role: DigitalResidentRole;
  displayName: string;
  tagline: string;
  signals: string[];
  surfaces: ("hall" | "workroom" | "garage" | "control_room")[];
  clientVisible: boolean;
};

export const DIGITAL_RESIDENTS: DigitalResidentProfile[] = [
  {
    role: "memory_keeper",
    displayName: "The Memory Keeper",
    tagline: "Captures every conversation, document, and exchange",
    signals: ["meeting transcripts", "email threads", "shared materials"],
    surfaces: ["hall", "workroom", "garage"],
    clientVisible: true,
  },
  {
    role: "decision_keeper",
    displayName: "The Decision Keeper",
    tagline: "Records what was agreed, by whom, and when",
    signals: ["validated decisions", "agreements", "key moments"],
    surfaces: ["hall", "workroom", "garage"],
    clientVisible: true,
  },
  {
    role: "progress_keeper",
    displayName: "The Progress Keeper",
    tagline: "Monitors what is moving, what is blocked, what has changed",
    signals: ["action items", "blockers", "status signals"],
    surfaces: ["hall", "workroom", "garage"],
    clientVisible: true,
  },
  {
    role: "knowledge_keeper",
    displayName: "The Knowledge Keeper",
    tagline: "Synthesises patterns and intelligence across projects",
    signals: ["reusable evidence", "cross-project insights", "canonical knowledge"],
    surfaces: ["control_room"],
    clientVisible: false,
  },
  {
    role: "house_steward",
    displayName: "The House Steward",
    tagline: "Oversees system health and operational continuity",
    signals: ["source hygiene", "validation backlog", "evidence completeness"],
    surfaces: ["control_room"],
    clientVisible: false,
  },
];

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
