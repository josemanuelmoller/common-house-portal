/**
 * POST /api/run-skill/draft-checkin
 *
 * Generates a check-in email draft for a given person and saves it to
 * Agent Drafts [OS v2].
 *
 * Person lookup: Supabase canonical (Notion fallback removed 2026-05-15,
 * post Phase 2 backfill).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createPageWithMirror } from "@/lib/notion-mirror-push";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { personId } = await req.json();
  if (!personId) {
    return NextResponse.json({ error: "personId required" }, { status: 400 });
  }

  // 1. Fetch person — Supabase canonical (Notion fallback removed post-cutoff)
  let name      = "this person";
  let jobTitle  = "";
  let email     = "";
  let warmth    = "";
  let lastDate: string | null = null;
  let notes     = "";
  let personFound = false;

  try {
    const sb = getSupabaseServerClient();
    const { data: sbPerson } = await sb
      .from("people")
      .select("full_name, job_title, email, contact_warmth, last_contact_date, notes")
      .eq("notion_id", personId)
      .single();

    if (sbPerson) {
      name      = sbPerson.full_name        ?? "this person";
      jobTitle  = sbPerson.job_title        ?? "";
      email     = sbPerson.email            ?? "";
      warmth    = sbPerson.contact_warmth   ?? "";
      lastDate  = sbPerson.last_contact_date ?? null;
      notes     = sbPerson.notes            ?? "";
      personFound = true;
    }
  } catch {
    // Supabase lookup failed — proceed to 404 below
  }

  if (!personFound) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  const lastContactDays = lastDate
    ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000)
    : null;

  // 2. Generate draft with Anthropic
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are drafting a warm, genuine check-in email for José Manuel Moller (JMM) to send.

Person details:
- Name: ${name}
- Role: ${jobTitle || "unknown"}
- Email: ${email || "unknown"}
- Contact warmth: ${warmth || "Cold"}
- Last contact: ${lastContactDays !== null ? `${lastContactDays} days ago` : "unknown / never"}
- Notes: ${notes || "none"}

Write a short, genuine check-in email (max 5 sentences total). Rules:
- NOT a sales email — no mention of proposals or opportunities
- Do NOT open with "Hope all is well" or "I wanted to reach out"
- Sound like a message from a person, not a CRM
- Include a Subject line at the top (format: Subject: ...)
- Sign off as "José Manuel"
- Keep it warm and real

Output ONLY the email (Subject + body). Nothing else.`;

  let draftText = "";
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    draftText = message.content[0].type === "text" ? message.content[0].text : "";
  } catch (e) {
    return NextResponse.json({ error: "Anthropic API error" }, { status: 500 });
  }

  // 3. Save to Agent Drafts via the mirror helper — creates the Notion page
  //    AND inserts into notion_agent_drafts in one call. Hall reads pick it
  //    up immediately on next render, no wait for forward sync.
  const titleStr = `Check-in: ${name} — ${today}`;
  const created = await createPageWithMirror({
    table: "notion_agent_drafts",
    fields: {
      title:       titleStr,
      draft_type:  "Check-in Email",
      status:      "Pending Review",
      draft_text:  draftText.slice(0, 2000),
    },
    mirrorOnly: {
      related_entity_id: personId,
      created_date:      today,
    },
    extraNotionProperties: {
      "Source Reference": { rich_text: [{ text: { content: `${name}${email ? ` <${email}>` : ""}` } }] },
      "Related Entity":   { relation: [{ id: personId }] },
    },
  });
  if (!created.ok) {
    return NextResponse.json({ error: "Draft create failed", detail: created.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    draftId:    created.id!,
    personName: name,
  });
}
