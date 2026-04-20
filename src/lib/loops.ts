/**
 * loops.ts — Loop Engine core library
 *
 * Defines the Loop as a first-class entity: a persistent, scored, deduplicated
 * record of an unresolved executive issue. Loops are stored in Supabase and
 * synced from Notion sources (Evidence, Opportunities, Projects).
 *
 * This file contains ONLY pure types, scoring logic, key builders, and the
 * CoSTask adapter. No Notion or Supabase I/O here — those live in the route files.
 */

// CoSTask shape — duplicated here to avoid circular import with notion.ts.
// notion.ts dynamically imports loops.ts; loops.ts must NOT import notion.ts.
// The two types are kept in sync manually. Structural typing ensures compatibility.
type CoSTask = {
  id: string;
  notionUrl: string;
  taskTitle: string;
  taskStatus: "todo" | "in-progress" | "waiting" | "done" | "dropped";
  dueDate: string | null;
  urgency: "critical" | "high" | "normal";
  loopType: "blocker" | "commitment" | "decision" | "prep" | "follow-up" | "review";
  interventionMoment: "urgent" | "next_meeting" | "email_this_week" | "review_this_week" | "this_week";
  opportunityName: string;
  opportunityStage: string;
  orgName: string;
  opportunityType: string;
  reviewUrl: string | null;
  entrySignal: "meeting_soon" | "proposal_pending" | "negotiation" | "manual" | "review_needed" | "inbound";
  signalReason: string;
  calendarBlockUrl: string | null;
  pendingAction: string | null;
  taskSource?: "opportunity" | "project" | "evidence";
  loopEngineId?: string;
  isPassiveDiscovery?: boolean;

  // Notion page ID of the linked opportunity (opportunity-type loops only).
  // Used by the Opportunities Explorer dedup: when the loop engine is active,
  // task.id is a Supabase UUID — not a Notion page ID — so dedup must use this field.
  linkedEntityId?: string;
};

// ─── DB row shapes ────────────────────────────────────────────────────────────

export type LoopType =
  | "blocker"
  | "commitment"
  | "decision"
  | "prep"
  | "review"
  | "follow_up";

export type LoopStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "resolved"
  | "dismissed"
  | "reopened";

/** Statuses where a loop is actively surfaced in the main CoS desk. */
export const ACTIVE_LOOP_STATUSES: LoopStatus[] = ["open", "in_progress", "reopened"];

/** Parked — present but moved out of the urgent surface. */
export const PARKED_LOOP_STATUSES: LoopStatus[] = ["waiting"];

/** Terminal states. */
export const TERMINAL_LOOP_STATUSES: LoopStatus[] = ["resolved", "dismissed"];

export type InterventionMoment =
  | "urgent"
  | "next_meeting"
  | "email_this_week"
  | "review_this_week"
  | "this_week";

export type LinkedEntityType =
  | "evidence"
  | "opportunity"
  | "project";

export type SignalType =
  | "evidence_blocker"
  | "evidence_commitment"
  | "project_obstacle"
  | "opportunity_signal"
  | "manual";

export type ActionType =
  | "created"
  | "updated"
  | "marked_in_progress"
  | "marked_waiting"
  | "resolved"
  | "dismissed"
  | "reopened"
  | "raised_in_meeting"
  | "email_sent"
  | "reviewed"
  | "decision_made";

export type Loop = {
  id: string;
  normalized_key: string;
  // Semantic identity: survives Notion page churn. Same underlying issue
  // re-created under a new Notion page_id (regenerator rewrite) resolves to
  // the same intent_key and must NOT create a fresh loop.
  intent_key: string | null;
  // Lineage: first loop in a family (self on creation). Reopens preserve
  // lineage_id so lineage traces the same topic across time.
  lineage_id: string | null;
  parent_loop_id: string | null;
  title: string;
  loop_type: LoopType;
  status: LoopStatus;
  intervention_moment: InterventionMoment;
  priority_score: number;
  linked_entity_type: LinkedEntityType;
  linked_entity_id: string;
  linked_entity_name: string;
  notion_url: string;
  review_url: string | null;
  due_at: string | null;       // ISO timestamp or null
  signal_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_action_at: string | null;
  // Lifecycle timestamps — source of truth for "when did this happen"
  resolved_at: string | null;
  dismissed_at: string | null;
  reopened_at: string | null;
  reopen_count: number;
  // Fingerprint of the most recent evidence content used to judge whether
  // a new sync is materially new or just a paraphrase.
  last_meaningful_evidence_at: string | null;
  last_evidence_fingerprint: string | null;
  created_at: string;
  updated_at: string;
  // Track A: interest gate
  is_passive_discovery: boolean;
  founder_interest: string | null;    // null | 'watching' | 'interested' | 'dropped'
  // Track F: founder ownership
  founder_owned: boolean;             // true = strategic founder-led item; gets +20 score bonus
};

export type LoopSignal = {
  id: string;
  loop_id: string;
  signal_type: SignalType;
  source_id: string;
  source_name: string;
  source_excerpt: string | null;
  captured_at: string;
  created_at: string;
};

export type LoopAction = {
  id: string;
  loop_id: string;
  action_type: ActionType;
  note: string | null;
  actor: string;
  created_at: string;
};

// ─── Normalized key builder ───────────────────────────────────────────────────
//
// The normalized_key uniquely identifies a loop from a given source record.
// It is stable across re-syncs — same input always produces the same key.
// Used as the ON CONFLICT target in Supabase upserts.
//
// Scheme:
//   evidence:{notionPageId}                → Validated Blocker / Commitment
//   opportunity:{notionPageId}:review      → Opportunity with review doc URL
//   opportunity:{notionPageId}:followup    → Opportunity with Gmail review URL
//   opportunity:{notionPageId}:pending     → Opportunity with explicit pending action
//   opportunity:{notionPageId}:new         → New opportunity (qualify / decide)
//   project:{notionPageId}:obstacle        → Project with updateNeeded + obstacle content

export type NormalizedKeyVariant =
  | "review"
  | "followup"
  | "pending"
  | "new"
  | "obstacle"
  | "active";   // recently-edited opportunity with no explicit signal

export function buildNormalizedKey(
  entityType: LinkedEntityType,
  notionPageId: string,
  variant?: NormalizedKeyVariant,
): string {
  const base = `${entityType}:${notionPageId}`;
  return variant ? `${base}:${variant}` : base;
}

// ─── Semantic identity (intent_key) ───────────────────────────────────────────
//
// intent_key groups loops that describe the SAME underlying issue even when
// the Notion page_id changes (regenerator creates a new Evidence record from
// similar content, renamed opportunities, etc.). It is the second-tier match
// used when normalized_key lookup misses.
//
// Shape:
//   {entity_type}:{entity_slug}:{loop_type}:{variant_or_bucket}:{content_slug}
//
// Example:
//   evidence:reuse-for-all:blocker::not-enough-volume-for-co-op-pilot
//   opportunity:coop-uk:follow_up:pending:send-proposal-v2

/** Normalize free-form text for fingerprint / slug use. Deterministic, cheap. */
export function normalizeFingerprint(input: string, maxLen = 180): string {
  if (!input) return "";
  let s = input.toLowerCase();
  // Strip URLs — they mutate constantly even when topic is the same.
  s = s.replace(/https?:\/\/\S+/g, " ");
  // Drop boilerplate prefixes the regenerators emit.
  s = s.replace(/^\s*(signals?:|inbox signal:|note:|update:|re:|fwd:)\s*/gi, " ");
  // Collapse all punctuation to single space.
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  // Drop ultra-common filler words that add no semantic signal.
  const STOP = new Set([
    "the","a","an","of","to","for","and","or","but","on","in","at","by",
    "is","are","was","were","be","been","being","this","that","these","those",
    "we","i","you","they","them","our","my","your","it","its","as","from","with",
  ]);
  s = s.split(" ").filter(w => w && !STOP.has(w)).join(" ");
  return s.slice(0, maxLen);
}

/** Short, deterministic slug for use inside an intent_key. */
export function contentSlug(input: string, maxLen = 60): string {
  return normalizeFingerprint(input, 4000)
    .replace(/\s+/g, "-")
    .slice(0, maxLen);
}

/** Builds a semantic intent_key that survives wording drift AND page re-creation. */
export function buildIntentKey(params: {
  entityType: LinkedEntityType;
  entitySlug: string;           // org / project / linked_entity_name slug
  loopType: LoopType;
  variant?: NormalizedKeyVariant | null;
  contentText: string;          // title or excerpt — whatever best describes the topic
}): string {
  const entitySeg  = contentSlug(params.entitySlug || "unknown", 40);
  const variantSeg = params.variant ?? "";
  const contentSeg = contentSlug(params.contentText, 60);
  return `${params.entityType}:${entitySeg}:${params.loopType}:${variantSeg}:${contentSeg}`;
}

// ─── Materially-new evidence gate ─────────────────────────────────────────────
//
// Resolved/dismissed loops should only re-open when incoming evidence is
// substantively different. Pure paraphrase (same meaning, different words) or
// regenerator rewrite of the same underlying topic must NOT resurrect the loop.
//
// Heuristic (cheap, deterministic):
//   1. Different signal_type           → materially new (blocker vs commitment)
//   2. Significant fingerprint delta   → materially new (Jaccard on tokens)
//   3. Otherwise                       → NOT materially new (append signal only)

/** Jaccard similarity on whitespace-tokenized fingerprint strings. */
export function fingerprintSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  if (union === 0) return 1;
  return inter / union;
}

/**
 * Returns true when incoming evidence justifies reopening a resolved/dismissed loop.
 * Gate is intentionally strict — false negatives (loop stays closed) are far less
 * damaging than false positives (loop flickers back on every paraphrase).
 *
 * NULL previousFingerprint is treated as NOT materially new (conservative). This
 * handles the cold-start case where a legacy closed loop has no baseline to
 * compare against — we default to "same thing, stay closed" rather than
 * resurrecting it on first re-sync. A signal-type change still overrides.
 */
export function isMateriallyNewEvidence(params: {
  previousFingerprint: string | null;
  previousSignalType: SignalType | null;
  incomingFingerprint: string;
  incomingSignalType: SignalType;
  similarityThreshold?: number;   // default 0.55 — below this = materially new
}): boolean {
  // New signal class (e.g. was opportunity_signal, now evidence_blocker) = material.
  if (params.previousSignalType && params.previousSignalType !== params.incomingSignalType) {
    return true;
  }
  // No prior fingerprint → conservative: NOT material. Stays closed until
  // either a genuinely new signal arrives (caller already gates on isNewSignal
  // for user-dismissed rows) or a baseline is established and then changes.
  if (!params.previousFingerprint) return false;

  const threshold = params.similarityThreshold ?? 0.55;
  const sim = fingerprintSimilarity(params.previousFingerprint, params.incomingFingerprint);
  return sim < threshold;
}

// ─── Priority scoring v1 ──────────────────────────────────────────────────────
//
// Base scores by loop_type, with additive bonuses for urgency signals.
// Capped at 100. The score is recomputed on every sync so it stays current.

const BASE_SCORE: Record<LoopType, number> = {
  blocker:    50,
  decision:   45,
  commitment: 40,
  prep:       30,
  review:     25,
  follow_up:  20,
};

export type ScoringContext = {
  dueAt?: string | null;            // ISO timestamp
  signalCount?: number;             // number of corroborating signals
  linkedEntityType?: LinkedEntityType;
  opportunityStage?: string | null; // "Active" | "Qualifying" | "New" | ...
  founderOwned?: boolean;           // Track F: +20 bonus for strategic founder-led items
};

export function computePriorityScore(
  loopType: LoopType,
  ctx: ScoringContext = {},
): number {
  let score = BASE_SCORE[loopType];

  // Deadline proximity bonus
  if (ctx.dueAt) {
    const daysUntil = (new Date(ctx.dueAt).getTime() - Date.now()) / 86400000;
    if (daysUntil < 0)      score += 20; // overdue
    else if (daysUntil < 1) score += 15; // today
    else if (daysUntil < 3) score += 10; // within 3 days
  }

  // Active opportunity link bonus
  if (
    ctx.linkedEntityType === "opportunity" &&
    (ctx.opportunityStage === "Active" || ctx.opportunityStage === "Qualifying")
  ) {
    score += 10;
  }

  // Multiple corroborating signals bonus (+5 per extra signal, max +15)
  if (ctx.signalCount && ctx.signalCount > 1) {
    score += Math.min((ctx.signalCount - 1) * 5, 15);
  }

  // Founder-owned bonus: strategic items Jose leads directly (+20)
  if (ctx.founderOwned) {
    score += 20;
  }

  return Math.min(Math.max(score, 0), 100);
}

// ─── Signal gate predicates ───────────────────────────────────────────────────
//
// These replicate the gates from notion.ts so that the sync route and the
// Notion-fallback path enforce identical rules. Always call these before
// creating or upserting a loop.

/** Returns true if an opportunity's pending action text is human-written and meaningful. */
export function isActionablePendingAction(pendingAction: string | null): boolean {
  if (!pendingAction) return false;
  if (pendingAction.startsWith("SIGNALS:")) return false;
  if (pendingAction.startsWith("Inbox signal:")) return false;
  return pendingAction.trim().length >= 20;
}

/** Returns true if the opportunity is a Grant record (pending action is sourcing context, not a task). */
export function isGrant(opportunityType: string): boolean {
  return opportunityType === "Grant";
}

/**
 * Returns true when a loop was created from passive discovery signals —
 * i.e. no founder intent or engagement has been recorded yet.
 *
 * Passive = any of:
 *   - New opportunity needing qualification (variant :new)
 *   - Fallback "check in needed" with no explicit signal (variant :active)
 *   - Grant with only a Follow-up Status trigger (no meeting, no review) —
 *     detected at sync time and stored as is_passive_discovery=true in DB
 *
 * NOT passive = evidence blockers, project obstacles, active commitments,
 *               prep loops, review loops with a real document,
 *               or active Gmail reply threads (:followup + follow_up type).
 *
 * Note: :followup variant is NOT automatically passive — that variant covers
 * both "decide on inbound for new opp" (passive, decision type) AND "reply
 * to active thread" (not passive, follow_up type). Sync-loops handles this
 * distinction by computing is_passive_discovery with full oppType context.
 */
export function isPassiveDiscovery(
  normalizedKey: string,
  linkedEntityType: LinkedEntityType,
): boolean {
  if (linkedEntityType === "evidence") return false;
  if (linkedEntityType === "project")  return false;
  return (
    normalizedKey.endsWith(":new") ||
    normalizedKey.endsWith(":active")
  );
}

/** Returns true if a meeting + topic together justify a loop. Meeting alone does not. */
export function hasMeetingWithTopic(
  nextMeetingDate: string | null,
  pendingAction: string | null,
  followUpStatus: string,
): boolean {
  if (!nextMeetingDate) return false;
  const hasExplicitStatus = ["Needed", "Waiting", "Sent"].includes(followUpStatus);
  const hasActionable = isActionablePendingAction(pendingAction);
  return hasExplicitStatus || hasActionable;
}

// ─── Loop type + intervention moment classifier ───────────────────────────────
//
// Shared classification logic. Same result whether called from the sync route
// or the Notion-fallback path in getCoSTasks().

export type OpportunityLoopInput = {
  stage: string;
  followUpStatus: string;
  type: string;
  nextMeetingDate: string | null;
  reviewUrl: string | null;
  pendingAction: string | null;       // human-actionable only (post-filter)
  rawTriggerSignal?: string | null;   // raw Trigger/Signal field value, before actionability filter
  opportunityScore?: number | null;   // 0–100 Opportunity Score
  daysSinceEdit?: number;             // used for recently-active fallback gate
};

export function classifyOpportunityLoop(opp: OpportunityLoopInput): {
  loopType: LoopType;
  interventionMoment: InterventionMoment;
  variant: NormalizedKeyVariant;
  title: string;
} | null {
  const { stage, type, nextMeetingDate, reviewUrl, pendingAction, followUpStatus } = opp;

  const oppIsGrant = isGrant(type);
  const hasActionable = isActionablePendingAction(pendingAction) && !oppIsGrant;
  const meetingImminent = (() => {
    if (!nextMeetingDate) return false;
    const daysToMeeting = (new Date(nextMeetingDate).getTime() - Date.now()) / 86400000;
    return daysToMeeting >= 0 && daysToMeeting <= 7;
  })();
  const reviewIsGmail = !!reviewUrl && reviewUrl.includes("mail.google.com");
  const reviewIsDoc   = !!reviewUrl && !reviewIsGmail;
  const isNew         = stage === "New";
  const hasExplicitStatus = ["Needed", "Waiting", "Sent"].includes(followUpStatus);

  // A meeting alone never creates a loop
  const meetingAndTopic = meetingImminent && (hasActionable || hasExplicitStatus);

  let loopType: LoopType;
  let interventionMoment: InterventionMoment;
  let variant: NormalizedKeyVariant;
  let title: string;

  if (meetingAndTopic && hasActionable) {
    // Issue + upcoming meeting
    const meetingLabel = (() => {
      const d = new Date(nextMeetingDate!);
      const days = Math.floor((d.getTime() - Date.now()) / 86400000);
      if (days === 0) return "today";
      if (days === 1) return "tomorrow";
      return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    })();
    loopType            = "prep";
    interventionMoment  = "next_meeting";
    variant             = "pending";
    title               = `Raise in ${meetingLabel} meeting: ${pendingAction!.slice(0, 100)}`;
  } else if (meetingAndTopic && reviewIsDoc) {
    loopType            = "review";
    interventionMoment  = "next_meeting";
    variant             = "review";
    title               = `Review doc before meeting`;
  } else if (reviewIsDoc) {
    loopType            = "review";
    interventionMoment  = "review_this_week";
    variant             = "review";
    title               = `Review doc`;
  } else if (reviewIsGmail && isNew) {
    loopType            = "decision";
    interventionMoment  = "this_week";
    variant             = "followup";
    title               = `Decide on inbound from email thread`;
  } else if (reviewIsGmail) {
    loopType            = "follow_up";
    interventionMoment  = "email_this_week";
    variant             = "followup";
    title               = `Send follow-up reply`;
  } else if (hasActionable) {
    loopType            = stage === "Active" ? "commitment" : "follow_up";
    interventionMoment  = "this_week";
    variant             = "pending";
    title               = pendingAction!.slice(0, 140);
  } else if (isNew) {
    loopType            = "decision";
    interventionMoment  = "this_week";
    variant             = "new";
    title               = `Qualify or decide on new opportunity`;
  } else if (hasExplicitStatus) {
    loopType            = "follow_up";
    interventionMoment  = "this_week";
    variant             = "pending";
    title               = `Follow up`;
  } else if (
    (stage === "Active" || stage === "Qualifying") &&
    !oppIsGrant &&
    (opp.daysSinceEdit ?? 999) <= 30 &&
    (
      // At least one business-significance signal must exist beyond recency alone.
      // rawTriggerSignal: any content in Trigger/Signal field (even auto-generated
      //   "SIGNALS:..." from inbox scan) — means some activity has been logged.
      // opportunityScore >= 40: opportunity has been assessed and scored as meaningful.
      (!!opp.rawTriggerSignal && opp.rawTriggerSignal.trim().length > 0) ||
      (opp.opportunityScore != null && opp.opportunityScore >= 40)
    )
  ) {
    // Recently-edited opportunity with business-significance signal but no explicit action.
    // Surfaces Active/Qualifying work where a signal exists but no follow-up has been set.
    loopType            = "follow_up";
    interventionMoment  = "this_week";
    variant             = "active";
    title               = `No active signal — check in needed`;
  } else {
    // No valid loop signal — caller must skip this opportunity
    return null;
  }

  return { loopType, interventionMoment, variant, title };
}

// ─── CoSTask adapter ──────────────────────────────────────────────────────────
//
// Maps a Loop row from Supabase to the CoSTask shape expected by
// ChiefOfStaffDesk. This is the only place that translation lives.

function mapLoopType(lt: LoopType): CoSTask["loopType"] {
  // DB uses follow_up (underscore), TS type uses follow-up (hyphen)
  if (lt === "follow_up") return "follow-up";
  return lt;
}

function mapInterventionMoment(im: InterventionMoment): CoSTask["interventionMoment"] {
  return im;
}

function mapStatus(s: LoopStatus): CoSTask["taskStatus"] {
  switch (s) {
    case "in_progress": return "in-progress";
    case "waiting":     return "waiting";
    case "resolved":    return "done";
    case "dismissed":   return "dropped";
    case "reopened":    return "todo";   // reopened surfaces as actionable "todo" in UI
    default:            return "todo";
  }
}

function mapUrgency(loopType: LoopType, priorityScore: number): CoSTask["urgency"] {
  if (loopType === "blocker" || priorityScore >= 55) return "critical";
  if (priorityScore >= 35)                           return "high";
  return "normal";
}

function mapEntrySignal(loop: Loop): CoSTask["entrySignal"] {
  switch (loop.loop_type) {
    case "blocker":    return "review_needed";
    case "commitment": return "negotiation";
    case "decision":   return "inbound";
    case "prep":       return "meeting_soon";
    case "review":     return "review_needed";
    case "follow_up":  return "inbound";
    default:           return "manual";
  }
}

function mapTaskSource(entityType: LinkedEntityType): CoSTask["taskSource"] {
  if (entityType === "evidence") return "evidence";
  if (entityType === "project")  return "project";
  return "opportunity";
}

export function mapLoopToCoSTask(loop: Loop): CoSTask {
  return {
    id:                  loop.id,
    notionUrl:           loop.notion_url,
    taskTitle:           loop.title,
    taskStatus:          mapStatus(loop.status),
    dueDate:             loop.due_at ? loop.due_at.slice(0, 10) : null,
    urgency:             mapUrgency(loop.loop_type, loop.priority_score),
    loopType:            mapLoopType(loop.loop_type),
    interventionMoment:  mapInterventionMoment(loop.intervention_moment),
    opportunityName:     loop.linked_entity_name,
    opportunityStage:    loop.linked_entity_type === "project" ? "Project"
                       : loop.linked_entity_type === "evidence" ? "Evidence"
                       : "Opportunity",
    orgName:             "",
    opportunityType:     loop.linked_entity_type === "evidence"
                           ? "Evidence"
                           : loop.linked_entity_type === "project"
                           ? "Project"
                           : "",
    reviewUrl:           loop.review_url,
    entrySignal:         mapEntrySignal(loop),
    signalReason:        `${loop.founder_owned ? "Founder-owned · " : ""}${loop.signal_count > 1 ? `${loop.signal_count} signals` : "1 signal"} · score ${loop.priority_score}`,
    calendarBlockUrl:    null,
    pendingAction:       loop.title,
    taskSource:          mapTaskSource(loop.linked_entity_type),
    loopEngineId:        loop.id,
    linkedEntityId:      loop.linked_entity_type === "opportunity" ? loop.linked_entity_id : undefined,
    isPassiveDiscovery:  loop.is_passive_discovery,
  };
}
