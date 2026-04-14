import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_DRAFTS_DB = "9844ece875ea4c618f616e8cc97d5a90";
const DECISIONS_DB    = "6b801204c4de49c7b6179e04761a285a";
const OPPORTUNITIES_DB = "687caa98594a41b595c9960c141be0c0";
const CONTENT_DB      = "3bf5cf81f45c4db2840590f3878bfdc0";
const PEOPLE_DB       = "1bc0f96f33ca4a9e9ff26844377e81de";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function titleOf(page: any): string {
  for (const val of Object.values(page.properties ?? {}) as any[]) {
    if (val?.type === "title" && val?.title?.[0]?.plain_text) {
      return val.title[0].plain_text;
    }
  }
  return "Untitled";
}

export async function POST(_req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const today = new Date().toISOString().slice(0, 10);

  // 1. Pull signals from all relevant surfaces in parallel
  const [decisionsRes, oppsRes, contentRes, peopleRes] = await Promise.all([
    notion.databases.query({
      database_id: DECISIONS_DB,
      filter: { property: "Status", select: { equals: "Open" } },
      sorts: [{ property: "Priority", direction: "ascending" }],
      page_size: 8,
    }).catch(() => ({ results: [], has_more: false })),

    notion.databases.query({
      database_id: OPPORTUNITIES_DB,
      filter: {
        or: [
          { property: "Opportunity Status", select: { equals: "Qualifying" } },
          { property: "Opportunity Status", select: { equals: "Active" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 8,
    }).catch(() => ({ results: [], has_more: false })),

    notion.databases.query({
      database_id: CONTENT_DB,
      filter: {
        or: [
          { property: "Status", select: { equals: "In Review" } },
          { property: "Status", select: { equals: "Approved" } },
        ],
      },
      page_size: 5,
    }).catch(() => ({ results: [], has_more: false })),

    notion.databases.query({
      database_id: PEOPLE_DB,
      filter: {
        and: [
          { property: "Contact Warmth", select: { equals: "Hot" } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { property: "Follow-up Status", select: { equals: "Needed" } } as any,
        ],
      },
      page_size: 5,
    }).catch(() => ({ results: [] })),
  ]);

  // 2. Build context strings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decisions = decisionsRes.results.map((p: any) => {
    const props = p.properties;
    const title    = titleOf(p);
    const priority = props["Priority"]?.select?.name ?? "Normal";
    const type     = props["Type"]?.select?.name ?? "";
    return `[${priority}] ${title}${type ? ` (${type})` : ""}`;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opportunities = oppsRes.results.map((p: any) => {
    const props = p.properties;
    const name  = titleOf(p);
    const stage = props["Stage"]?.select?.name ?? "";
    const orgRel = props["Organisation"]?.relation?.[0]?.id;
    return `${name} · ${stage}${orgRel ? " · org linked" : ""}`;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = contentRes.results.map((p: any) => {
    const props = p.properties;
    const name   = titleOf(p);
    const status = props["Status"]?.select?.name ?? "";
    const type   = props["Content Type"]?.select?.name ?? "";
    return `${name}${type ? ` (${type})` : ""} — ${status}`;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hotContacts = peopleRes.results.map((p: any) => {
    const props = p.properties;
    return props["Full Name"]?.rich_text?.[0]?.plain_text
      ?? props["Name"]?.title?.[0]?.plain_text
      ?? "Unknown";
  });

  // 3. Generate quick wins with Anthropic
  const contextBlock = [
    decisions.length > 0   ? `OPEN DECISIONS (${decisions.length}):\n${decisions.map(d => `  • ${d}`).join("\n")}` : null,
    opportunities.length > 0 ? `ACTIVE OPPORTUNITIES (${opportunities.length}):\n${opportunities.map(o => `  • ${o}`).join("\n")}` : null,
    content.length > 0     ? `CONTENT IN REVIEW/APPROVED (${content.length}):\n${content.map(c => `  • ${c}`).join("\n")}` : null,
    hotContacts.length > 0 ? `HOT CONTACTS NEEDING FOLLOW-UP (${hotContacts.length}):\n${hotContacts.map(h => `  • ${h}`).join("\n")}` : null,
  ].filter(Boolean).join("\n\n");

  const prompt = `You are scanning the Common House OS v2 portfolio for quick wins — actions with high value and low effort that José Manuel Moller (JMM) can take today or this week.

Current OS v2 state:
${contextBlock || "No signals found — all queues appear clear."}

Identify 3–5 quick win actions. For each:
- One clear action sentence (verb + object + outcome)
- Category: Decision | Opportunity | Content | Relationship | Admin
- Effort: Low | Medium
- Why now: one sentence on urgency or opportunity cost of waiting

Format each as:
ACTION: [verb phrase]
CATEGORY: [category]
EFFORT: [Low|Medium]
WHY NOW: [one sentence]

Order by urgency (most urgent first). Output ONLY the quick wins list. Nothing else.`;

  let draftText = "";
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    draftText = message.content[0].type === "text" ? message.content[0].text : "";
  } catch (e) {
    return NextResponse.json(
      { error: "Anthropic API error", detail: String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }

  // 4. Save to Agent Drafts [OS v2]
  let draftPage;
  try {
    draftPage = await notion.pages.create({
      parent: { database_id: AGENT_DRAFTS_DB },
      properties: {
        "Draft Title": { title: [{ text: { content: `Quick Wins — ${today}` } }] },
        "Type":        { select: { name: "Quick Wins Report" } },
        "Status":      { select: { name: "Pending Review" } },
        "Content":     { rich_text: [{ text: { content: draftText.slice(0, 2000) } }] },
        "Source Reference": {
          rich_text: [{
            text: {
              content: `Scanned: ${decisions.length} decisions · ${opportunities.length} opps · ${content.length} content · ${hotContacts.length} hot contacts`,
            },
          }],
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Notion write error", detail: String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }

  // 5. Parse quick wins from the draft text for inline display
  const quickWins: { action: string; category: string; effort: string; whyNow: string }[] = [];
  const blocks = draftText.split(/\n\n+/);
  for (const block of blocks) {
    const action   = block.match(/^ACTION:\s*(.+)/m)?.[1]?.trim() ?? "";
    const category = block.match(/^CATEGORY:\s*(.+)/m)?.[1]?.trim() ?? "";
    const effort   = block.match(/^EFFORT:\s*(.+)/m)?.[1]?.trim() ?? "";
    const whyNow   = block.match(/^WHY NOW:\s*(.+)/m)?.[1]?.trim() ?? "";
    if (action) quickWins.push({ action, category, effort, whyNow });
  }

  return NextResponse.json(
    {
      ok: true,
      draftId: draftPage.id,
      notionUrl: (draftPage as { url?: string }).url ?? "",
      quickWins,
      signalsScanned: {
        decisions: decisions.length,
        opportunities: opportunities.length,
        content: content.length,
        hotContacts: hotContacts.length,
      },
    },
    { headers: corsHeaders() }
  );
}
