import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_DRAFTS_DB = "9844ece875ea4c618f616e8cc97d5a90";

export async function POST(req: NextRequest) {
  const { personId } = await req.json();
  if (!personId) {
    return NextResponse.json({ error: "personId required" }, { status: 400 });
  }

  // 1. Fetch person from Notion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let person: any;
  try {
    person = await notion.pages.retrieve({ page_id: personId });
  } catch {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = (name: string) => (person as any).properties?.[name];
  const richText = (p: { rich_text?: { plain_text: string }[] } | undefined) =>
    p?.rich_text?.map((r) => r.plain_text).join("") ?? "";
  const sel = (p: { select?: { name: string } } | undefined) => p?.select?.name ?? "";
  const dateVal = (p: { date?: { start: string } } | undefined) => p?.date?.start ?? null;

  const name      = richText(prop("Full Name")) || richText(prop("Name")) || "this person";
  const jobTitle  = richText(prop("Job Title / Role"));
  const email     = prop("Email")?.email ?? "";
  const warmth    = sel(prop("Contact Warmth"));
  const lastDate  = dateVal(prop("Last Contact Date"));
  const notes     = richText(prop("Notes"));

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
    return NextResponse.json({ error: "Anthropic API error", detail: String(e) }, { status: 500 });
  }

  // 3. Save to Agent Drafts [OS v2]
  let draftPage;
  try {
    draftPage = await notion.pages.create({
      parent: { database_id: AGENT_DRAFTS_DB },
      properties: {
        "Title":        { title: [{ text: { content: `Check-in: ${name} — ${today}` } }] },
        "Type":         { select: { name: "Check-in Email" } },
        "Status":       { select: { name: "Pending Review" } },
        "Voice":        { select: { name: "JMM" } },
        "Platform":     { select: { name: "Email" } },
        "Draft Text":   { rich_text: [{ text: { content: draftText.slice(0, 2000) } }] },
        "Created Date": { date: { start: today } },
        ...(personId ? { "Related Entity": { relation: [{ id: personId }] } } : {}),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Notion write error", detail: String(e) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    draftId: draftPage.id,
    notionUrl: (draftPage as { url?: string }).url ?? "",
    personName: name,
  });
}
