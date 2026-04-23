/**
 * POST   /api/contact-intelligence/corrections
 * DELETE /api/contact-intelligence/corrections
 *
 * Per-contact correction ledger (Capa 3). Every time the user hits
 * "This is wrong" on an AI output (summary, open loops, topics, news,
 * enrichment), an entry lands in `people.corrections` and gets injected
 * into the system prompt the next time any of those fields is regenerated.
 *
 * POST body:
 *   {
 *     person_id:        string,
 *     scope:            "summary" | "open_loops" | "topics" | "news" | "enrichment" | "general",
 *     what_is_wrong:    string,
 *     what_is_correct:  string,
 *   }
 *
 * DELETE body:
 *   {
 *     person_id:     string,
 *     correction_id: string,
 *   }
 *
 * Returns the updated corrections array so the caller can re-render without
 * a router.refresh round-trip.
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { currentUser } from "@clerk/nextjs/server";
import {
  normaliseCorrections,
  type Correction,
  type CorrectionScope,
} from "@/lib/user-identity";

export const dynamic = "force-dynamic";

const ALLOWED_SCOPES: CorrectionScope[] = ["summary", "open_loops", "topics", "news", "enrichment", "general"];

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: {
    person_id?:       string;
    scope?:           string;
    what_is_wrong?:   string;
    what_is_correct?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const person_id       = (body.person_id ?? "").trim();
  const what_is_wrong   = (body.what_is_wrong ?? "").trim();
  const what_is_correct = (body.what_is_correct ?? "").trim();
  const scope: CorrectionScope = ALLOWED_SCOPES.includes(body.scope as CorrectionScope)
    ? (body.scope as CorrectionScope) : "general";

  if (!person_id)        return NextResponse.json({ error: "person_id required" }, { status: 400 });
  if (!what_is_wrong)    return NextResponse.json({ error: "what_is_wrong required" }, { status: 400 });
  if (!what_is_correct)  return NextResponse.json({ error: "what_is_correct required" }, { status: 400 });
  if (what_is_wrong.length > 500)   return NextResponse.json({ error: "what_is_wrong too long (max 500)" }, { status: 400 });
  if (what_is_correct.length > 500) return NextResponse.json({ error: "what_is_correct too long (max 500)" }, { status: 400 });

  const sb = getSupabaseServerClient();

  // Load current corrections so we can append.
  const { data: row, error } = await sb
    .from("people")
    .select("id, corrections")
    .eq("id", person_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!row)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  const existing = normaliseCorrections((row as { corrections: unknown }).corrections);
  const who      = await currentUser().then(u => u?.primaryEmailAddress?.emailAddress ?? null).catch(() => null);

  const entry: Correction = {
    id:              crypto.randomUUID(),
    scope,
    what_is_wrong,
    what_is_correct,
    created_at:      new Date().toISOString(),
    created_by:      who,
  };

  // Cap at 40 entries per contact — keep prompts tight. Drop oldest beyond that.
  const next = [...existing, entry].slice(-40);

  const { error: upErr } = await sb.from("people").update({
    corrections: next,
    updated_at:  new Date().toISOString(),
  }).eq("id", person_id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  return NextResponse.json({ ok: true, corrections: next });
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { person_id?: string; correction_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const person_id     = (body.person_id ?? "").trim();
  const correction_id = (body.correction_id ?? "").trim();
  if (!person_id)     return NextResponse.json({ error: "person_id required" }, { status: 400 });
  if (!correction_id) return NextResponse.json({ error: "correction_id required" }, { status: 400 });

  const sb = getSupabaseServerClient();
  const { data: row, error } = await sb
    .from("people")
    .select("id, corrections")
    .eq("id", person_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!row)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  const existing = normaliseCorrections((row as { corrections: unknown }).corrections);
  const next = existing.filter(c => c.id !== correction_id);

  const { error: upErr } = await sb.from("people").update({
    corrections: next,
    updated_at:  new Date().toISOString(),
  }).eq("id", person_id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  return NextResponse.json({ ok: true, corrections: next });
}
