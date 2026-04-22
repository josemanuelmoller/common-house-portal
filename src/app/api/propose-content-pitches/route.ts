/**
 * POST /api/propose-content-pitches
 *
 * Monthly batch: reads comms strategy (pillars / audiences / channels) from
 * Supabase, gathers recent signals from Insight Briefs + Evidence, and asks
 * Anthropic to produce ~N pitches for the next 30 days. Inserts them at
 * status=proposed so JMM can review in /admin/plan/comms.
 *
 * Cadence: last Friday of each month, 09:00 UK time (Vercel cron fires on
 * Fridays and the handler self-gates to "last Friday of this month" to keep
 * the cron expression simple).
 *
 * Auth: CRON_SECRET (Authorization: Bearer) OR admin session (for manual runs).
 *
 * Scope note: V1 generator uses strategy + a lightweight context block from
 * Insight Briefs. Evidence / Fireflies enrichment is a follow-up.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";
import { withRoutineLog } from "@/lib/routine-log";
import {
  getActivePillars,
  getActiveAudiences,
  getActiveChannels,
  getRecentlyPublishedPitches,
  insertPitches,
  type NewPitch,
} from "@/lib/comms-strategy";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const notion    = new Client({ auth: process.env.NOTION_API_KEY });

const INSIGHT_BRIEFS_DB = "04bed3a3fd1a4b3a99643cd21562e08a";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLastFridayOfMonth(d: Date): boolean {
  if (d.getUTCDay() !== 5) return false; // not a Friday
  const next = new Date(d);
  next.setUTCDate(d.getUTCDate() + 7);
  return next.getUTCMonth() !== d.getUTCMonth();
}

async function recentInsightBriefsSummary(): Promise<string> {
  try {
    const res = await notion.databases.query({
      database_id: INSIGHT_BRIEFS_DB,
      page_size: 8,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = res.results.map((p: any) => {
      const props = p.properties;
      const title =
        props["Brief Title"]?.title?.[0]?.plain_text ??
        props["Name"]?.title?.[0]?.plain_text ?? "";
      const summary =
        props["Executive Summary"]?.rich_text?.[0]?.plain_text ??
        props["Summary"]?.rich_text?.[0]?.plain_text ?? "";
      if (!title) return null;
      return `- ${title}${summary ? `: ${summary.slice(0, 200)}` : ""}`;
    }).filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : "No recent briefs.";
  } catch {
    return "Insight Briefs unavailable.";
  }
}

// Spread N pitches across the next 30 weekday-biased days (Tue/Wed/Thu preferred).
function pickDates(n: number, startFrom: Date = new Date()): string[] {
  const out: string[] = [];
  let d = new Date(startFrom);
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    // Prefer Tue(2) Wed(3) Thu(4); accept Mon(1) or Fri(5) to fill quota.
    if (dow >= 1 && dow <= 5) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function uuidOrNull(id: string | undefined): string | null {
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  // Auth: cron secret OR admin session
  const authHeader = req.headers.get("authorization");
  const cronOK = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOK) {
    const guard = await adminGuardApi();
    if (guard) return guard;
  }

  const url     = new URL(req.url);
  const dryRun  = url.searchParams.get("mode") === "dry_run";
  const force   = url.searchParams.get("force") === "1";

  // Cron self-gate: only run if today is the last Friday of the month.
  // Skip if triggered by cron on a non-gate day. Manual runs bypass with force=1.
  if (cronOK && !force && !isLastFridayOfMonth(new Date())) {
    return NextResponse.json({
      ok: true,
      skipped: "not last Friday of month",
    });
  }

  const [pillars, audiences, channels, recentPublished] = await Promise.all([
    getActivePillars(),
    getActiveAudiences(),
    getActiveChannels(),
    getRecentlyPublishedPitches(60, 20), // Anti-repetition: last 60 days, 20 posts.
  ]);

  if (pillars.length === 0 || audiences.length === 0 || channels.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: "Strategy incomplete: need at least 1 pillar, audience, and channel.",
    }, { status: 400 });
  }

  const primaryChannel = channels[0];
  const cadence        = primaryChannel.monthly_cadence;
  const dates          = pickDates(cadence);
  const briefContext   = await recentInsightBriefsSummary();

  // Build the prompt. We give Anthropic the full strategy + signals and ask
  // it to produce a structured JSON array we can parse and insert.
  const pillarLines = pillars.map(p =>
    `- name="${p.name}" tier=${p.tier}${p.description ? ` — ${p.description}` : ""}`
  ).join("\n");

  const audienceLines = audiences.map(a =>
    `- name="${a.name}" priority=${a.priority}${a.description ? ` — ${a.description}` : ""}`
  ).join("\n");

  const systemPrompt = `You are the Content Pitch Agent for José Manuel Möller (JMM), co-founder of Common House (circular economy, portfolio of zero-waste startups, operating across LATAM/EU/UK).

Your job: propose ${cadence} LinkedIn pitches for the next 30 days, grounded in real signals from Common House state. A pitch is an IDEA (trigger + angle + headline), NOT a full post.

## Strategy

PILLARS (with tier — governs tone):
${pillarLines}

AUDIENCES (priority 1 = this year's focus):
${audienceLines}

CHANNEL: ${primaryChannel.name} (${primaryChannel.platform}) · ${cadence} posts/month
Voice rules: ${primaryChannel.voice_rules ?? "none specified"}

## Tier-tone rules (strict)
- core pillar → JMM can opine confidently; take a stance; cite specifics
- building → curious, learning tone; share a question, not authority
- experimental → observational only; "a pattern worth watching"; never claim expertise

## Pillar balance (target for this batch)
Approximately: core ≈ 60-70%, building ≈ 20-30%, experimental ≈ 5-10%.

## Audience rotation
Priority 1 audiences dominate; every active audience gets ≥1 pitch across the batch; no audience exceeds ~50%.

## Anti-patterns (hard rules — never violate)
- Never trash-talk competitors
- Never sound like a charlatán / hype-artist
- Never sound AI-generated or generic
- Always anchor to a real signal; never abstract thought pieces

## Recent CH / ecosystem signals
${briefContext}

## Anti-repetition — recently published or drafted (avoid overlapping angles)
${recentPublished.length === 0
  ? "(no recent posts on file)"
  : recentPublished.map(p => `- [${p.pillar_name ?? "—"}] ${p.headline ?? p.angle.slice(0, 80)}`).join("\n")}

If your proposed pitches significantly overlap with any of the above (same pillar + very similar angle), adjust or replace them. Variety within a pillar is fine; repetition is not.

## Output format (strict JSON — no markdown fence, no commentary)

Return a JSON array of exactly ${cadence} objects. Each object must have:
{
  "pillar_name": "<exact pillar name from list above>",
  "audience_name": "<exact audience name from list above>",
  "trigger": "<real signal anchoring this post, 1 line>",
  "angle": "<the sharp observation JMM would bring, 1-2 sentences, matched to tier tone>",
  "headline": "<8-12 word scannable title>"
}

Respond ONLY with the JSON array. Nothing else.`;

  let pitchesRaw = "";
  try {
    const message = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      messages:   [{ role: "user", content: systemPrompt }],
    });
    pitchesRaw = message.content[0].type === "text" ? message.content[0].text : "";
  } catch (e) {
    return NextResponse.json({ error: "Anthropic error", detail: String(e) }, { status: 500 });
  }

  // Parse JSON — tolerant of occasional fence wrapping.
  let parsed: Array<{
    pillar_name: string;
    audience_name: string;
    trigger: string;
    angle: string;
    headline: string;
  }> = [];
  try {
    const cleaned = pitchesRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return NextResponse.json({
      error: "Failed to parse model output as JSON",
      detail: String(e),
      raw: pitchesRaw.slice(0, 500),
    }, { status: 500 });
  }

  // Resolve names → ids.
  const pillarByName   = new Map(pillars.map(p => [p.name.toLowerCase(), p.id]));
  const audienceByName = new Map(audiences.map(a => [a.name.toLowerCase(), a.id]));

  const toInsert: NewPitch[] = parsed.slice(0, cadence).map((p, i) => ({
    proposed_for_date: dates[i] ?? dates[dates.length - 1],
    pillar_id:         uuidOrNull(pillarByName.get(p.pillar_name?.toLowerCase() ?? "")),
    audience_id:       uuidOrNull(audienceByName.get(p.audience_name?.toLowerCase() ?? "")),
    channel_id:        primaryChannel.id,
    trigger:           p.trigger?.slice(0, 500) ?? null,
    angle:             p.angle?.slice(0, 1000) ?? "(no angle)",
    headline:          p.headline?.slice(0, 200) ?? null,
  }));

  if (dryRun) {
    return NextResponse.json({ ok: true, mode: "dry_run", pitches: toInsert });
  }

  let written = 0;
  try {
    written = await insertPitches(toInsert);
  } catch (e) {
    return NextResponse.json({
      error: "insertPitches failed",
      detail: String(e),
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    records_written: written,
    records_read: pillars.length + audiences.length + channels.length,
    notes: `Generated ${written} pitches for ${primaryChannel.name}`,
  });
}

export const POST = withRoutineLog("propose-content-pitches", _POST);
export const GET  = POST;
