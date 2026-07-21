/**
 * Shared types for the ingestor layer.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §5 (Ingestor contract) and §6 (Signal types).
 * Every ingestor (Gmail, Fireflies, Calendar, WhatsApp, Drive, Contacts, Loops)
 * emits signals that conform to these types.
 */

export type SourceType =
  | "gmail"
  | "fireflies"
  | "calendar"
  | "whatsapp"
  | "contacts"
  | "drive"
  | "loops"
  | "evidence_derived";

export type Intent =
  | "reply"
  | "decide"
  | "approve"
  | "deliver"
  | "chase"
  | "review"
  | "prep"
  | "nurture"
  | "close_loop"
  | "follow_up";

export type BallInCourt = "jose" | "them" | "team" | "unknown";

/**
 * Estimated work size for an action item. Set at ingest time (classifier or
 * static mapping). Drives Suggested Time Blocks eligibility:
 *   quick   — ≤15 min (reply, confirm, nudge). Dispatched from Inbox/ledger,
 *             never earns an individual time block (only the batch block).
 *   focused — 30–60 min (review a doc, prepare notes, substantial email).
 *             Earns a block only under time pressure (deadline / meeting).
 *   session — 90 min+ of production work (draft a document, build a model).
 *             Always block-eligible while open.
 */
export type Effort = "quick" | "focused" | "session";

export type Warmth = "hot" | "warm" | "cool" | "dormant";

/** Audit trail for priority_score — see priority.ts. */
export type PriorityFactors = {
  intent_base: number;
  deadline_pressure: number;
  recency: number;
  relationship_weight: number;
  objective_link: number;
  /** +20 when the item is founder-owned (capped at 100 downstream). */
  founder_bonus: number;
  /**
   * −20 when the item comes from a mentorship-level project on a substrate
   * (Gmail / Calendar / WhatsApp) that has no per-item actor classifier.
   * Lets the item still surface, but ranks it below operational items
   * in the CoS desk and the Inbox. Default 0.
   */
  mentorship_penalty?: number;
};

/** Common envelope for every signal. */
export type SignalEnvelope = {
  source_type: SourceType;
  source_id: string;
  source_url?: string;
  emitted_at: string; // ISO timestamp
  ingestor_version: string;
  related_ids?: {
    contact_id?: string;
    project_id?: string;
    conversation_id?: string; // FK sources.id in Supabase
    objective_id?: string;
  };
};

export type ActionSignal = SignalEnvelope & {
  kind: "action";
  payload: {
    intent: Intent;
    ball_in_court: BallInCourt;
    owner_person_id?: string | null;
    founder_owned?: boolean;
    next_action: string | null;
    subject: string;
    counterparty: string | null;
    deadline: string | null; // ISO or null
    last_motion_at: string;
    consequence: string | null;
    priority_factors: PriorityFactors;
    /** Estimated work size. Optional — persist leaves the column untouched when absent. */
    effort?: Effort | null;
  };
};

export type RelationshipSignal = SignalEnvelope & {
  kind: "relationship";
  payload: {
    contact_id: string;
    direction: "inbound" | "outbound" | "meeting";
    at: string; // ISO timestamp
    /**
     * Cleaned counterparty display name (already passed through
     * cleanHeaderName), or null/undefined when unavailable/unusable. When
     * present, persist fills an email-like people.full_name/display_name from
     * it — it NEVER overwrites an already-good name. Root-cause fix for the
     * Gmail path that used to store the sender's email as full_name.
     */
    counterparty_name?: string | null;
  };
};

export type Signal = ActionSignal | RelationshipSignal;

export type IngestInput = {
  /** Override watermark; if undefined, read from ingestor_state. */
  since?: string; // ISO timestamp
  /** "delta" = read watermark; "backfill" = caller-provided since, no watermark write on success. */
  mode: "delta" | "backfill";
  /** If true, signals are collected but not persisted; ingestor_runs still written with dry_run=true. */
  dryRun?: boolean;
  /** Hard cap on how many source records to process in one run. Defaults to 100. */
  maxItems?: number;
};

export type IngestError = {
  source_id?: string;
  message: string;
  stack?: string;
};

export type IngestResult = {
  source_type: SourceType;
  ingestor_version: string;
  started_at: string;
  finished_at: string;
  since_watermark: string | null;
  to_watermark: string | null;
  processed: number;
  skipped: number;
  errors: IngestError[];
  fallback_used?: string;
  signals: Signal[];
  dry_run: boolean;
  run_id: string | null; // uuid of ingestor_runs row, null when dryRun and not logged
};
