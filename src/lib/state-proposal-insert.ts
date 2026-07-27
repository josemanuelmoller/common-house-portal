import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Single entry point for writing to `project_state_proposals`.
 *
 * The table is the real gate: the `project_state_proposals_applicable` CHECK
 * (migration 20260725220000) mirrors what `apply_state_proposal` requires per
 * kind, and it binds every writer — including the two that have no code in this
 * repo (`propose-room-tasks`, `room-meeting-agent`) and post straight to
 * PostgREST with the service key. Nothing here can substitute for it.
 *
 * What this module adds on top, and why it is not just tidiness:
 *
 *  - `state-refresh` commits a whole batch through `commit_state_proposals`, in
 *    ONE transaction that also advances the evidence cursor. A single
 *    constraint violation aborts the batch AND the cursor advance — so the next
 *    run re-reads the same evidence and fails again, wedging that project's
 *    refresh permanently. Filtering in TS keeps a bad proposal from ever
 *    reaching the constraint.
 *  - a rejected proposal becomes a named reason in the run log instead of a raw
 *    23514 from PostgREST.
 *
 * The rules below and the SQL constraint are one contract in two places. If a
 * branch of `apply_state_proposal` gains or loses a required field, both change
 * together.
 */

// ─── Contract sets (validated against the DB check constraints) ───────────────

export const STATE_ITEM_TYPES = new Set([
  "decision", "commitment", "risk", "dependency", "question", "milestone",
  "stakeholder_signal", "assumption", "outcome",
]);
export const ITEM_RESOLVE_STATUSES = new Set(["resolved", "superseded", "unknown", "expired"]);
export const ITEM_UPDATE_STATUSES = new Set(["active", "resolved", "superseded", "unknown", "expired"]);
export const HEALTH = new Set(["on_track", "watch", "blocked", "paused", "unknown"]);
export const IMPACT = new Set(["low", "medium", "high", "critical"]);
export const LEARNING_TYPES = new Set([
  "implementation_question", "stakeholder_need", "friction",
  "decision_pattern", "operating_pattern", "outcome",
]);
/** `project_tasks.assignee_side`; the RPC defaults an empty value to 'team'. */
export const ASSIGNEE_SIDES = new Set(["team", "client"]);

/**
 * Kinds the review queue can act on. `room_structure` is deliberately absent:
 * it is an audit record written already-'accepted' and never applied.
 */
export const PROPOSAL_KINDS = new Set([
  "add_item", "update_item", "resolve_item", "state_summary", "add_learning",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StateProposalInsert = {
  project_id: string;
  proposal_kind: string;
  target_item_id?: string | null;
  item_type?: string | null;
  summary: string;
  rationale: string;
  impact?: string;
  confidence?: number;
  source_refs?: string[];
  payload?: Record<string, unknown>;
  status?: string;
  evidence_window_start?: string | null;
  evidence_window_end?: string | null;
  generated_by?: string;
  model?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

/**
 * Every source_ref is a `public.evidence.id`. That array is what
 * `apply_state_proposal` copies into `project_state_items.source_refs` /
 * `project_learning_items.source_refs`, and it is the only link back from a
 * state claim to its proof — human prose there ("Catch up · 21 Jul") resolves to
 * nothing. Not applied to `add_task`, whose refs are namespaced
 * (`fireflies:<uuid>`) and land in `project_tasks.evidence_ref` as text.
 */
const refsAreEvidenceIds = (refs?: string[]): boolean =>
  Array.isArray(refs) && refs.length > 0 && refs.every((r) => UUID_RE.test(r));

/**
 * Mirrors `project_state_proposals_applicable`, branch for branch. Returns the
 * reason a proposal could never be applied, or null when it is applicable.
 */
export function proposalRejectionReason(p: StateProposalInsert): string | null {
  // The constraint only guards rows that can still be applied; an audit record
  // written already-closed is out of scope on both sides.
  if ((p.status ?? "pending") !== "pending") return null;

  const payload = p.payload ?? {};
  const refsOk = refsAreEvidenceIds(p.source_refs);

  switch (p.proposal_kind) {
    case "add_item": {
      if (!text(payload.statement)) return "add_item requires payload.statement";
      const itemType = text(p.item_type) ?? text(payload.item_type);
      if (!itemType || !STATE_ITEM_TYPES.has(itemType)) {
        return `add_item item_type ${itemType ?? "(missing)"} is not a project_state_items type`;
      }
      if (!refsOk) return "add_item requires source_refs of evidence UUIDs";
      return null;
    }
    case "update_item": {
      if (!p.target_item_id) return "update_item requires target_item_id";
      const changes = ["status", "owner_label", "stakeholder_label", "due_at", "resolution_note"];
      if (!changes.some((k) => text(payload[k]))) {
        return "update_item has no field to change (would apply as a no-op)";
      }
      if (!refsOk) return "update_item requires source_refs of evidence UUIDs";
      return null;
    }
    case "resolve_item": {
      if (!p.target_item_id) return "resolve_item requires target_item_id";
      if (!refsOk) return "resolve_item requires source_refs of evidence UUIDs";
      return null;
    }
    case "state_summary": {
      const fields = ["current_summary", "current_phase", "current_focus", "health"];
      if (!fields.some((k) => text(payload[k]))) {
        return "state_summary has no field to change (would apply as a no-op)";
      }
      if (!refsOk) return "state_summary requires source_refs of evidence UUIDs";
      return null;
    }
    case "add_learning": {
      if (!text(payload.title) || !text(payload.observation)) {
        return "add_learning requires payload.title and payload.observation";
      }
      if (!refsOk) return "add_learning requires source_refs of evidence UUIDs";
      return null;
    }
    case "add_task": {
      // The only two things the RPC's add_task branch raises on. Everything else
      // in the payload is coerced to null rather than rejected.
      if (!text(payload.title)) return "add_task requires payload.title";
      const side = text(payload.assignee_side) ?? "team";
      if (!ASSIGNEE_SIDES.has(side)) return `add_task assignee_side ${side} is not team|client`;
      return null;
    }
    default:
      // 'room_structure' and any future audit kind. The RPC never applies them,
      // so there is nothing to be applicable against.
      return null;
  }
}

export const isApplicableProposal = (p: StateProposalInsert): boolean =>
  proposalRejectionReason(p) === null;

/**
 * Splits a batch into what may be written and why the rest may not. Callers that
 * commit through `commit_state_proposals` must filter with this before the RPC:
 * that insert is transactional with the cursor advance, so one violating row
 * would roll back the whole batch and leave the cursor unmoved.
 */
export function partitionApplicable<T extends StateProposalInsert>(
  proposals: T[],
): { applicable: T[]; rejected: Array<{ proposal: T; reason: string }> } {
  const applicable: T[] = [];
  const rejected: Array<{ proposal: T; reason: string }> = [];
  for (const p of proposals) {
    const reason = proposalRejectionReason(p);
    if (reason) rejected.push({ proposal: p, reason });
    else applicable.push(p);
  }
  return { applicable, rejected };
}

/**
 * Direct insert for writers that do not go through `commit_state_proposals`.
 * Validates first so the caller gets a named reason rather than a raw 23514.
 */
export async function insertStateProposals(
  db: SupabaseClient,
  proposals: StateProposalInsert[],
): Promise<{ inserted: number; rejected: Array<{ summary: string; reason: string }>; error?: string }> {
  const { applicable, rejected } = partitionApplicable(proposals);
  const rejectedOut = rejected.map(({ proposal, reason }) => ({ summary: proposal.summary, reason }));
  if (applicable.length === 0) return { inserted: 0, rejected: rejectedOut };

  const { error } = await db.from("project_state_proposals").insert(applicable);
  if (error) return { inserted: 0, rejected: rejectedOut, error: error.message };
  return { inserted: applicable.length, rejected: rejectedOut };
}
