/**
 * GET /api/hall-contacts/suggest-match?person_id=<uuid>
 *
 * For a WhatsApp-only contact (email IS NULL) — or any person row — return
 * ranked candidates that this person is likely the same as. Used by the
 * WA-only accordion in /admin/hall/contacts to let the user confirm a merge
 * with one click.
 *
 * Reuses the shared person-resolver index so the ranking is consistent with
 * write-time matching (email exact → exact name → alias → substring →
 * token-set → first-name unique).
 *
 * The source person is excluded from the candidate list. Self rows are also
 * excluded. Candidates without an email are excluded — the whole point is
 * to merge a no-email row into a has-email row.
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildPersonIndex, resolvePerson } from "@/lib/person-resolver";

type Suggestion = {
  person_id:   string;
  full_name:   string;
  display_name: string | null;
  email:       string;
  confidence:  number;
  reason:      string;
  wa_count:    number;
  meeting_count: number;
};

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const personId = (searchParams.get("person_id") ?? "").trim();
  if (!personId) {
    return NextResponse.json({ error: "person_id required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  // 1. Load the source row so we have its name + aliases to query with.
  const { data: source, error: srcErr } = await sb
    .from("people")
    .select("id, full_name, display_name, email, aliases")
    .eq("id", personId)
    .maybeSingle();
  if (srcErr)  return NextResponse.json({ error: srcErr.message }, { status: 502 });
  if (!source) return NextResponse.json({ error: "person not found" }, { status: 404 });

  const queries = new Set<string>();
  if (source.full_name)    queries.add(source.full_name);
  if (source.display_name) queries.add(source.display_name);
  for (const a of (source.aliases ?? []) as string[]) if (a) queries.add(a);

  if (queries.size === 0) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  // 2. Build the full person index (shared with orphan-scanner / WA clipper).
  const idx = await buildPersonIndex(sb);

  // 3. Run every query form through resolver; collect candidate person_ids.
  //    Always exclude source.id (same person) and any self_person_id.
  const pickedIds = new Map<string, { confidence: number; reason: string }>();
  for (const q of queries) {
    const r = resolvePerson({ name: q }, idx);
    if (!r.person_id) continue;
    if (r.person_id === source.id) continue;
    if (idx.selfPersonIds.has(r.person_id)) continue;
    const prev = pickedIds.get(r.person_id);
    if (!prev || r.confidence > prev.confidence) {
      pickedIds.set(r.person_id, { confidence: r.confidence, reason: r.matched_by });
    }
  }

  if (pickedIds.size === 0) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  // 4. Hydrate the candidates — we need email (must be non-null) + activity
  //    counts so the UI can show "this is the person with 6 meetings and 3
  //    email threads".
  const { data: rows, error: rowsErr } = await sb
    .from("people")
    .select("id, full_name, display_name, email, meeting_count, email_thread_count, transcript_count")
    .in("id", [...pickedIds.keys()]);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 502 });

  // 5. WA message counts by full_name (cheap aggregate, small dataset).
  const waBySenderName = await getWaCountsBySenderName(sb);

  const suggestions: Suggestion[] = [];
  for (const row of (rows ?? []) as Array<{
    id: string; full_name: string | null; display_name: string | null;
    email: string | null; meeting_count: number | null;
    email_thread_count: number | null; transcript_count: number | null;
  }>) {
    if (!row.email) continue;
    const info = pickedIds.get(row.id)!;
    const waKey = (row.full_name ?? row.display_name ?? "").toLowerCase().trim();
    suggestions.push({
      person_id:     row.id,
      full_name:     row.full_name ?? row.display_name ?? row.email,
      display_name:  row.display_name,
      email:         row.email,
      confidence:    info.confidence,
      reason:        info.reason,
      wa_count:      waBySenderName.get(waKey) ?? 0,
      meeting_count: row.meeting_count ?? 0,
    });
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return NextResponse.json({
    ok:          true,
    source:      {
      id:           source.id,
      full_name:    source.full_name,
      display_name: source.display_name,
    },
    suggestions: suggestions.slice(0, 5),
  });
}

async function getWaCountsBySenderName(sb: ReturnType<typeof getSupabaseServerClient>) {
  const { data } = await sb
    .from("conversation_messages")
    .select("sender_name")
    .eq("platform", "whatsapp")
    .eq("sender_is_self", false);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { sender_name: string | null }[]) {
    const k = (r.sender_name ?? "").toLowerCase().trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
