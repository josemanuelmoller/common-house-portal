/**
 * Workroom — Block Model
 *
 * The Workroom is the active delivery workspace for non-startup engagements.
 * Route: /workroom — NOT YET BUILT as a full client experience.
 *
 * Triggered when: CH Projects [OS v2] → Primary Workspace = "workroom"
 * Configured by: WorkroomMode (corporate | implementation | city | initiative | partnership)
 *
 * Reference case for MVP definition: Auto Mercado - Fase 2
 *   engagementModel: delivery
 *   workroomMode:    implementation
 *   stage:           Pilot Planning → Pilot Live
 *
 * ─── HALL vs WORKROOM SPLIT ───────────────────────────────────────────────────
 *
 * The Hall owns:                    The Workroom owns:
 * ─ Welcome / framing               ─ Live status + current focus
 * ─ What We Heard (narrative)       ─ Active blockers
 * ─ Project challenge / success     ─ What's in motion (action items)
 * ─ Team introduction               ─ Operational materials
 * ─ Stage orientation               ─ Session log (meeting recaps)
 * ─ Relationship continuity         ─ Agreements reached (decisions)
 *                                   ─ Activity pulse (source counts)
 *
 * The Hall = relationship / narrative / continuity layer
 * The Workroom = delivery / coordination / executive clarity layer
 *
 * Both surfaces read from the same Notion OS. No data duplication.
 * The Hall remains accessible via sidebar even when Workroom is primary.
 *
 * ─── MVP BLOCK INVENTORY (WorkroomMode = "implementation") ───────────────────
 *
 * Block                 Source                          Component
 * ──────────────────────┼───────────────────────────────┼──────────────────────
 * WorkroomHeader        project.name, stage, lastUpdate  new (no welcome note)
 * ActiveBlockers        Blocker evidence (Validated)     dashboard blocker card
 * WhatsInMotion         hallCurrentFocus / NextSteps     new list
 * OperationalMaterials  getDocumentsForProject()         DocumentsSection reuse
 * SessionLog            getSourceActivity() meetings     Conversations reuse
 * AgreementsReached     Decision evidence (Validated)    HallDecisions reuse
 * ActivityPulse         getSourceActivity() counts       ActivityBar reuse
 *
 * ─── REUSABLE FROM EXISTING DASHBOARD ────────────────────────────────────────
 *
 * Component             File                             Notes
 * ──────────────────────┼───────────────────────────────┼──────────────────────
 * ActivityBar           src/components/ActivityBar.tsx   direct reuse
 * DocumentsSection      src/components/DocumentsSection  direct reuse
 * HallDecisions         src/components/hall/HallDecisions rename or reuse as-is
 * Conversations         src/components/hall/Conversations rename to SessionLog
 * StatusBadge           src/components/StatusBadge       direct reuse
 * Sidebar               src/components/Sidebar           new NAV items only
 *
 * NOT reused: UploadZone, DraftUpdateCard, MeetingsSection (raw),
 *             CollapsibleSection — too operational or replaced by better components
 */

// ─── Workroom Project ─────────────────────────────────────────────────────────

export type WorkroomProject = {
  id: string;
  name: string;
  stage: string;
  workroomMode: string;
  lastUpdated: string;
  currentFocus: string;    // from hallCurrentFocus or statusSummary
  draftUpdate: string;     // from Draft Status Update — OS-written, last known state
};

// ─── Workroom Blocks ──────────────────────────────────────────────────────────

export type WorkroomBlocker = {
  id: string;
  title: string;
  excerpt?: string;
};

export type WorkroomNextStep = {
  id: string;
  label: string;
  owner?: string;
  dueDate?: string;
};

export type WorkroomMaterial = {
  id: string;
  title: string;
  url: string;
  platform: string;
  addedDate?: string;
};

export type WorkroomSession = {
  id: string;
  title: string;    // cleaned meeting title (strip [Meeting] Proj — prefix)
  date: string;
  summary: string;  // from Processed Summary field in CH Sources [OS v2]
};

export type WorkroomDecision = {
  id: string;
  title: string;
  date: string;
  context?: string;
};

export type WorkroomData = {
  project: WorkroomProject;
  blockers: WorkroomBlocker[];         // from Validated Blocker evidence
  nextSteps: WorkroomNextStep[];       // future — from NextSteps once added
  materials: WorkroomMaterial[];       // from getDocumentsForProject()
  sessions: WorkroomSession[];         // from getSourceActivity() meetings with summary
  decisions: WorkroomDecision[];       // from Validated Decision evidence
};

// ─── Workspace readiness guard ────────────────────────────────────────────────
// Used by hall/page.tsx to gate Workroom CTA and by workroom/page.tsx to
// redirect non-ready workspace requests back to /hall.
// Flip workroom to true once /workroom is built and client-ready.
// Flip garage to true once /garage is built and client-ready.

export type WorkspaceReadiness = {
  workroom: boolean;
  garage: boolean;
};

// Current readiness state — update here when a workspace goes live:
export const WORKSPACE_READY: WorkspaceReadiness = {
  workroom: true,   // /workroom is built and client-ready
  garage: true,     // /garage is built — activate by setting Primary Workspace = "garage" in Notion
};
