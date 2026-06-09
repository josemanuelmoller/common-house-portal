/**
 * POST /api/agent-drafts/dismiss
 *
 * Persists an agent-draft dismiss per (draft_notion_id, user_id) to
 * public.hall_draft_dismissals. Replaces the prior client-only
 * `localStorage` 24h TTL — see L-011 in tasks/lessons.md.
 *
 * Body: { draft_id: string }  (the notion_id / draft id rendered in the Hall)
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "no_user" }, { status: 401 });

  let body: { draft_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const draftId = (body.draft_id ?? "").trim();
  if (!draftId) return NextResponse.json({ error: "draft_id required" }, { status: 400 });

  const sb = getSupabaseServerClient();
  const { error } = await sb.from("hall_draft_dismissals").upsert({
    draft_notion_id: draftId,
    user_id: user.id,
    dismissed_at: new Date().toISOString(),
    dismissed_by: user.primaryEmailAddress?.emailAddress ?? null,
  }, { onConflict: "draft_notion_id,user_id" });

  if (error) return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
