/**
 * POST /api/update-draft
 *
 * Updates the Content (body) of an Agent Draft in Notion.
 * Used by the Outbox inline editor so JMM can tweak a draft before approving.
 *
 * Body: { draftId: string; content: string }
 * Auth: admin session (Clerk).
 *
 * Records an `edited` proposal_outcome capturing the before/after text — this
 * is the highest-value learning signal we have (José's own corrections). Before
 * this route just overwrote body_md and the diff was lost forever.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { recordProposalOutcome } from "@/lib/proposal-outcomes";
import { currentUser } from "@clerk/nextjs/server";

const MAX_CONTENT = 2000; // Matches the slice used at write time in other skills.

/** Compact, honest one-liner: how much grew/shrank. The full diff lives in metadata. */
function summarizeEdit(oldText: string, newText: string): string {
  const delta = newText.length - oldText.length;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} chars (${oldText.length}→${newText.length})`;
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const draftId: string = body.draftId;
  const content: string = body.content;

  if (!draftId || typeof content !== "string") {
    return NextResponse.json({ error: "draftId and content required" }, { status: 400 });
  }

  const newBody = content.slice(0, MAX_CONTENT);

  try {
    const sb = getSupabaseServerClient();

    // Read the current draft first so we can capture what actually changed.
    // Notion "Content" rich_text → canonical agent_drafts.body_md.
    const { data: before } = await sb
      .from("agent_drafts")
      .select("id, body_md, title, draft_type")
      .eq("notion_id", draftId)
      .maybeSingle();

    const { error } = await sb
      .from("agent_drafts")
      .update({
        body_md: newBody,
        updated_at: new Date().toISOString(),
      })
      .eq("notion_id", draftId);
    if (error) {
      return NextResponse.json({ error: "Supabase update error", detail: error.message }, { status: 500 });
    }

    // Record the correction — fire-and-forget, only when the body really changed.
    const oldBody = (before?.body_md as string | null) ?? "";
    if (before && oldBody !== newBody) {
      const user = await currentUser();
      void recordProposalOutcome({
        proposal_type: "agent_draft",
        // Prefer the canonical id so this joins with approve/send outcomes.
        proposal_id: (before.id as string | null) ?? draftId,
        action: "edited",
        agent_name: (before.draft_type as string | null) ?? null,
        edit_summary: summarizeEdit(oldBody, newBody),
        actor_email: user?.primaryEmailAddress?.emailAddress ?? null,
        proposal_title: (before.title as string | null) ?? null,
        metadata: { old_body: oldBody, new_body: newBody },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "agent_drafts update error" },
      { status: 500 }
    );
  }
}
