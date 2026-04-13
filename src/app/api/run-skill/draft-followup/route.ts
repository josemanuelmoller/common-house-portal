import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_DRAFTS_DB = "9844ece875ea4c618f616e8cc97d5a90";

export async function POST(req: NextRequest) {
  const { opportunityId } = await req.json();
  if (!opportunityId) {
    return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  }

  // 1. Fetch opportunity from Notion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let opp: any;
  try {
    opp = await notion.pages.retrieve({ page_id: opportunityId });
  } catch {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = (name: string) => (opp as any).properties?.[name];
  const richText = (p: { rich_text?: { plain_text: string }[] } | undefined) =>
    p?.rich_text?.map((r) => r.plain_text).join("") ?? "";
  const sel = (p: { select?: { name: string } } | undefined) => p?.select?.name ?? "";
  const titleProp = (p: { title?: { plain_text: string }[] } | undefined) =>
    p?.title?.map((r) => r.plain_text).join("") ?? "";
  const dateVal = (p: { date?: { start: string } } | undefined) => p?.date?.start ?? null;
  const relationFirst = (p: { relation?: { id: string }[] } | undefined) =>
    p?.relation?.[0]?.id ?? null;

  const oppName   = titleProp(prop("Name")) || richText(prop("Name")) || "this opportunity";
  const stage     = sel(prop("Stage"));
  const scope     = sel(prop("Scope"));
  const oppType   = sel(prop("Type"));
  const lastEdit  = dateVal(prop("Last Edited")) ?? opp.last_edited_time?.slice(0, 10) ?? null;
  const orgId     = relationFirst(prop("Organisation"));

  const lastEditDays = lastEdit
    ? Math.floor((Date.now() - new Date(lastEdit).getTime()) / 86400000)
    : null;

  // 2. Optionally fetch org name
  let orgName = "";
  if (orgId) {
    try {
      const orgPage = await notion.pages.retrieve({ page_id: orgId });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgProps = (orgPage as any).properties;
      orgName = orgProps?.["Name"]?.title?.[0]?.plain_text ?? "";
    } catch { /* ignore */ }
  }

  // 3. Generate draft with Anthropic
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are drafting a follow-up email for José Manuel Moller (JMM) about a business opportunity.

Opportunity details:
- Name: ${oppName}
- Organisation: ${orgName || "unknown"}
- Stage: ${stage || "unknown"}
- Scope: ${scope || "CH"}
- Type: ${oppType || "CH Sale"}
- Last activity: ${lastEditDays !== null ? `${lastEditDays} days ago` : "unknown"}

Write a short, professional follow-up email (max 6 sentences). Rules:
- Be specific to this opportunity (reference the org/context naturally)
- Clear next step or ask in the last sentence
- Not pushy — confident and direct
- Include a Subject line (format: Subject: ...)
- Sign off as "José Manuel"

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

  // 4. Save to Agent Drafts [OS v2]
  let draftPage;
  try {
    draftPage = await notion.pages.create({
      parent: { database_id: AGENT_DRAFTS_DB },
      properties: {
        "Draft Title":      { title: [{ text: { content: `Follow-up: ${oppName} — ${today}` } }] },
        "Type":             { select: { name: "Follow-up Email" } },
        "Status":           { select: { name: "Pending Review" } },
        "Source Reference": { rich_text: [{ text: { content: `${oppName}${orgName ? ` · ${orgName}` : ""}` } }] },
        "Content":          { rich_text: [{ text: { content: draftText.slice(0, 2000) } }] },
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Notion write error", detail: String(e) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    draftId: draftPage.id,
    notionUrl: (draftPage as { url?: string }).url ?? "",
    opportunityName: oppName,
  });
}
