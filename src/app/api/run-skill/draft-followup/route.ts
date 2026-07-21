import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import Anthropic from "@anthropic-ai/sdk";
import { createPageWithMirror } from "@/lib/notion-mirror-push";
import { getProposalFeedbackContext } from "@/lib/proposal-feedback";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { opportunityId } = await req.json();
  if (!opportunityId) {
    return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  }

  // 1. Fetch opportunity from Supabase `opportunities` (read migrated OFF Notion).
  const sb = getSupabaseServerClient();
  const { data: opp } = await sb
    .from("opportunities")
    .select("title, status, scope, opportunity_type, org_notion_id, updated_at")
    .eq("notion_id", opportunityId)
    .maybeSingle();
  if (!opp) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  const oppName   = (opp.title as string) || "this opportunity";
  const stage     = (opp.status as string | null) ?? "";
  const scope     = (opp.scope as string | null) ?? "";
  const oppType   = (opp.opportunity_type as string | null) ?? "";
  const lastEdit  = (opp.updated_at as string | null)?.slice(0, 10) ?? null;
  const orgId     = (opp.org_notion_id as string | null) ?? null;
  // "Key Contacts" is not synced to the Supabase opportunities table. Drafts are
  // created without a linked contact; it can be assigned later via the inbox
  // "Assign contact" action before sending.
  const contactId: string | null = null;

  const lastEditDays = lastEdit
    ? Math.floor((Date.now() - new Date(lastEdit).getTime()) / 86400000)
    : null;

  // 2. Optionally fetch org name from Supabase `organizations`.
  let orgName = "";
  if (orgId) {
    const { data: org } = await sb
      .from("organizations")
      .select("name")
      .eq("notion_id", orgId)
      .maybeSingle();
    orgName = (org?.name as string | null) ?? "";
  }

  // 3. Generate draft with Anthropic
  const today = new Date().toISOString().slice(0, 10);

  // Feedback loop: past follow-up drafts José rejected / rewrote. Empty until data exists.
  const feedbackContext = await getProposalFeedbackContext({
    proposalType: "agent_draft",
    agentName: "Follow-up Email",
  });

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

${feedbackContext}
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

  // 4. Save to Agent Drafts via mirror — Notion + Supabase in one call.
  const titleStr = `Follow-up: ${oppName} — ${today}`;
  const created = await createPageWithMirror({
    table: "notion_agent_drafts",
    fields: {
      title:      titleStr,
      draft_type: "Follow-up Email",
      status:     "Pending Review",
      draft_text: draftText.slice(0, 2000),
    },
    mirrorOnly: {
      related_entity_id: contactId ?? null,
      opportunity_id:    opportunityId,
      created_date:      today,
    },
    extraNotionProperties: {
      "Source Reference": { rich_text: [{ text: { content: `${oppName}${orgName ? ` · ${orgName}` : ""}` } }] },
      "Related Entity":   { relation: contactId ? [{ id: contactId }] : [] },
      "Opportunity":      { relation: [{ id: opportunityId }] },
    },
  });
  if (!created.ok) {
    return NextResponse.json({ error: "Draft create failed", detail: created.error }, { status: 500 });
  }
  const draftPage = { id: created.id!, url: "" };

  return NextResponse.json({
    ok: true,
    draftId: draftPage.id,
    notionUrl: (draftPage as { url?: string }).url ?? "",
    opportunityName: oppName,
  });
}
