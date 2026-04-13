import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_DRAFTS_DB = "9844ece875ea4c618f616e8cc97d5a90";
const INSIGHT_BRIEFS_DB = "04bed3a3fd1a4b3a99643cd21562e08a";
const KNOWLEDGE_DB = "0f4bfe95549d4710a3a9ab6e119a9b04";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const topicHint: string = body.topic_hint ?? "";

  const today = new Date().toISOString().slice(0, 10);

  // 1. Pull recent context from Insight Briefs and Knowledge Assets in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let insightContext = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let knowledgeContext = "";

  try {
    const [briefsRes, knowledgeRes] = await Promise.all([
      notion.databases.query({
        database_id: INSIGHT_BRIEFS_DB,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: 5,
      }),
      notion.databases.query({
        database_id: KNOWLEDGE_DB,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: 3,
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const briefs = briefsRes.results.map((p: any) => {
      const props = p.properties;
      const title = props["Brief Title"]?.title?.[0]?.plain_text
        ?? props["Name"]?.title?.[0]?.plain_text ?? "";
      const summary = props["Executive Summary"]?.rich_text?.[0]?.plain_text
        ?? props["Summary"]?.rich_text?.[0]?.plain_text ?? "";
      const insights = props["Key Insights"]?.rich_text?.[0]?.plain_text ?? "";
      return `- ${title}${summary ? `: ${summary.slice(0, 200)}` : ""}${insights ? ` // ${insights.slice(0, 150)}` : ""}`;
    }).filter(Boolean).join("\n");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assets = knowledgeRes.results.map((p: any) => {
      const props = p.properties;
      const name = props["Asset Name"]?.title?.[0]?.plain_text
        ?? props["Name"]?.title?.[0]?.plain_text ?? "";
      const summary = props["Summary"]?.rich_text?.[0]?.plain_text ?? "";
      return `- ${name}${summary ? `: ${summary.slice(0, 150)}` : ""}`;
    }).filter(Boolean).join("\n");

    if (briefs) insightContext = `Recent Insight Briefs:\n${briefs}`;
    if (assets) knowledgeContext = `Knowledge Assets:\n${assets}`;
  } catch {
    // Context unavailable — proceed with topic hint only
  }

  // 2. Generate LinkedIn post with Anthropic
  const contextSection = [insightContext, knowledgeContext].filter(Boolean).join("\n\n");

  const prompt = `You are writing a LinkedIn post for José Manuel Moller (JMM), co-founder of Common House — a circular economy and sustainable retail consultancy working across Latin America and Europe.

${topicHint ? `Topic hint from JMM: "${topicHint}"\n` : ""}${contextSection ? `\nContext from OS v2 knowledge base:\n${contextSection}\n` : ""}
Write a single LinkedIn post. Voice rules:
- First person, confident, direct — not corporate
- Opens with a sharp observation or concrete fact, NOT a question or "I've been thinking"
- 3–5 short paragraphs, each under 3 lines
- One concrete insight or lesson the reader can take away
- Ends with a clear statement, not a question
- No hashtags unless they're genuinely useful (max 2)
- No emojis
- Under 250 words total

Output ONLY the post text. Nothing else.`;

  let draftText = "";
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    draftText = message.content[0].type === "text" ? message.content[0].text : "";
  } catch (e) {
    return NextResponse.json(
      { error: "Anthropic API error", detail: String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }

  // 3. Save to Agent Drafts [OS v2]
  let draftPage;
  const draftTitle = topicHint
    ? `LinkedIn post: ${topicHint.slice(0, 60)} — ${today}`
    : `LinkedIn post — ${today}`;

  try {
    draftPage = await notion.pages.create({
      parent: { database_id: AGENT_DRAFTS_DB },
      properties: {
        "Draft Title": { title: [{ text: { content: draftTitle } }] },
        "Type":        { select: { name: "LinkedIn Post" } },
        "Status":      { select: { name: "Pending Review" } },
        "Content":     { rich_text: [{ text: { content: draftText.slice(0, 2000) } }] },
        "Source Reference": {
          rich_text: [{ text: { content: topicHint ? `Topic hint: ${topicHint}` : "Auto-generated from Insight Briefs + Knowledge Assets" } }],
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Notion write error", detail: String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      draftId: draftPage.id,
      notionUrl: (draftPage as { url?: string }).url ?? "",
      preview: draftText.slice(0, 120) + "…",
    },
    { headers: corsHeaders() }
  );
}
