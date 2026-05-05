/**
 * proposal-outcomes.ts
 *
 * Records human decisions on agent-produced proposals into
 * public.proposal_outcomes. Used by every approval endpoint
 * (approve-draft, approve-pitch, approve-project-update, etc.)
 * so we can compute acceptance-rate metrics per agent.
 *
 * Fire-and-forget: failures are logged but never block the parent
 * approval write. Telemetry must not gate the user action.
 */

import { getSupabaseServerClient } from "./supabase-server";

export type ProposalAction =
  | "approved"
  | "edited"
  | "rejected"
  | "skipped"
  | "revision_requested"
  | "sent";

export type ProposalType =
  | "agent_draft"
  | "content_pitch"
  | "project_update"
  | "decision_item"
  | "objective_artifact";

export type ProposalOutcomeInput = {
  proposal_type: ProposalType;
  proposal_id: string;
  action: ProposalAction;
  /** Best-effort identifier for the generator (e.g. "linkedin-post-agent",
   *  "propose-content-pitches", "project-operator"). Falls back to draft_type
   *  or pitch source when not known. */
  agent_name?: string | null;
  /** 1-line human or auto summary of what changed (only for 'edited'). */
  edit_summary?: string | null;
  /** Free-text rejection reason. */
  reason?: string | null;
  actor_email?: string | null;
  /** Snapshot of proposal title at decision time. */
  proposal_title?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordProposalOutcome(input: ProposalOutcomeInput): Promise<void> {
  try {
    const sb = getSupabaseServerClient();
    const { error } = await sb.from("proposal_outcomes").insert({
      proposal_type:  input.proposal_type,
      proposal_id:    input.proposal_id,
      action:         input.action,
      agent_name:     input.agent_name ?? null,
      edit_summary:   input.edit_summary ?? null,
      reason:         input.reason ?? null,
      actor_email:    input.actor_email ?? null,
      proposal_title: input.proposal_title ?? null,
      metadata:       input.metadata ?? null,
    });
    if (error) {
      console.warn(
        `[proposal-outcomes] insert failed for ${input.proposal_type}/${input.proposal_id}: ${error.message}`,
      );
    }
  } catch (e) {
    console.warn(
      `[proposal-outcomes] supabase unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Batch helper for endpoints that approve multiple items at once
 * (e.g. /api/approve-pitch with pitchIds[]).
 */
export async function recordProposalOutcomes(inputs: ProposalOutcomeInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    const sb = getSupabaseServerClient();
    const { error } = await sb.from("proposal_outcomes").insert(
      inputs.map((i) => ({
        proposal_type:  i.proposal_type,
        proposal_id:    i.proposal_id,
        action:         i.action,
        agent_name:     i.agent_name ?? null,
        edit_summary:   i.edit_summary ?? null,
        reason:         i.reason ?? null,
        actor_email:    i.actor_email ?? null,
        proposal_title: i.proposal_title ?? null,
        metadata:       i.metadata ?? null,
      })),
    );
    if (error) {
      console.warn(`[proposal-outcomes] batch insert failed: ${error.message}`);
    }
  } catch (e) {
    console.warn(
      `[proposal-outcomes] supabase unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
