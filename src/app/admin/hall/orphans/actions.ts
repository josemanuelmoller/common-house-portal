"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAction } from "@/lib/require-admin";
import { scanOrphans } from "@/lib/orphan-scanner";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}

export async function approveOrphanCandidate(candidateId: string) {
  const user = await requireAdminAction();
  const sb = getSupabase();

  const { data: cand, error: candErr } = await sb
    .from("orphan_match_candidates")
    .select("id, source_id, sender_name, candidate_person_id, status")
    .eq("id", candidateId)
    .maybeSingle();
  if (candErr || !cand) throw new Error("Candidate not found");
  if (cand.status !== "pending") return;

  // Authoritative backfill — approve wins over any existing value.
  const { error: updErr } = await sb
    .from("conversation_messages")
    .update({ sender_person_id: cand.candidate_person_id })
    .eq("source_id", cand.source_id)
    .ilike("sender_name", cand.sender_name);
  if (updErr) throw new Error("Backfill failed: " + updErr.message);

  // Learn — add the sender_name variant to the person's aliases so the next
  // clipper clip resolves at higher confidence and skips candidate filing.
  try {
    const { data: personRow } = await sb
      .from("people")
      .select("aliases")
      .eq("id", cand.candidate_person_id)
      .maybeSingle();
    const currentAliases = ((personRow?.aliases ?? []) as string[]).map(a => a.toLowerCase());
    const newAlias = cand.sender_name.toLowerCase();
    if (!currentAliases.includes(newAlias)) {
      await sb
        .from("people")
        .update({ aliases: [...currentAliases, newAlias] })
        .eq("id", cand.candidate_person_id);
    }
  } catch (e) {
    console.warn("[orphans] alias learn failed — approval still applied:", e);
  }

  await sb
    .from("orphan_match_candidates")
    .update({
      status:      "approved",
      reviewed_by: user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  revalidatePath("/admin/hall/orphans");
}

export async function rejectOrphanCandidate(candidateId: string) {
  const user = await requireAdminAction();
  const sb = getSupabase();

  const { data: cand } = await sb
    .from("orphan_match_candidates")
    .select("source_id, sender_name, candidate_person_id")
    .eq("id", candidateId)
    .maybeSingle();

  // Revert any optimistic link the clipper wrote to the person this candidate
  // suggested. Only touch rows where person_id = the candidate's suggestion
  // (don't clobber legit links to a different person).
  if (cand) {
    await sb
      .from("conversation_messages")
      .update({ sender_person_id: null })
      .eq("source_id", cand.source_id)
      .ilike("sender_name", cand.sender_name)
      .eq("sender_person_id", cand.candidate_person_id);
  }

  await sb
    .from("orphan_match_candidates")
    .update({
      status:      "rejected",
      reviewed_by: user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  revalidatePath("/admin/hall/orphans");
}

export async function reassignOrphanCandidate(candidateId: string, newPersonId: string) {
  const user = await requireAdminAction();
  const sb = getSupabase();

  if (!newPersonId) throw new Error("Missing newPersonId");

  const { data: cand, error: candErr } = await sb
    .from("orphan_match_candidates")
    .select("id, source_id, sender_name, candidate_person_id, status")
    .eq("id", candidateId)
    .maybeSingle();
  if (candErr || !cand) throw new Error("Candidate not found");
  if (cand.status !== "pending") return;

  const { data: newPerson, error: newPersonErr } = await sb
    .from("people")
    .select("id, aliases")
    .eq("id", newPersonId)
    .maybeSingle();
  if (newPersonErr || !newPerson) throw new Error("Target person not found");

  // Retarget the backfill — assign every matching sender row to the CORRECT
  // person (overrides any optimistic link the clipper wrote to the wrong one).
  const { error: updErr } = await sb
    .from("conversation_messages")
    .update({ sender_person_id: newPersonId })
    .eq("source_id", cand.source_id)
    .ilike("sender_name", cand.sender_name);
  if (updErr) throw new Error("Backfill failed: " + updErr.message);

  // Learn the alias on the corrected person so future clips auto-link right.
  try {
    const currentAliases = ((newPerson.aliases ?? []) as string[]).map(a => a.toLowerCase());
    const newAlias = cand.sender_name.toLowerCase();
    if (!currentAliases.includes(newAlias)) {
      await sb
        .from("people")
        .update({ aliases: [...currentAliases, newAlias] })
        .eq("id", newPersonId);
    }
  } catch (e) {
    console.warn("[orphans] alias learn (reassign) failed — retarget still applied:", e);
  }

  // Mark approved and record the corrected person on the candidate row so the
  // audit trail shows what the reviewer actually decided.
  await sb
    .from("orphan_match_candidates")
    .update({
      status:              "approved",
      candidate_person_id: newPersonId,
      reviewed_by:         user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown",
      reviewed_at:         new Date().toISOString(),
    })
    .eq("id", candidateId);

  revalidatePath("/admin/hall/orphans");
  revalidatePath("/admin/hall/contacts");
}

export async function triggerOrphanScan() {
  await requireAdminAction();
  const sb = getSupabase();
  const result = await scanOrphans(sb);
  revalidatePath("/admin/hall/orphans");
  return result;
}
