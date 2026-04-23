/**
 * POST /api/contact-topics/synthesize
 *
 * Synthesizes recurring topics from a contact's recent interactions (meeting
 * titles, transcript summaries, email subjects, WA clip summaries) using
 * Claude Haiku. Caches the result in people.recurring_topics so the profile
 * page can render instantly on subsequent loads.
 *
 * Body: { person_id?: string, email?: string, force?: boolean }
 *
 * Without `force`, cache is considered fresh if updated within the last 14
 * days AND no new touches since. With `force=true`, always regenerates.
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
const MAX_TOPICS = 6;

const SYSTEM_PROMPT = `You read a short list of meeting titles, transcript headlines, and email subjects from conversations a user has had with a specific contact. Your job: output a compact list of 3-6 recurring TOPICS that characterise their ongoing conversation.

Rules:
- Topics should be specific enough to be useful ("Zero Waste Foundation programme", "Circular packaging standards") rather than generic ("meetings", "work").
- 2-4 words per topic. No sentences.
- If the data is too thin (<3 meaningful items), return fewer topics or an empty list.
- Use the contact's working language(s). Mix only if the source mixes.
- Do NOT invent topics that aren't supported by the items.

Respond ONLY with compact JSON:
{"topics": ["topic 1", "topic 2", ...]}`;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { person_id?: string; email?: string; force?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  let q = sb.from("people").select("id, email, display_name, full_name, recurring_topics, recurring_topics_updated_at, last_seen_at");
  if (body.person_id)  q = q.eq("id", body.person_id);
  else if (body.email) q = q.eq("email", body.email.trim().toLowerCase());
  else return NextResponse.json({ error: "person_id or email required" }, { status: 400 });

  const { data: row, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!row)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  type P = {
    id: string; email: string | null;
    display_name: string | null; full_name: string | null;
    recurring_topics: string[] | null;
    recurring_topics_updated_at: string | null;
    last_seen_at: string | null;
  };
  const p = row as unknown as P;

  // Cache check — serve cached if fresh and no activity since
  if (!body.force && p.recurring_topics && p.recurring_topics_updated_at) {
    const cachedAt = new Date(p.recurring_topics_updated_at).getTime();
    const cutoff   = Date.now() - CACHE_DAYS * 86400_000;
    const noNewActivity = p.last_seen_at ? new Date(p.last_seen_at).getTime() <= cachedAt : true;
    if (cachedAt >= cutoff && noNewActivity) {
      return NextResponse.json({ ok: true, cached: true, topics: p.recurring_topics });
    }
  }

  // Gather input material — titles only, no full bodies (cheap + safe)
  if (!p.email) return NextResponse.json({ ok: true, topics: [], note: "no email to pull conversation material" });

  const [calRes, txRes] = await Promise.all([
    sb.from("hall_calendar_events")
      .select("event_title, event_start")
      .contains("attendee_emails", [p.email])
      .eq("is_cancelled", false)
      .order("event_start", { ascending: false })
      .limit(30),
    sb.from("hall_transcript_observations")
      .select("title, meeting_at")
      .contains("participant_emails", [p.email])
      .order("meeting_at", { ascending: false })
      .limit(15),
  ]);

  const items: string[] = [];
  for (const r of ((calRes.data ?? []) as { event_title: string | null }[])) {
    if (r.event_title) items.push(`Meeting: ${r.event_title}`);
  }
  for (const r of ((txRes.data ?? []) as { title: string | null }[])) {
    if (r.title) items.push(`Transcript: ${r.title}`);
  }

  if (items.length < 3) {
    await sb.from("people").update({
      recurring_topics: [],
      recurring_topics_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", p.id);
    return NextResponse.json({ ok: true, topics: [], note: "too little signal" });
  }

  const dedup = [...new Set(items)].slice(0, 40);
  const userPrompt = `Contact: ${p.display_name ?? p.full_name ?? p.email}\n\nRecent touches:\n${dedup.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nReturn the recurring topics as JSON.`;

  const grounding  = await buildGroundingPrompt(p.id, ["topics"]);
  const fullSystem = grounding ? `${grounding}\n\n---\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;

  let topics: string[] = [];
  try {
    const resp = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 256,
      temperature: 0,
      system:     fullSystem,
      messages:   [{ role: "user", content: userPrompt }],
    });
    const block = resp.content[0];
    const text  = block?.type === "text" ? block.text : "";
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const firstBrace = cleaned.indexOf("{");
    const lastBrace  = cleaned.lastIndexOf("}");
    if (firstBrace === -1) throw new Error("no JSON");
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    if (Array.isArray(parsed.topics)) {
      topics = parsed.topics
        .filter((t: unknown): t is string => typeof t === "string")
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0)
        .slice(0, MAX_TOPICS);
    }
  } catch (e) {
    return NextResponse.json({
      ok:     false,
      error:  e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }

  await sb.from("people").update({
    recurring_topics: topics,
    recurring_topics_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", p.id);

  return NextResponse.json({ ok: true, cached: false, topics, material_count: dedup.length });
}
