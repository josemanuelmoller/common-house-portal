/**
 * POST /api/create-candidate
 *
 * Quick-creates an Opportunity Candidate from an inbox item.
 * Called from the InboxTriage component "+ Opportunity" button.
 *
 * Body:
 *   { fromName: string, from: string, subject: string, snippet?: string, gmailUrl?: string }
 *
 * Creates status="New" in `public.opportunities` with:
 *   - title:            derived from subject + fromName
 *   - trigger_signal:   inbox context (fromName, email, snippet)
 *   - source_url:       Gmail thread URL
 *   - status:           "New"
 *   - follow_up_status: "Needed"
 *   - scope:            "CH"
 *
 * notion-cutoff-2026-06-02: replaced by canonical write to opportunities (Supabase).
 * Per docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.2 the canonical store is `public.opportunities`.
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { fromName?: string; from?: string; subject?: string; snippet?: string; gmailUrl?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { fromName, from, subject, snippet, gmailUrl } = body;
  if (!fromName || !subject) return NextResponse.json({ error: "fromName and subject are required" }, { status: 400 });

  // Derive a concise opportunity name: truncate subject if needed + fromName
  const oppName = `${subject.slice(0, 70)} — ${fromName}`.slice(0, 100);
  const signalContext = snippet
    ? `Inbox signal: email from ${fromName}${from ? ` <${from}>` : ""}. Preview: ${snippet.slice(0, 300)}`
    : `Inbox signal: email from ${fromName}${from ? ` <${from}>` : ""}. Subject: ${subject}`;

  const nowIso = new Date().toISOString();

  try {
    // notion-cutoff-2026-06-02: replaced by canonical write to opportunities
    // const page = await notion.pages.create({
    //   parent: { database_id: DB_OPPORTUNITIES },
    //   properties: {
    //     "Opportunity Name":   { title:  [{ text: { content: oppName } }] },
    //     "Opportunity Status": { select: { name: "New" } },
    //     "Follow-up Status":   { select: { name: "Needed" } },
    //     "Scope":              { select: { name: "CH" } },
    //     "Trigger / Signal":   { rich_text: [{ text: { content: signalContext } }] },
    //     "Source URL":         { url: gmailUrl },
    //   },
    // });
    const sb = getSupabaseServerClient();
    const trigger = signalContext.slice(0, 2000);

    const { data, error } = await sb
      .from("opportunities")
      .insert({
        title:            oppName,
        status:           "New",
        follow_up_status: "Needed",
        scope:            "CH",
        trigger_signal:   trigger,
        pending_action:   trigger,
        source_url:       gmailUrl ?? null,
        is_active:        true,
        is_archived:      false,
        is_legacy:        false,
        notion_created_at: nowIso,
        created_at:       nowIso,
        updated_at:       nowIso,
        // legacy_notion_id intentionally null — net-new candidate created post-cutoff.
      })
      .select("id")
      .single();

    if (error) {
      console.error("[create-candidate] Supabase insert failed:", error.message);
      return NextResponse.json({ error: "Failed to create candidate", detail: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, candidateId: data?.id ?? "", notionUrl: "" });
  } catch (err) {
    console.error("[create-candidate] insert failed:", err);
    return NextResponse.json({ error: "Failed to create candidate" }, { status: 502 });
  }
}
