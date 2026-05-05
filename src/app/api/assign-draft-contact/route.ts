/**
 * POST /api/assign-draft-contact
 *
 * Assigns a contact (People DB page) to a Follow-up Email draft.
 * Writes to two places:
 *   1. Agent Draft "Related Entity" relation → enables send-draft to resolve
 *      the real recipient email instead of falling back to self-send.
 *   2. Opportunity "Key Contacts" relation (if the draft has an Opportunity
 *      linked) → keeps the OS data consistent so future drafts auto-populate.
 *
 * Body: { draftId: string, personId: string }
 * Auth: admin session (Clerk).
 *
 * Person lookup: Supabase-first since Wave 5 (2026-04-17).
 * Falls back to Notion pages.retrieve if person not yet synced.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
// notion-cutoff-2026-06-02: write removed; canonical writes are now to agent_drafts + opportunities (Supabase).
// The Notion read fallback for unsynced people is preserved as a degraded path.
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json() as { draftId?: string; personId?: string };
  const { draftId, personId } = body;
  if (!draftId || !personId) {
    return NextResponse.json({ error: "draftId and personId required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  // 1. Fetch person name + email — Supabase-first, Notion fallback
  let personName = "Unknown";
  let personEmail = "";

  try {
    const { data: person } = await sb
      .from("people")
      .select("full_name, email")
      .eq("notion_id", personId)
      .single();

    if (person) {
      personName  = person.full_name  ?? "Unknown";
      personEmail = person.email      ?? "";
    } else {
      // Fallback: person not yet synced to Supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const personPage = await notion.pages.retrieve({ page_id: personId }) as any;
      const pp = personPage.properties;
      personName =
        pp["Full Name"]?.title?.[0]?.plain_text ??
        pp["Full Name"]?.rich_text?.[0]?.plain_text ??
        pp["Name"]?.title?.[0]?.plain_text ??
        "Unknown";
      personEmail = pp["Email"]?.email ?? "";
    }
  } catch {
    // If both paths fail, proceed with defaults — the draft write is more important
  }

  // 2. Fetch the draft from agent_drafts (Supabase canonical) to get linked opportunity.
  // Match by notion_id since draftId historically is the Notion page id.
  let opportunityNotionId: string | null = null;
  let draftRowId: string | null = null;
  let draftPayload: Record<string, unknown> = {};
  {
    const { data: draftRow } = await sb
      .from("agent_drafts")
      .select("id, payload")
      .eq("notion_id", draftId)
      .maybeSingle();
    if (draftRow) {
      draftRowId   = draftRow.id;
      draftPayload = (draftRow.payload as Record<string, unknown>) ?? {};
      opportunityNotionId = (draftPayload["opportunity_notion_id"] as string) ?? null;
    }
  }

  // 3. Write target_person_notion_id on agent_drafts (canonical equivalent of "Related Entity").
  // notion-cutoff-2026-06-02: replaced by canonical write to agent_drafts.target_person_notion_id (Supabase).
  // Notion → Supabase (agent_drafts) column mapping:
  //   "Related Entity" relation[0] → target_person_notion_id
  // await notion.pages.update({
  //   page_id: draftId,
  //   properties: { "Related Entity": { relation: [{ id: personId }] } } as any,
  // });
  {
    const { error } = await sb
      .from("agent_drafts")
      .update({
        target_person_notion_id: personId,
        updated_at: new Date().toISOString(),
      })
      .eq("notion_id", draftId);
    if (error) {
      return NextResponse.json(
        { error: "agent_drafts update error", detail: error.message },
        { status: 500 },
      );
    }
  }

  // 4. Append person to Opportunity Key Contacts (non-fatal if it fails)
  if (opportunityNotionId) {
    try {
      // notion-cutoff-2026-06-02: replaced by canonical write to opportunities (Supabase).
      // Notion `Key Contacts` relation[] is mirrored here as opportunities.payload.key_contact_notion_ids
      // (no dedicated column yet; opportunities table is column-bound for status/follow_up only at this phase).
      // const opp = await notion.pages.retrieve({ page_id: opportunityId }) as any;
      // const existing = (opp.properties?.["Key Contacts"]?.relation ?? []).map((r) => ({ id: r.id }));
      // if (!existing.some(r => r.id === personId)) {
      //   await notion.pages.update({
      //     page_id: opportunityId,
      //     properties: { "Key Contacts": { relation: [...existing, { id: personId }] } } as any,
      //   });
      // }
      const { data: oppRow } = await sb
        .from("opportunities")
        .select("id, payload")
        .eq("notion_id", opportunityNotionId)
        .maybeSingle();
      if (oppRow) {
        const oppPayload = (oppRow.payload as Record<string, unknown>) ?? {};
        const existing = Array.isArray(oppPayload.key_contact_notion_ids)
          ? (oppPayload.key_contact_notion_ids as string[])
          : [];
        if (!existing.includes(personId)) {
          const merged = [...existing, personId];
          await sb
            .from("opportunities")
            .update({
              payload: { ...oppPayload, key_contact_notion_ids: merged },
              updated_at: new Date().toISOString(),
            })
            .eq("notion_id", opportunityNotionId);
        }
      }
    } catch {
      // Non-fatal — the draft is now sendable even if the opp update fails.
    }
  }

  return NextResponse.json({
    ok: true,
    personName,
    email: personEmail,
    draftRowId,
  });
}
