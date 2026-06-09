/**
 * GET/POST /api/cron/refresh-org-topics
 *
 * Daily refresh of `org_recent_topics` — the materialized "what's being
 * discussed with this org" used by the Hall Pipeline State block.
 *
 * Scope:
 *   - Orgs that surfaced in hall_attention_log in the last 7 days, OR
 *   - Orgs whose latest evidence row is newer than the last refresh.
 *
 * One LLM call per org. Cheap and predictable.
 *
 * Auth: CRON_SECRET via `x-agent-key` or `Authorization: Bearer`.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MS_DAY = 86_400_000;
const MAX_ORGS_PER_RUN = 80;
const MAX_EVIDENCE_PER_ORG = 30;

function authCheck(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const agentKey = req.headers.get("x-agent-key");
  if (agentKey === expected) return true;
  const authz = req.headers.get("authorization");
  if (authz === `Bearer ${expected}`) return true;
  return false;
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest)  { return handle(req); }

async function handle(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();
  const since7d = new Date(Date.now() - 7 * MS_DAY).toISOString();

  // 1. Orgs that surfaced recently in the attention log
  const { data: recent } = await sb
    .from("hall_attention_log")
    .select("entity_type, entity_id, surfaced_at")
    .eq("entity_type", "organization")
    .gte("surfaced_at", since7d);

  const orgIdsFromLog = new Set<string>();
  for (const r of (recent ?? []) as Array<{ entity_type: string; entity_id: string }>) {
    orgIdsFromLog.add(r.entity_id);
  }

  // Also include opportunities' orgs that surfaced recently
  const { data: recentOpps } = await sb
    .from("hall_attention_log")
    .select("entity_id")
    .eq("entity_type", "opportunity")
    .gte("surfaced_at", since7d);
  if ((recentOpps?.length ?? 0) > 0) {
    const oppIds = (recentOpps as Array<{ entity_id: string }>).map(r => r.entity_id);
    const { data: oppsForOrg } = await sb
      .from("opportunities")
      .select("notion_id, org_notion_id")
      .in("notion_id", oppIds);
    for (const o of (oppsForOrg ?? []) as Array<{ org_notion_id: string | null }>) {
      if (o.org_notion_id) orgIdsFromLog.add(o.org_notion_id);
    }
  }

  // 2. Orgs whose latest evidence is newer than last refresh
  const { data: cached } = await sb
    .from("org_recent_topics")
    .select("org_notion_id, evidence_through");
  const cachedByOrg = new Map<string, string | null>();
  for (const c of (cached ?? []) as Array<{ org_notion_id: string; evidence_through: string | null }>) {
    cachedByOrg.set(c.org_notion_id, c.evidence_through);
  }

  // For every org in scope, find the latest evidence date
  const orgIdsToRefresh: string[] = [];
  for (const orgId of orgIdsFromLog) {
    const { data: latest } = await sb
      .from("evidence")
      .select("created_at")
      .eq("org_notion_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const evidenceThrough = cachedByOrg.get(orgId);
    if (!latest) {
      // No evidence — skip (we still upsert empty topics so we don't keep retrying)
      if (!cachedByOrg.has(orgId)) {
        await sb.from("org_recent_topics").upsert({
          org_notion_id: orgId,
          topics: [],
          evidence_through: null,
          refreshed_at: new Date().toISOString(),
        }, { onConflict: "org_notion_id" });
      }
      continue;
    }
    if (!evidenceThrough || new Date(latest.created_at) > new Date(evidenceThrough)) {
      orgIdsToRefresh.push(orgId);
    }
    if (orgIdsToRefresh.length >= MAX_ORGS_PER_RUN) break;
  }

  if (orgIdsToRefresh.length === 0) {
    return NextResponse.json({ ok: true, orgs_scanned: orgIdsFromLog.size, refreshed: 0 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: Array<{ org_notion_id: string; topic_count: number; ok: boolean; error?: string }> = [];

  for (const orgId of orgIdsToRefresh) {
    const { data: evidenceRows } = await sb
      .from("evidence")
      .select("evidence_statement, topics, evidence_type, created_at, date_captured")
      .eq("org_notion_id", orgId)
      .order("created_at", { ascending: false })
      .limit(MAX_EVIDENCE_PER_ORG);
    const rows = (evidenceRows ?? []) as Array<{
      evidence_statement: string | null;
      topics: string | null;
      evidence_type: string | null;
      created_at: string;
      date_captured: string | null;
    }>;
    if (rows.length === 0) {
      await sb.from("org_recent_topics").upsert({
        org_notion_id: orgId,
        topics: [],
        evidence_through: new Date().toISOString(),
        refreshed_at: new Date().toISOString(),
      }, { onConflict: "org_notion_id" });
      results.push({ org_notion_id: orgId, topic_count: 0, ok: true });
      continue;
    }

    // Build prompt
    const facts = rows
      .map(r => `- ${r.evidence_type ?? "Note"}: ${(r.evidence_statement ?? "").slice(0, 240)}${r.topics ? ` [topics: ${r.topics}]` : ""}`)
      .join("\n");

    const prompt = `Reading the recent conversational evidence with one organization, extract the top 3 concrete TOPICS being discussed. Each topic is a short noun phrase (2-6 words) that names what they talk about (e.g. "pricing v2 with freight", "retail expansion to Bogotá", "volume tiers"). NOT generic ("business", "the project"). NOT a person's name.

Evidence (most recent first):
${facts}

Output JSON only: {"topics":[{"label":"..."},{"label":"..."},{"label":"..."}]}. Maximum 3 items. If there is less than 2 topics, return fewer. No prose.`;

    let parsed: { topics: Array<{ label: string }> } = { topics: [] };
    try {
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      });
      const text = message.content[0].type === "text" ? message.content[0].text : "";
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch (e) {
      // Log full error server-side, surface a sanitised label to the
      // caller. err.message from JSON.parse on LLM output can include
      // payload fragments — not for cron-secret consumers.
      console.error("[/api/cron/refresh-org-topics] parse failed for org", orgId, e);
      results.push({ org_notion_id: orgId, topic_count: 0, ok: false, error: "parse_failed" });
      continue;
    }

    const topics = (parsed.topics ?? [])
      .map(t => ({ label: typeof t.label === "string" ? t.label.trim() : "" }))
      .filter(t => t.label.length > 0 && t.label.length < 80)
      .slice(0, 3);

    const evidenceThrough = rows[0].created_at;

    const { error } = await sb.from("org_recent_topics").upsert({
      org_notion_id: orgId,
      topics,
      evidence_through: evidenceThrough,
      refreshed_at: new Date().toISOString(),
    }, { onConflict: "org_notion_id" });

    results.push({
      org_notion_id: orgId,
      topic_count: topics.length,
      ok: !error,
      error: error?.message,
    });
  }

  return NextResponse.json({
    ok: true,
    orgs_scanned: orgIdsFromLog.size,
    refreshed: results.length,
    success: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results: results.slice(0, 20),
  });
}
