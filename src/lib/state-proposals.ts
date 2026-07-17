import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Read + apply/reject helpers for project_state_proposals.
 *
 * A proposal is inert until a human accepts it. Acceptance is the ONLY path that
 * mutates project_states / project_state_items / project_learning_items, and it
 * records a project_state_revisions row (action 'system_refresh') so the change
 * is inspectable. Acceptance uses a claim-then-apply guard: the row is flipped
 * pending → accepted first, and reverted to pending if application fails, so a
 * double click can never apply the same proposal twice.
 */

const DAY_MS = 86_400_000;
const DEFAULT_ITEM_TTL_DAYS = 45;

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

type ProposalRow = {
  id: string;
  project_id: string;
  proposal_kind: string;
  target_item_id: string | null;
  item_type: string | null;
  source_refs: string[];
  confidence: number;
  payload: Record<string, unknown>;
};

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function claimPending(proposalId: string, projectId: string): Promise<ProposalRow | null> {
  const sb = supabaseAdmin();
  // Optimistic claim: only succeeds if the row is still pending.
  const { data, error } = await sb
    .from("project_state_proposals")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("project_id", projectId)
    .eq("status", "pending")
    .select("id, project_id, proposal_kind, target_item_id, item_type, source_refs, confidence, payload")
    .maybeSingle();
  if (error) throw new Error(`proposal claim failed: ${error.message}`);
  return (data as ProposalRow | null) ?? null;
}

async function revertToPending(proposalId: string): Promise<void> {
  await supabaseAdmin()
    .from("project_state_proposals")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("id", proposalId);
}

async function writeRevision(projectId: string, actor: string, note: string, snapshot: unknown): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("project_state_revisions")
    .insert({ project_id: projectId, action: "system_refresh", actor, note, snapshot: snapshot ?? {} })
    .select("id")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export type AcceptResult = { ok: true; kind: string } | { ok: false; error: string; status: number };

export async function acceptProposal(projectId: string, proposalId: string, actor: string): Promise<AcceptResult> {
  const claimed = await claimPending(proposalId, projectId);
  if (!claimed) return { ok: false, error: "Proposal is not pending (already handled?)", status: 409 };

  const sb = supabaseAdmin();
  const payload = claimed.payload ?? {};
  const nowIso = new Date().toISOString();

  try {
    let appliedItemId: string | null = null;
    let revisionId: string | null = null;

    switch (claimed.proposal_kind) {
      case "add_item": {
        const statement = str(payload, "statement");
        if (!statement) throw new Error("proposal missing statement");
        const staleAfter = str(payload, "stale_after") ?? new Date(Date.now() + DEFAULT_ITEM_TTL_DAYS * DAY_MS).toISOString();
        const { data, error } = await sb.from("project_state_items").insert({
          project_id: projectId,
          item_type: claimed.item_type ?? "assumption",
          statement,
          owner_label: str(payload, "owner_label"),
          stakeholder_label: str(payload, "stakeholder_label"),
          source_refs: claimed.source_refs ?? [],
          confidence: claimed.confidence,
          due_at: str(payload, "due_at"),
          stale_after: staleAfter,
          last_confirmed_at: nowIso,
          created_by: actor,
          updated_by: actor,
        }).select("id").single();
        if (error) throw new Error(error.message);
        appliedItemId = data.id as string;
        revisionId = await writeRevision(projectId, actor, `Accepted proposal: added ${claimed.item_type ?? "claim"}`, data);
        break;
      }
      case "update_item":
      case "resolve_item": {
        if (!claimed.target_item_id) throw new Error("proposal has no target item");
        const update: Record<string, unknown> = { updated_at: nowIso, updated_by: actor };
        const status = str(payload, "status");
        if (status) update.status = status;
        if (str(payload, "owner_label")) update.owner_label = str(payload, "owner_label");
        if (str(payload, "stakeholder_label")) update.stakeholder_label = str(payload, "stakeholder_label");
        if (str(payload, "due_at")) update.due_at = str(payload, "due_at");
        if (str(payload, "resolution_note")) update.resolution_note = str(payload, "resolution_note");
        if (claimed.proposal_kind === "update_item" && status === "active") update.last_confirmed_at = nowIso;
        // Merge cited evidence into the item's source_refs for traceability.
        const { data: existing } = await sb.from("project_state_items").select("source_refs").eq("id", claimed.target_item_id).eq("project_id", projectId).maybeSingle();
        if (existing) {
          const merged = [...new Set([...(existing.source_refs as string[] ?? []), ...(claimed.source_refs ?? [])])];
          update.source_refs = merged;
        }
        const { data, error } = await sb.from("project_state_items")
          .update(update).eq("id", claimed.target_item_id).eq("project_id", projectId).select("id").maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("target item not found");
        appliedItemId = data.id as string;
        revisionId = await writeRevision(projectId, actor, `Accepted proposal: ${claimed.proposal_kind}`, data);
        break;
      }
      case "state_summary": {
        const update: Record<string, unknown> = { project_id: projectId, updated_at: nowIso, updated_by: actor, last_state_change_at: nowIso };
        if (str(payload, "current_summary")) update.current_summary = str(payload, "current_summary");
        if (str(payload, "current_phase")) update.current_phase = str(payload, "current_phase");
        if (str(payload, "current_focus")) update.current_focus = str(payload, "current_focus");
        if (str(payload, "health")) update.health = str(payload, "health");
        const { data, error } = await sb.from("project_states").upsert(update, { onConflict: "project_id" }).select("*").single();
        if (error) throw new Error(error.message);
        revisionId = await writeRevision(projectId, actor, "Accepted proposal: state summary", data);
        break;
      }
      case "add_learning": {
        const title = str(payload, "title");
        const observation = str(payload, "observation");
        if (!title || !observation) throw new Error("learning missing title/observation");
        const { error } = await sb.from("project_learning_items").insert({
          project_id: projectId,
          learning_type: str(payload, "learning_type") ?? "implementation_question",
          area: str(payload, "area"),
          title,
          observation,
          implication: str(payload, "implication"),
          status: "observed",
          transferability: "project",
          confidence: claimed.confidence,
          source_refs: claimed.source_refs ?? [],
          last_seen_at: nowIso,
          created_by: actor,
          updated_by: actor,
        });
        if (error) throw new Error(error.message);
        // Learnings are not state revisions; no revision row.
        break;
      }
      default:
        throw new Error(`unknown proposal kind: ${claimed.proposal_kind}`);
    }

    await sb.from("project_state_proposals").update({
      reviewed_by: actor,
      reviewed_at: nowIso,
      applied_item_id: appliedItemId,
      applied_revision_id: revisionId,
      updated_at: nowIso,
    }).eq("id", proposalId);

    return { ok: true, kind: claimed.proposal_kind };
  } catch (err) {
    await revertToPending(proposalId);
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 502 };
  }
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
