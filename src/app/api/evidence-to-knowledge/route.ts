/**
 * POST /api/evidence-to-knowledge
 *
 * Bridges validated Canonical/Reusable evidence to Knowledge Assets [OS v2].
 * Runs over evidence captured in the last 7 days with Reusability = Canonical.
 * Groups by Affected Theme, synthesizes with Claude, creates Draft KA records.
 *
 * Conservative: only creates KA drafts, never overwrites existing assets.
 * Admin must review and promote drafts to Active in Notion.
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET.
 * Called by Vercel cron daily at 04:00 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
// notion-cutoff-2026-06-02: write removed; canonical write is now to knowledge_assets (Supabase).
// The Notion read path (Evidence DB query) is preserved until the read source is migrated.
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/require-cron";
import { withRoutineLog } from "@/lib/routine-log";
import { computeAnthropicCost, makeUsageAccumulator, addUsage, type AnthropicUsage } from "@/lib/anthropic-cost";

const HAIKU_MODEL = "claude-haiku-4-5";

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EVIDENCE_DB = "fa28124978d043039d8932ac9964ccf5";
const KNOWLEDGE_DB = "0f4bfe95549d4710a3a9ab6e119a9b04";

const VALID_ASSET_TYPES = new Set([
  "Playbook", "Pattern Library", "Method", "Checklist",
  "Template", "Benchmark", "Insight Memo",
]);

// ─── Fetch recent canonical evidence ─────────────────────────────────────────

interface RawEvidence {
  id: string;
  title: string;
  type: string;
  statement: string;
  theme: string;
  topics: string[];
  reusability: string;
  dateCaptured: string | null;
}

async function fetchCanonicalEvidence(sinceDays = 7): Promise<RawEvidence[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const res = await notion.databases.query({
    database_id: EVIDENCE_DB,
    filter: {
      and: [
        {
          or: [
            { property: "Reusability Level", select: { equals: "Canonical" } },
            { property: "Reusability Level", select: { equals: "Reusable" } },
          ],
        },
        { property: "Validation Status", select: { equals: "Validated" } },
        { property: "Date Captured", date: { on_or_after: since } },
      ],
    },
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(page => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (name: string) => page.properties[name] as any;
    return {
      id:          page.id,
      title:       p("Evidence Title")?.title?.map((r: any) => r.plain_text).join("") ?? "Untitled",
      type:        p("Evidence Type")?.select?.name ?? "",
      statement:   p("Statement")?.rich_text?.map((r: any) => r.plain_text).join("") ?? "",
      theme:       p("Affected Theme")?.select?.name ?? "General",
      topics:      (p("Topics")?.multi_select ?? []).map((o: any) => o.name as string),
      reusability: p("Reusability Level")?.select?.name ?? "",
      dateCaptured:p("Date Captured")?.date?.start ?? null,
    };
  });
}

// ─── Synthesize KA draft with Claude ─────────────────────────────────────────

async function synthesizeKnowledgeAsset(items: RawEvidence[], usageAcc?: AnthropicUsage): Promise<{
  title: string; summary: string; keyPoints: string[];
  assetType: string; tags: string[];
} | null> {
  const content = items.map((e, i) =>
    `[${i + 1}] ${e.type} — ${e.title}\n${e.statement}`
  ).join("\n\n");

  const prompt = `You are a knowledge curator for Common House, a circular economy ecosystem operator.

Below are ${items.length} validated evidence items that have been flagged as reusable cross-project knowledge.
Synthesize them into a single Knowledge Asset record.

Evidence items:
${content}

Return a JSON object:
{
  "title": "concise title for this knowledge asset (max 80 chars)",
  "summary": "2-3 sentence synthesis of what this knowledge represents",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "assetType": one of: "Playbook" | "Pattern Library" | "Method" | "Checklist" | "Template" | "Benchmark" | "Insight Memo",
  "tags": ["tag1", "tag2"]
}

Asset type guidance:
- Playbook: operational process or workflow
- Pattern Library: recurring dynamic observed across projects
- Method: analytical framework or evaluation tool
- Benchmark: comparative data or performance standard
- Insight Memo: synthesized qualitative insight across projects

Return ONLY the JSON object.`;

  try {
    const msg = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    if (usageAcc) addUsage(usageAcc, msg.usage);
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!VALID_ASSET_TYPES.has(parsed.assetType)) parsed.assetType = "Insight Memo";
    return parsed;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const evidence = await fetchCanonicalEvidence(7);
  if (!evidence.length) {
    return NextResponse.json({ ok: true, created: 0, cost_usd: 0, message: "No new canonical evidence in last 7 days" });
  }

  const usageAcc = makeUsageAccumulator();

  // Group by theme
  const byTheme: Record<string, RawEvidence[]> = {};
  for (const e of evidence) {
    const key = e.theme || "General";
    if (!byTheme[key]) byTheme[key] = [];
    byTheme[key].push(e);
  }

  let created = 0;
  const errors: string[] = [];

  for (const [theme, items] of Object.entries(byTheme)) {
    // Need ≥2 items to synthesize something meaningful
    if (items.length < 2) continue;

    try {
      const synthesis = await synthesizeKnowledgeAsset(items, usageAcc);
      if (!synthesis) { errors.push(`Synthesis failed for theme: ${theme}`); continue; }

      // Collect all unique topics across items
      const allTopics = [...new Set(items.flatMap(i => i.topics))].slice(0, 5);
      const validTopics = ["Refill","Reuse","Zero Waste","Retail","Policy","Organics","Packaging","Cities"];
      const filteredTopics = allTopics.filter(t => validTopics.includes(t));

      const evidenceNotionIds = items.map(i => i.id);

      // notion-cutoff-2026-06-02: replaced by canonical write to knowledge_assets (Supabase).
      // Notion → Supabase (knowledge_assets) column mapping:
      //   "Asset Name"               → title
      //   "Asset Type"               → asset_type
      //   "Status"                   → status
      //   "Summary"                  → summary
      //   block children (body)      → body_md
      //   "Evidence Used as Sources" → payload.evidence_used_notion_ids
      //   "Portal Visibility"        → payload.portal_visibility
      //   "Sensitivity Level"        → payload.sensitivity_level
      //   "Domain / Theme"           → payload.domain_theme
      // const properties: Record<string, any> = {
      //   "Asset Name":        { title: [{ text: { content: synthesis.title } }] },
      //   "Asset Type":        { select: { name: synthesis.assetType } },
      //   "Status":            { select: { name: "Draft" } },
      //   "Portal Visibility": { select: { name: "admin-only" } },
      //   "Sensitivity Level": { select: { name: "Internal Core" } },
      //   "Summary":           { rich_text: [{ text: { content: synthesis.summary } }] },
      //   "Evidence Used as Sources": { relation: evidenceRelations },
      // };
      // if (filteredTopics.length > 0) {
      //   properties["Domain / Theme"] = { multi_select: filteredTopics.map(t => ({ name: t })) };
      // }
      // await notion.pages.create({ parent: { database_id: KNOWLEDGE_DB }, properties, children: [...] });

      const bodyMd = [
        synthesis.summary,
        "",
        ...synthesis.keyPoints.map(pt => `- ${pt}`),
        "",
        `Auto-generated from ${items.length} Canonical evidence items (theme: ${theme}). Review before promoting to Active.`,
      ].join("\n");

      const sb = getSupabaseServerClient();
      const { error: insertErr } = await sb
        .from("knowledge_assets")
        .insert({
          title:      synthesis.title,
          asset_type: synthesis.assetType,
          status:     "Draft",
          summary:    synthesis.summary,
          body_md:    bodyMd,
          evidence_count:   items.length,
          last_evidence_at: new Date().toISOString(),
          payload: {
            portal_visibility:          "admin-only",
            sensitivity_level:          "Internal Core",
            domain_theme:               filteredTopics,
            evidence_used_notion_ids:   evidenceNotionIds,
            source_agent:               "evidence-to-knowledge",
            theme,
          },
        });
      if (insertErr) {
        errors.push(`${theme}: knowledge_assets insert failed — ${insertErr.message}`);
        continue;
      }

      created++;
    } catch (err) {
      errors.push(`${theme}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const cost_usd = computeAnthropicCost(usageAcc, HAIKU_MODEL);

  return NextResponse.json({
    ok: true,
    evidenceFound: evidence.length,
    themesProcessed: Object.keys(byTheme).length,
    created,
    cost_usd,
    errors,
  });
}

export const POST = withRoutineLog("evidence-to-knowledge", _POST);
export const GET  = POST;
