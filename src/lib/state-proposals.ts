import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { linkStateSubject } from "@/lib/entity-links";

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
    // project_state_proposals has two FKs to project_state_items (target_item_id
    // and applied_item_id); disambiguate the embed to the target item explicitly.
    .select("id, project_id, proposal_kind, target_item_id, item_type, summary, rationale, impact, confidence, source_refs, payload, status, created_at, project_state_items!project_state_proposals_target_item_id_fkey(statement)")
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

// ─── /admin/now decision-queue packages ──────────────────────────────────────

const IMPACT_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

export type NowProposalCard = {
  id: string;
  kind: StateProposal["proposalKind"];
  itemType: string | null;
  summary: string;
  rationale: string;
  impact: StateProposal["impact"];
  confidence: number;
  sourceCount: number;
  targetStatement: string | null;
  preview: string | null;
};

export type NowProposalPackage = {
  projectId: string;
  projectName: string;
  projectHref: string;
  total: number;
  maxImpact: StateProposal["impact"];
  top: NowProposalCard[];
};

function proposalPreview(kind: string, payload: Record<string, unknown>): string | null {
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : null);
  switch (kind) {
    case "add_item": return s("statement");
    case "update_item":
    case "resolve_item": return [s("status"), s("resolution_note"), s("owner_label")].filter(Boolean).join(" · ") || null;
    case "state_summary": return [s("current_summary"), s("current_phase"), s("current_focus"), s("health")].filter(Boolean).join(" · ") || null;
    case "add_learning": return [s("title"), s("observation")].filter(Boolean).join(" — ") || null;
    default: return null;
  }
}

/**
 * Pending proposals grouped into per-project packages for /admin/now. Each
 * package surfaces the material subset (top by impact then confidence) plus the
 * total, so the queue shows what to decide without flooding the screen.
 */
export async function getNowProposalPackages(perProjectCap = 3): Promise<NowProposalPackage[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("project_state_proposals")
    .select("id, project_id, proposal_kind, item_type, summary, rationale, impact, confidence, source_refs, payload, project_state_items!project_state_proposals_target_item_id_fkey(statement), projects(id, notion_id, name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`now proposals read failed: ${error.message}`);

  const byProject = new Map<string, { name: string; href: string; cards: NowProposalCard[] }>();
  for (const row of data ?? []) {
    const proj = (Array.isArray(row.projects) ? row.projects[0] : row.projects) as { id?: string; notion_id?: string; name?: string } | null;
    const pid = (row.project_id as string);
    const href = `/admin/projects/${proj?.id || proj?.notion_id || pid}/state`;
    const target = Array.isArray(row.project_state_items) ? row.project_state_items[0] : row.project_state_items;
    const card: NowProposalCard = {
      id: row.id as string,
      kind: row.proposal_kind as StateProposal["proposalKind"],
      itemType: (row.item_type as string | null) ?? null,
      summary: row.summary as string,
      rationale: row.rationale as string,
      impact: row.impact as StateProposal["impact"],
      confidence: row.confidence as number,
      sourceCount: Array.isArray(row.source_refs) ? (row.source_refs as string[]).length : 0,
      targetStatement: (target?.statement as string | undefined) ?? null,
      preview: proposalPreview(row.proposal_kind as string, (row.payload as Record<string, unknown>) ?? {}),
    };
    const entry = byProject.get(pid) ?? { name: proj?.name ?? "Untitled project", href, cards: [] };
    entry.cards.push(card);
    byProject.set(pid, entry);
  }

  const packages: NowProposalPackage[] = [];
  for (const [projectId, entry] of byProject) {
    const sorted = entry.cards.sort((a, b) => (IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]) || (b.confidence - a.confidence));
    packages.push({
      projectId,
      projectName: entry.name,
      projectHref: entry.href,
      total: sorted.length,
      maxImpact: sorted[0]?.impact ?? "medium",
      top: sorted.slice(0, perProjectCap),
    });
  }
  return packages.sort((a, b) => (IMPACT_RANK[b.maxImpact] - IMPACT_RANK[a.maxImpact]) || (b.total - a.total));
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
  const applied = (Array.isArray(data) ? data[0] : data) as {
    proposal_kind?: string; applied_item_id?: string | null; applied_learning_id?: string | null; project_id?: string;
  } | null;

  // Phase 6: resolve the applied entity's labels to typed entity links.
  // Best-effort — a resolution failure never fails the acceptance, and the
  // backfill endpoint can rebuild links later.
  try {
    if (applied?.project_id && applied.applied_item_id
        && (applied.proposal_kind === "add_item" || applied.proposal_kind === "update_item")) {
      const { data: item } = await supabaseAdmin()
        .from("project_state_items")
        .select("owner_label, stakeholder_label")
        .eq("id", applied.applied_item_id)
        .maybeSingle();
      if (item) {
        await linkStateSubject(
          applied.project_id, "state_item", applied.applied_item_id,
          (item.owner_label as string | null) ?? null,
          (item.stakeholder_label as string | null) ?? null,
          actor,
        );
      }
    } else if (applied?.project_id && applied.applied_learning_id && applied.proposal_kind === "add_learning") {
      // Learnings have no owner/stakeholder — resolve the `area` as a stakeholder.
      const { data: learning } = await supabaseAdmin()
        .from("project_learning_items")
        .select("area")
        .eq("id", applied.applied_learning_id)
        .maybeSingle();
      if (learning?.area) {
        await linkStateSubject(applied.project_id, "learning_item", applied.applied_learning_id, null, learning.area as string, actor);
      }
    }
  } catch { /* non-fatal: links are rebuildable via backfill */ }

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
