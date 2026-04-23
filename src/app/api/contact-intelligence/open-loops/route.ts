/**
 * POST /api/contact-intelligence/open-loops
 *
 * Extracts open commitments/promises from a contact's recent conversations
 * (transcripts + WA clips + email subjects). Claude Haiku parses natural
 * language for "I'll send you X", "Let me know about Y", "Can you share Z?"
 * patterns and classifies each as:
 *   - promised_by_you      → you owe them something
 *   - awaiting_from_them   → they owe you something
 *
 * Cached in people.open_loops (JSON array). Re-derived when last_seen_at
 * advances or when force=true.
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
const MAX_LOOPS  = 8;

export type OpenLoop = {
  direction: "promised_by_you" | "awaiting_from_them";
  text:      string;                 // ≤14 words, verbatim-style
  source:    "transcript" | "whatsapp" | "email" | "meeting";
  source_ref: string | null;         // source_id or meeting title for traceability
  ts:        string | null;          // when the promise was made
  resolved:  boolean;                // reserved for future — always false on generation
};

const SYSTEM_PROMPT = `You extract OPEN COMMITMENTS from a user's recent conversations with a single contact.

Two kinds of commitments:
- promised_by_you      → the USER promised to do something for the CONTACT and hasn't confirmed it done
- awaiting_from_them   → the CONTACT promised to do something for the USER and hasn't delivered

Rules:
- Only include commitments that are still plausibly open (from the last 6 weeks).
- Prefer concrete promises ("send the deck", "schedule the call") over vague intent ("we should talk more").
- Ignore casual social promises ("let's grab a coffee" without a time).
- Ignore commitments that the latest message clearly confirmed as resolved.
- Max 8 items total across both directions.
- Each text ≤14 words, in the same language as the source.

Respond ONLY with compact JSON:
{"loops": [
  {"direction": "promised_by_you", "text": "Send deck after Zero Waste meeting", "source": "meeting", "source_ref": "Zero Waste Team 24 Apr", "ts": "2026-04-24T..."},
  ...
]}`;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { person_id?: string; email?: string; force?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  let q = sb.from("people").select("id, email, full_name, display_name, last_seen_at, open_loops, open_loops_updated_at");
  if (body.person_id)  q = q.eq("id", body.person_id);
  else if (body.email) q = q.eq("email", body.email.trim().toLowerCase());
  else return NextResponse.json({ error: "person_id or email required" }, { status: 400 });

  const { data: row, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!row)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  type P = {
    id: string; email: string | null;
    full_name: string | null; display_name: string | null;
    last_seen_at: string | null;
    open_loops: OpenLoop[] | null;
    open_loops_updated_at: string | null;
  };
  const p = row as unknown as P;

  // Cache check
  if (!body.force && p.open_loops && p.open_loops_updated_at) {
    const cachedAt = new Date(p.open_loops_updated_at).getTime();
    const cutoff   = Date.now() - CACHE_DAYS * 86400_000;
    const noNewActivity = p.last_seen_at ? new Date(p.last_seen_at).getTime() <= cachedAt : true;
    if (cachedAt >= cutoff && noNewActivity) {
      return NextResponse.json({ ok: true, cached: true, loops: p.open_loops });
    }
  }

  // Gather recent conversation material (last 6 weeks).
  const cutoffSix = new Date(Date.now() - 42 * 86400_000).toISOString();
  const items: string[] = [];

  if (p.email) {
    // Meetings the contact attended — titles only (no body content in our schema)
    const { data: meetings } = await sb
      .from("hall_calendar_events")
      .select("event_title, event_start")
      .contains("attendee_emails", [p.email])
      .eq("is_cancelled", false)
      .gte("event_start", cutoffSix)
      .order("event_start", { ascending: false })
      .limit(12);
    for (const m of ((meetings ?? []) as { event_title: string | null; event_start: string | null }[])) {
      if (m.event_title) items.push(`Meeting (${m.event_start}): ${m.event_title}`);
    }

    // Transcripts where the contact was a participant
    const { data: tx } = await sb
      .from("hall_transcript_observations")
      .select("title, meeting_at")
      .contains("participant_emails", [p.email])
      .gte("meeting_at", cutoffSix)
      .order("meeting_at", { ascending: false })
      .limit(8);
    for (const t of ((tx ?? []) as { title: string | null; meeting_at: string | null }[])) {
      if (t.title) items.push(`Transcript (${t.meeting_at}): ${t.title}`);
    }
  }

  // WhatsApp messages linked to this person — last 30 for context
  const { data: wa } = await sb
    .from("conversation_messages")
    .select("ts, sender_name, text, sender_is_self")
    .eq("sender_person_id", p.id)
    .eq("platform", "whatsapp")
    .gte("ts", cutoffSix)
    .order("ts", { ascending: false })
    .limit(30);
  for (const m of ((wa ?? []) as { ts: string; sender_name: string | null; text: string | null; sender_is_self: boolean }[])) {
    const who = m.sender_is_self ? "YOU" : (m.sender_name ?? "them");
    const text = (m.text ?? "").slice(0, 200);
    if (text) items.push(`WhatsApp (${m.ts}) ${who}: ${text}`);
  }

  // Also pull user's own WA messages in conversations that include this contact
  // — critical for catching commitments the user made to them.
  if (wa && wa.length > 0) {
    const { data: selfWa } = await sb
      .from("conversation_messages")
      .select("source_id, ts, sender_name, text, sender_is_self")
      .eq("platform", "whatsapp")
      .eq("sender_is_self", true)
      .in("source_id", [...new Set(wa.map(m => (m as unknown as { source_id: string }).source_id))].filter(Boolean) as string[])
      .gte("ts", cutoffSix)
      .order("ts", { ascending: false })
      .limit(20);
    for (const m of ((selfWa ?? []) as { ts: string; text: string | null }[])) {
      const text = (m.text ?? "").slice(0, 200);
      if (text) items.push(`WhatsApp (${m.ts}) YOU: ${text}`);
    }
  }

  if (items.length < 2) {
    // Too little to infer anything
    await sb.from("people").update({
      open_loops:            [],
      open_loops_updated_at: new Date().toISOString(),
      updated_at:            new Date().toISOString(),
    }).eq("id", p.id);
    return NextResponse.json({ ok: true, loops: [], note: "insufficient material" });
  }

  const name = p.full_name ?? p.display_name ?? p.email ?? "the contact";
  const userPrompt = `Contact: ${name}\n\nRecent conversation material (last 6 weeks):\n${items.slice(0, 60).join("\n\n")}\n\nReturn open loops as JSON.`;

  const grounding  = await buildGroundingPrompt(p.id, ["open_loops"]);
  const fullSystem = grounding ? `${grounding}\n\n---\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;

  let loops: OpenLoop[] = [];
  try {
    const resp = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 800,
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
    if (Array.isArray(parsed.loops)) {
      loops = (parsed.loops as Array<Record<string, unknown>>)
        .map(l => ({
          direction:  (l.direction === "promised_by_you" ? "promised_by_you" : "awaiting_from_them") as OpenLoop["direction"],
          text:       String(l.text ?? "").trim(),
          source:     (["transcript", "whatsapp", "email", "meeting"].includes(l.source as string) ? l.source : "meeting") as OpenLoop["source"],
          source_ref: l.source_ref ? String(l.source_ref) : null,
          ts:         l.ts ? String(l.ts) : null,
          resolved:   false,
        }))
        .filter(l => l.text.length > 0)
        .slice(0, MAX_LOOPS);
    }
  } catch (e) {
    return NextResponse.json({
      ok: false, error: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }

  await sb.from("people").update({
    open_loops:            loops,
    open_loops_updated_at: new Date().toISOString(),
    updated_at:            new Date().toISOString(),
  }).eq("id", p.id);

  return NextResponse.json({ ok: true, cached: false, loops, material_count: items.length });
}
