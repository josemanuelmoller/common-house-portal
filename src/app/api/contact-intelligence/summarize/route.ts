/**
 * POST /api/contact-intelligence/summarize
 *
 * Generates a 1-paragraph operating brief for a contact using Claude Haiku.
 * Reads: enrichment fields (job_title, org, LinkedIn), relationship classes,
 * recent meetings + transcripts + emails, recurring topics, open loops.
 *
 * Output: "Neil is Special Advisor at UN Women, engaged on Zero Waste
 * Foundation since April. Last talked 1d ago; promised to share the deck.
 * Warmth: Hot. Recurring themes: climate finance, urban resilience."
 *
 * Cached in people.ai_summary, refreshed when last_seen_at advances or
 * on explicit `force=true`. 14-day default cache if nothing new happens.
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildGroundingPrompt } from "@/lib/user-identity";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CACHE_DAYS = 14;

const SYSTEM_PROMPT = `You are writing a 2-3 sentence operating brief about a contact of the user. The brief appears at the top of the contact's profile page and must help the user instantly recall who this person is and what is currently in play with them.

Cover only what you can see in the provided data. If something is unknown, don't mention it. Do not invent facts.

Must include (when data allows):
- Role + organisation — one short clause
- Current engagement context — what project/topic you have in play
- Last interaction recency + warmth — "last talked 3d ago, hot"
- Most immediate hook — an open promise, an unreturned message, a recurring topic worth picking back up

Must avoid:
- Generic summaries ("a valuable contact")
- Lists or bullet points
- More than 60 words total
- Matching the user's language preference — if the context has Spanish titles or projects, respond in the user's working language (Spanish). Otherwise English.

Respond with JSON only, no prose:
{"summary": "<text>"}`;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { person_id?: string; email?: string; force?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  let q = sb.from("people").select("id, email, full_name, display_name, job_title, role_category, function_area, organization_detected, relationship_classes, last_seen_at, meeting_count, email_thread_count, transcript_count, recurring_topics, open_loops, ai_summary, ai_summary_updated_at, notes");
  if (body.person_id)  q = q.eq("id", body.person_id);
  else if (body.email) q = q.eq("email", body.email.trim().toLowerCase());
  else return NextResponse.json({ error: "person_id or email required" }, { status: 400 });

  const { data: row, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!row)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  type P = {
    id: string; email: string | null;
    full_name: string | null; display_name: string | null;
    job_title: string | null; role_category: string | null; function_area: string | null;
    organization_detected: string | null;
    relationship_classes: string[] | null;
    last_seen_at: string | null;
    meeting_count: number | null; email_thread_count: number | null; transcript_count: number | null;
    recurring_topics: string[] | null;
    open_loops: Array<{ direction: string; text: string }> | null;
    ai_summary: string | null; ai_summary_updated_at: string | null;
    notes: string | null;
  };
  const p = row as unknown as P;

  // Cache check — serve cached unless forced or stale.
  if (!body.force && p.ai_summary && p.ai_summary_updated_at) {
    const cachedAt = new Date(p.ai_summary_updated_at).getTime();
    const cutoff   = Date.now() - CACHE_DAYS * 86400_000;
    const noNewActivity = p.last_seen_at ? new Date(p.last_seen_at).getTime() <= cachedAt : true;
    if (cachedAt >= cutoff && noNewActivity) {
      return NextResponse.json({ ok: true, cached: true, summary: p.ai_summary });
    }
  }

  // Gather material. Keep it tight — titles + one-liners, not bodies.
  const name = p.full_name ?? p.display_name ?? p.email ?? "this contact";
  const daysSinceLastSeen = p.last_seen_at
    ? Math.floor((Date.now() - new Date(p.last_seen_at).getTime()) / 86400_000)
    : null;
  const warmth = daysSinceLastSeen == null ? "unknown"
               : daysSinceLastSeen < 7  ? "hot"
               : daysSinceLastSeen < 30 ? "warm"
               : daysSinceLastSeen < 90 ? "cooling"
               :                          "cold";

  const material: string[] = [];
  if (p.job_title)               material.push(`Title: ${p.job_title}`);
  if (p.organization_detected)   material.push(`Org: ${p.organization_detected}`);
  if (p.role_category)           material.push(`Tier: ${p.role_category}`);
  if (p.function_area)           material.push(`Area: ${p.function_area}`);
  if (p.relationship_classes?.length) material.push(`Classes: ${p.relationship_classes.join(", ")}`);
  material.push(`Warmth: ${warmth} (last seen ${daysSinceLastSeen ?? "unknown"}d ago)`);
  material.push(`Activity: ${p.meeting_count ?? 0} meetings · ${p.email_thread_count ?? 0} emails · ${p.transcript_count ?? 0} transcripts`);
  if (p.recurring_topics?.length) material.push(`Topics: ${p.recurring_topics.join(", ")}`);
  if (p.open_loops?.length) {
    const loops = p.open_loops.slice(0, 3).map(l => `${l.direction}: ${l.text}`);
    material.push(`Open loops: ${loops.join(" | ")}`);
  }
  if (p.notes) material.push(`Notes: ${p.notes.slice(0, 300)}`);

  // Recent meeting titles for additional context
  if (p.email) {
    const { data: meetings } = await sb
      .from("hall_calendar_events")
      .select("event_title, event_start")
      .contains("attendee_emails", [p.email])
      .eq("is_cancelled", false)
      .order("event_start", { ascending: false })
      .limit(5);
    const titles = (meetings ?? []).map(m => (m as { event_title: string }).event_title).filter(Boolean);
    if (titles.length > 0) material.push(`Recent meetings: ${titles.join(" | ")}`);
  }

  const userPrompt = `Contact: ${name}\n\nData:\n${material.map(m => `- ${m}`).join("\n")}\n\nReturn the operating brief as JSON.`;

  const grounding  = await buildGroundingPrompt(p.id, ["summary"]);
  const fullSystem = grounding ? `${grounding}\n\n---\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;

  let summary: string;
  try {
    const resp = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 400,
      temperature: 0,
      system:     fullSystem,
      messages:   [{ role: "user", content: userPrompt }],
    });
    const block = resp.content[0];
    const text  = block?.type === "text" ? block.text : "";
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const firstBrace = cleaned.indexOf("{");
    const lastBrace  = cleaned.lastIndexOf("}");
    if (firstBrace === -1) throw new Error("no JSON object");
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    summary = (typeof parsed.summary === "string" && parsed.summary.trim()) ? parsed.summary.trim() : "";
    if (!summary) throw new Error("empty summary");
  } catch (e) {
    return NextResponse.json({
      ok: false, error: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }

  await sb.from("people").update({
    ai_summary:            summary,
    ai_summary_updated_at: new Date().toISOString(),
    updated_at:            new Date().toISOString(),
  }).eq("id", p.id);

  return NextResponse.json({ ok: true, cached: false, summary });
}
