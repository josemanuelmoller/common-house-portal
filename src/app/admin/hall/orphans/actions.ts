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

  const { error: updErr } = await sb
    .from("conversation_messages")
    .update({ sender_person_id: cand.candidate_person_id })
    .eq("source_id", cand.source_id)
    .ilike("sender_name", cand.sender_name)
    .is("sender_person_id", null);
  if (updErr) throw new Error("Backfill failed: " + updErr.message);

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

export async function triggerOrphanScan() {
  await requireAdminAction();
  const sb = getSupabase();
  const result = await scanOrphans(sb);
  revalidatePath("/admin/hall/orphans");
  return result;
}
