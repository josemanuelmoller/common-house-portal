/**
 * Garage — Block Model
 *
 * The Garage is the primary workspace for startup / venture / acceleration engagements.
 * Route: /garage — BUILT ✓ (waiting for first startup project assignment)
 *
 * Triggered when: CH Projects [OS v2] → Primary Workspace = "garage"
 * Engagement Model: startup (startup / venture / acceleration / startup-like partnership)
 *
 * The Garage vs The Workroom:
 *   The Workroom is for delivery — implementation, coordination, executive clarity.
 *   The Garage is for building — startup momentum, commitments, execution, capital context.
 *
 * ─── HALL vs GARAGE SPLIT ─────────────────────────────────────────────────────
 *
 * The Hall owns:                    The Garage owns:
 * ─ Welcome / framing               ─ Where the build is right now
 * ─ What We Heard (narrative)       ─ Active commitments (what we said we'd do)
 * ─ Project challenge / success     ─ Active blockers (what's in the way)
 * ─ Team introduction               ─ Working sessions
 * ─ Stage orientation               ─ Decisions locked
 *                                   ─ Curated materials (deck, model, memo)
 *
 * The Hall = relationship / narrative / orientation layer
 * The Garage = build momentum / commitment / execution clarity layer
 *
 * Both surfaces read the same Notion OS. No data duplication.
 * The Hall remains accessible via sidebar even when Garage is primary.
 *
 * ─── BLOCK INVENTORY ─────────────────────────────────────────────────────────
 *
 * Block                  Source                          Component
 * ───────────────────────┼───────────────────────────────┼─────────────────────
 * GarageHeader           project.name, stage, mode        dark — builder mood
 * GarageSnapshot         currentFocus, draftUpdate        60-second truth
 * GarageBlockers         Blocker evidence (Validated)     what's in the way
 * GarageCommitments      Action Item evidence (Validated)  what we said we'd do
 * GarageSessions         meetings with processedSummary   working session recaps
 * GarageDecisions        Decision evidence (Validated)    locked agreements
 * GarageMaterials        getDocumentsForProject()         decks, models, memos
 * GarageDigitalResidents DIGITAL_RESIDENTS (garage)       capability layer
 */

// ─── Garage Mode ──────────────────────────────────────────────────────────────
// Source of truth: "Workroom Mode" select in CH Projects [OS v2] when
// Primary Workspace = "garage". The Garage reuses the same Notion field.
//
// pre-seed / seed / series-a → funding stage startup
// acceleration → accelerator program / cohort
// venture-build → corporate venture building engagement

export type GarageMode =
  | "pre-seed"
  | "seed"
  | "series-a"
  | "acceleration"
  | "venture-build";

// ─── Garage Project ───────────────────────────────────────────────────────────

export type GarageProject = {
  id: string;
  name: string;
  stage: string;
  garageMode: string;     // from workroomMode field in Notion
  lastUpdated: string;
  currentFocus: string;   // from hallCurrentFocus or statusSummary
  draftUpdate: string;    // from Draft Status Update — OS-written assessment
};

// ─── Garage Blocks ────────────────────────────────────────────────────────────

export type GarageBlocker = {
  id: string;
  title: string;
  excerpt?: string;
};

export type GarageCommitment = {
  id: string;
  title: string;
  excerpt?: string;
  date?: string;          // dateCaptured from evidence
};

export type GarageSession = {
  id: string;
  title: string;
  date: string;
  summary: string;
};

export type GarageDecision = {
  id: string;
  title: string;
  date: string;
  context?: string;
};

export type GarageMaterial = {
  id: string;
  title: string;
  url: string;
  platform: string;
  addedDate?: string;
};

export type GarageData = {
  project: GarageProject;
  blockers: GarageBlocker[];
  commitments: GarageCommitment[];
  sessions: GarageSession[];
  decisions: GarageDecision[];
  materials: GarageMaterial[];
};
