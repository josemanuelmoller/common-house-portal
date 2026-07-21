/**
 * POST /api/run-skill/identify-quick-win
 *
 * Scans OS v2 surfaces for quick-win actions and generates a draft report.
 *
 * All signal reads are Supabase-backed (Notion read cutoff).
 * Opportunities, decisions, content, and people all read from Supabase.
 * Note: the people query filters by contact_warmth only — the legacy
 * "Follow-up Status = Needed" filter has no column in the people table.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createPageWithMirror } from "@/lib/notion-mirror-push";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(_req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const today = new Date().toISOString().slice(0, 10);

  // 1. Pull signals from all relevant surfaces in parallel (all Supabase-backed)
  const sb = getSupabaseServerClient();
  const [decisionRows, contentRows, peopleRows, sbOpps] = await Promise.all([
    (async () => {
      const { data } = await sb
        .from("decision_items")
        .select("title, priority, decision_type")
        .eq("status", "Open")
        .order("priority", { ascending: true })
        .limit(8);
      return data ?? [];
    })().catch(() => []),

    (async () => {
      const { data } = await sb
        .from("content_pipeline_items")
        .select("title, status, payload")
        .in("status", ["Review", "Approved"])
        .limit(5);
      return data ?? [];
    })().catch(() => []),

    (async () => {
      const { data } = await sb
        .from("people")
        .select("full_name")
        .eq("contact_warmth", "Hot")
        .limit(5);
      return data ?? [];
    })().catch(() => []),

    (async () => {
      const { data } = await sb
        .from("opportunities")
        .select("title, status, org_notion_id")
        .in("status", ["Active", "Qualifying"])
        .order("updated_at", { ascending: false })
        .limit(8);
      return data ?? [];
    })().catch(() => []),
  ]);

  // 2. Build context strings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decisions = decisionRows.map((d: any) => {
    const priority = d.priority ?? "Normal";
    const type     = d.decision_type ?? "";
    return `[${priority}] ${d.title ?? "Untitled"}${type ? ` (${type})` : ""}`;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opportunities = sbOpps.map((o: any) =>
    `${o.title} · ${o.status}${o.org_notion_id ? " · org linked" : ""}`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = contentRows.map((c: any) => {
    const status = c.status ?? "";
    const type   = c.payload?.content_type ?? "";
    return `${c.title ?? "Untitled"}${type ? ` (${type})` : ""} — ${status}`;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hotContacts = peopleRows.map((p: any) => p.full_name ?? "Unknown");

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
      { error: "Anthropic API error" },
      { status: 500, headers: corsHeaders() }
    );
  }

  // 4. Save to Agent Drafts via mirror.
  const created = await createPageWithMirror({
    table: "notion_agent_drafts",
    fields: {
      title:      `Quick Wins — ${today}`,
      draft_type: "Quick Wins Report",
      status:     "Pending Review",
      draft_text: draftText.slice(0, 2000),
    },
    mirrorOnly: {
      created_date: today,
    },
    extraNotionProperties: {
      "Source Reference": {
        rich_text: [{
          text: {
            content: `Scanned: ${decisions.length} decisions · ${opportunities.length} opps · ${content.length} content · ${hotContacts.length} hot contacts`,
          },
        }],
      },
    },
  });
  if (!created.ok) {
    return NextResponse.json({ error: "Draft create failed", detail: created.error }, { status: 500, headers: corsHeaders() });
  }
  const draftPage = { id: created.id!, url: "" };

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
