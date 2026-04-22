"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import {
  createLeafFromPath,
  markChangelogApplied,
  markChangelogRejected,
  parseSplitSuggestion,
  appendChangelog,
  updateNodeBody,
  appendBullet,
  appendBulletInSubsection,
  getNodeByPath,
  type NodeChangelogEntry,
} from "@/lib/knowledge-nodes";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Accept a SPLIT proposal: create the suggested leaf, mark proposal applied,
 *  write a CREATED changelog entry on the new leaf referencing the original
 *  evidence so the trail is preserved. */
export async function acceptSplitProposal(changelogId: string): Promise<
  { ok: true; newPath: string } | { ok: false; error: string }
> {
  await requireAdmin();
  const sb = getSupabaseServerClient();

  const { data: row, error } = await sb.from("knowledge_node_changelog")
    .select("*").eq("id", changelogId).maybeSingle();
  if (error || !row) return { ok: false, error: "Proposal not found" };
  const proposal = row as NodeChangelogEntry;
  if (proposal.action !== "SPLIT" || proposal.status !== "proposed") {
    return { ok: false, error: "Proposal is not a pending SPLIT" };
  }

  const suggestion = parseSplitSuggestion(proposal.reasoning);
  if (!suggestion) return { ok: false, error: "Could not parse suggested path from reasoning" };

  // Idempotency: if someone already created it, just mark applied.
  const existing = await getNodeByPath(suggestion.path);
  if (existing) {
    await markChangelogApplied(changelogId);
    revalidatePath("/admin/knowledge");
    return { ok: true, newPath: suggestion.path };
  }

  const newId = await createLeafFromPath({
    path: suggestion.path,
    title: suggestion.title,
  });
  if (!newId) return { ok: false, error: "Failed to create leaf (parent missing?)" };

  await appendChangelog({
    node_id: newId,
    evidence_notion_id: proposal.evidence_notion_id,
    action: "CREATED",
    reasoning: `Accepted SPLIT proposal: leaf created by human from curator suggestion.`,
    status: "applied",
    applied_by: "user:admin",
  });
  await markChangelogApplied(changelogId);

  revalidatePath("/admin/knowledge");
  revalidatePath(`/admin/knowledge/${suggestion.path}`);
  return { ok: true, newPath: suggestion.path };
}

/** Accept an AMEND proposal: write the diff_after bullet into the target
 *  leaf's section (replacing diff_before if present), mark applied. */
export async function acceptAmendProposal(changelogId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();
  const sb = getSupabaseServerClient();

  const { data: row } = await sb.from("knowledge_node_changelog")
    .select("*").eq("id", changelogId).maybeSingle();
  if (!row) return { ok: false, error: "Proposal not found" };
  const proposal = row as NodeChangelogEntry;
  if (proposal.action !== "AMEND" || proposal.status !== "proposed") {
    return { ok: false, error: "Proposal is not a pending AMEND" };
  }

  const { data: node } = await sb.from("knowledge_nodes")
    .select("*").eq("id", proposal.node_id).maybeSingle();
  if (!node) return { ok: false, error: "Target node missing" };

  const section = proposal.section ?? "References";
  const after = proposal.diff_after ?? "";
  const before = proposal.diff_before ?? "";
  if (!after) return { ok: false, error: "Proposal has no replacement content" };

  let newBody = (node as { body_md: string }).body_md;

  // If there's a before, try to swap it in place; otherwise append.
  if (before && newBody.includes(before)) {
    newBody = newBody.replace(before, after);
  } else {
    // Determine subsection from section string if it contains " > "
    const parts = section.split(" > ");
    const parentSection = parts[0];
    const sub = parts[1];
    const result = sub
      ? appendBulletInSubsection(newBody, parentSection, sub, after)
      : appendBullet(newBody, parentSection, after);
    newBody = result.body;
  }

  await updateNodeBody((node as { id: string }).id, newBody, { markEvidenceAt: true });
  await markChangelogApplied(changelogId);

  revalidatePath("/admin/knowledge");
  revalidatePath(`/admin/knowledge/${(node as { path: string }).path}`);
  return { ok: true };
}

/** Reject a proposal (SPLIT or AMEND): mark as rejected, no side-effect. */
export async function rejectProposal(changelogId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    await markChangelogRejected(changelogId);
    revalidatePath("/admin/knowledge");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
