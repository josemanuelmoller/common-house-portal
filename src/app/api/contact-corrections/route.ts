/**
 * POST   /api/contact-corrections
 *   body: { person_id, what_was_wrong, correct_info, applies_to: string[] }
 *   Appends a correction to people.corrections (creates array if null).
 *   Each entry gets a UUID id + timestamp + actor.
 *
 * DELETE /api/contact-corrections
 *   body: { person_id, correction_id }
 *   Removes a single correction from the array.
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ContactCorrection } from "@/lib/user-context";

export const dynamic = "force-dynamic";

const VALID_CONTEXTS = ["summary", "open_loops", "news", "enrichment", "any"] as const;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

  let body: {
    person_id?:      string;
    what_was_wrong?: string;
    correct_info?:   string;
    applies_to?:     string[];
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const personId = (body.person_id ?? "").trim();
  const wrong    = (body.what_was_wrong ?? "").trim();
  const correct  = (body.correct_info ?? "").trim();
  if (!personId || !wrong || !correct) {
    return NextResponse.json({ error: "person_id, what_was_wrong and correct_info required" }, { status: 400 });
  }

  const appliesTo = (body.applies_to ?? ["any"])
    .map(s => s.trim())
    .filter(s => (VALID_CONTEXTS as readonly string[]).includes(s));
  const final = (appliesTo.length > 0 ? appliesTo : ["any"]) as ContactCorrection["applies_to"];

  const sb = getSupabaseServerClient();
  const { data: existing } = await sb
    .from("people")
    .select("corrections")
    .eq("id", personId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "person not found" }, { status: 404 });

  const current = (existing.corrections as ContactCorrection[] | null) ?? [];
  const entry: ContactCorrection = {
    id:             randomUUID(),
    what_was_wrong: wrong,
    correct_info:   correct,
    applies_to:     final,
    created_at:     new Date().toISOString(),
    actor,
  };
  const next = [...current, entry];

  const { error } = await sb
    .from("people")
    .update({ corrections: next, updated_at: new Date().toISOString() })
    .eq("id", personId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, correction: entry, total: next.length });
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { person_id?: string; correction_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const personId     = (body.person_id ?? "").trim();
  const correctionId = (body.correction_id ?? "").trim();
  if (!personId || !correctionId) {
    return NextResponse.json({ error: "person_id and correction_id required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const { data: existing } = await sb
    .from("people")
    .select("corrections")
    .eq("id", personId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "person not found" }, { status: 404 });

  const current = (existing.corrections as ContactCorrection[] | null) ?? [];
  const next    = current.filter(c => c.id !== correctionId);
  const { error } = await sb
    .from("people")
    .update({ corrections: next, updated_at: new Date().toISOString() })
    .eq("id", personId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, remaining: next.length });
}
