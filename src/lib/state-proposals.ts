import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Read + accept/reject helpers for project_state_proposals.
 *
 * A proposal is inert until a human accepts it. Acceptance runs entirely inside
 * the `apply_state_proposal` RPC: one transaction that locks the proposal
 * (SELECT ... FOR UPDATE), re-validates every enum/payload field, mutates the
 * state item / summary / learning, writes a `system_refresh` revision with a
 * snapshot, and closes the proposal. There is no half-applied window and no
 * client-side claim-then-apply dance. Reject is a single guarded update.
 */

export type StateProposal = {
  id: string;
  projectId: string;
  proposalKind: "add_item" | "update_item" | "resolve_item" | "state_summary" | "add_learning";
  targetItemId: string | null;
  itemType: string | null;
  summary: string;
  rationale: string;
  impact: "low" | "medium" | "high" | "critical";
  confidence: number;
  sourceRefs: string[];
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  targetStatement: string | null;
};

export async function listPendingProposals(projectId: string): Promise<StateProposal[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("project_state_proposals")
    .select("id, project_id, proposal_kind, target_item_id, item_type, summary, rationale, impact, confidence, source_refs, payload, status, created_at, project_state_items(statement)")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`proposals read failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const target = Array.isArray(row.project_state_items) ? row.project_state_items[0] : row.project_state_items;
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      proposalKind: row.proposal_kind as StateProposal["proposalKind"],
      targetItemId: (row.target_item_id as string | null) ?? null,
      itemType: (row.item_type as string | null) ?? null,
      summary: row.summary as string,
      rationale: row.rationale as string,
      impact: row.impact as StateProposal["impact"],
      confidence: row.confidence as number,
      sourceRefs: Array.isArray(row.source_refs) ? (row.source_refs as string[]) : [],
      payload: (row.payload as Record<string, unknown>) ?? {},
      status: row.status as string,
      createdAt: row.created_at as string,
      targetStatement: (target?.statement as string | undefined) ?? null,
    };
  });
}

export async function pendingProposalCount(projectId?: string): Promise<number> {
  const sb = supabaseAdmin();
  let query = sb.from("project_state_proposals").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (projectId) query = query.eq("project_id", projectId);
  const { count, error } = await query;
  if (error) throw new Error(`proposal count failed: ${error.message}`);
  return count ?? 0;
}

export type AcceptResult = { ok: true; kind: string } | { ok: false; error: string; status: number };

/**
 * Accept a proposal. All work happens atomically in the RPC; on failure nothing
 * is mutated. A non-pending proposal returns 409; a project/proposal mismatch or
 * missing target returns 404; a payload/enum validation failure returns 400.
 */
export async function acceptProposal(projectId: string, proposalId: string, actor: string): Promise<AcceptResult> {
  const { data, error } = await supabaseAdmin().rpc("apply_state_proposal", {
    p_proposal_id: proposalId,
    p_project_id: projectId,
    p_actor: actor,
  });
  if (error) {
    const msg = error.message || "acceptance failed";
    // 55000 = object_not_in_prerequisite_state (proposal no longer pending).
    if (error.code === "55000" || /is not pending/i.test(msg)) return { ok: false, error: msg, status: 409 };
    if (/not found|does not belong/i.test(msg)) return { ok: false, error: msg, status: 404 };
    if (/^invalid |requires /i.test(msg)) return { ok: false, error: msg, status: 400 };
    return { ok: false, error: msg, status: 502 };
  }
  const applied = (Array.isArray(data) ? data[0] : data) as { proposal_kind?: string } | null;
  return { ok: true, kind: applied?.proposal_kind ?? "unknown" };
}

export async function rejectProposal(projectId: string, proposalId: string, actor: string, note: string | null): Promise<AcceptResult> {
  const { data, error } = await supabaseAdmin()
    .from("project_state_proposals")
    .update({ status: "rejected", reviewed_by: actor, reviewed_at: new Date().toISOString(), review_note: note, updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("project_id", projectId)
    .eq("status", "pending")
    .select("proposal_kind")
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 502 };
  if (!data) return { ok: false, error: "Proposal is not pending (already handled?)", status: 409 };
  return { ok: true, kind: data.proposal_kind as string };
}
