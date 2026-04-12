"use server";

import { revalidatePath } from "next/cache";
import { notion } from "@/lib/notion";
import { requireAdminAction } from "@/lib/require-admin";

// WRITE PATH DECISION (2026-04-11):
// The OS engine's validation-operator is the sole writer of Validation Status = "Validated".
// The portal sets Validation Status = "Reviewed" to signal human review without bypassing the
// engine's validation criteria (Source Excerpt check, Confidence level, etc.).
// "Reviewed" is a terminal state in the portal — the engine skips records not at "New".
// If a record needs to reach "Validated", run the OS engine on it explicitly.
export async function markEvidenceReviewed(evidenceId: string) {
  await requireAdminAction();

  await notion.pages.update({
    page_id: evidenceId,
    properties: {
      "Validation Status": {
        select: { name: "Reviewed" },
      },
    },
  });

  revalidatePath("/admin/os");
  revalidatePath("/admin");
}

// "Rejected" is safe to write from portal — both portal and engine use the same value
// and rejection is a deliberate human decision that should not be deferred to the engine.
export async function rejectEvidence(evidenceId: string) {
  await requireAdminAction();

  await notion.pages.update({
    page_id: evidenceId,
    properties: {
      "Validation Status": {
        select: { name: "Rejected" },
      },
    },
  });

  revalidatePath("/admin/os");
  revalidatePath("/admin");
}
