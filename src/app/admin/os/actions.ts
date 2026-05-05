"use server";

import { revalidatePath } from "next/cache";
// notion-cutoff-2026-06-02: removed; canonical write is now to evidence (Supabase).
// import { notion } from "@/lib/notion";
import { requireAdminAction } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// WRITE PATH DECISION (2026-04-11):
// The OS engine's validation-operator is the sole writer of Validation Status = "Validated".
// The portal sets Validation Status = "Reviewed" to signal human review without bypassing the
// engine's validation criteria (Source Excerpt check, Confidence level, etc.).
// "Reviewed" is a terminal state in the portal — the engine skips records not at "New".
// If a record needs to reach "Validated", run the OS engine on it explicitly.
//
// notion-cutoff-2026-06-02: All writes now target the canonical Supabase
// `evidence` table. The `evidenceId` argument was historically a Notion page id
// and is matched against either the uuid `id` column or the `notion_id` column.
async function updateEvidenceValidationStatus(
  evidenceId: string,
  status: "Reviewed" | "Rejected",
): Promise<void> {
  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    validation_status: status,
    updated_at: nowIso,
  };
  if (status === "Reviewed") {
    update.reviewed_at = nowIso.slice(0, 10);
  }
  const isUuid = /^[0-9a-f-]{36}$/i.test(evidenceId);
  const matchColumn = isUuid ? "id" : "notion_id";
  await sb.from("evidence").update(update).eq(matchColumn, evidenceId);
}

export async function markEvidenceReviewed(evidenceId: string) {
  await requireAdminAction();

  // notion-cutoff-2026-06-02: replaced by canonical write to evidence (Supabase).
  // await notion.pages.update({
  //   page_id: evidenceId,
  //   properties: { "Validation Status": { select: { name: "Reviewed" } } },
  // });
  await updateEvidenceValidationStatus(evidenceId, "Reviewed");

  revalidatePath("/admin/os");
  revalidatePath("/admin");
}

export async function batchMarkReviewed(evidenceIds: string[]) {
  await requireAdminAction();
  if (!evidenceIds.length) return;

  // notion-cutoff-2026-06-02: replaced by canonical write to evidence (Supabase).
  // await Promise.all(
  //   evidenceIds.map(id =>
  //     notion.pages.update({
  //       page_id: id,
  //       properties: { "Validation Status": { select: { name: "Reviewed" } } },
  //     })
  //   )
  // );
  await Promise.all(evidenceIds.map(id => updateEvidenceValidationStatus(id, "Reviewed")));

  revalidatePath("/admin/os");
  revalidatePath("/admin");
}

// "Rejected" is safe to write from portal — both portal and engine use the same value
// and rejection is a deliberate human decision that should not be deferred to the engine.
export async function rejectEvidence(evidenceId: string) {
  await requireAdminAction();

  // notion-cutoff-2026-06-02: replaced by canonical write to evidence (Supabase).
  // await notion.pages.update({
  //   page_id: evidenceId,
  //   properties: { "Validation Status": { select: { name: "Rejected" } } },
  // });
  await updateEvidenceValidationStatus(evidenceId, "Rejected");

  revalidatePath("/admin/os");
  revalidatePath("/admin");
}
