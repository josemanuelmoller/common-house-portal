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

  // 1. Fetch person name + email — Supabase-first, Notion fallback
  let personName = "Unknown";
  let personEmail = "";

  try {
    const sb = getSupabaseServerClient();
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

  // 2. Fetch the draft to get the linked Opportunity (if any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draft = await notion.pages.retrieve({ page_id: draftId }) as any;
  const opportunityId: string | null =
    draft.properties?.["Opportunity"]?.relation?.[0]?.id ?? null;

  // 3. Write Related Entity on the draft
  await notion.pages.update({
    page_id: draftId,
    properties: {
      "Related Entity": { relation: [{ id: personId }] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  // 4. Append person to Opportunity Key Contacts (non-fatal if it fails)
  if (opportunityId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opp = await notion.pages.retrieve({ page_id: opportunityId }) as any;
      const existing: { id: string }[] =
        (opp.properties?.["Key Contacts"]?.relation ?? []).map((r: { id: string }) => ({ id: r.id }));
      const alreadyLinked = existing.some(r => r.id === personId);
      if (!alreadyLinked) {
        await notion.pages.update({
          page_id: opportunityId,
          properties: {
            "Key Contacts": { relation: [...existing, { id: personId }] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        });
      }
    } catch {
      // Non-fatal — the draft is now sendable even if the opp update fails.
    }
  }

  return NextResponse.json({ ok: true, personName, email: personEmail });
}
