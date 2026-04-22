/**
 * POST /api/hall-contacts/merge
 *
 * Merge one `people` row into another. Used by the WA-only accordion when the
 * user confirms "this contact is actually the same person as X".
 *
 * Body: { source_id: string, target_id: string }
 *
 * What happens:
 *   1. Every conversation_messages row pointing to `source_id` is re-pointed
 *      to `target_id` (so counts/WA msgs move with the identity).
 *   2. `target.aliases` absorbs `source.full_name`, `source.display_name`,
 *      and any of `source.aliases` that aren't already present. This is the
 *      "remember forever" mechanism — next time person-resolver sees that
 *      sender_name on a fresh clip, it will match directly to the target.
 *   3. Activity counts (meeting_count, email_thread_count, transcript_count)
 *      are added onto the target.
 *   4. `last_seen_at` on the target is moved forward to the later of the two.
 *   5. `source` is deleted.
 *
 * Idempotent. If source already merged (deleted) → 404.
 * If source == target → 400.
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

  let body: { source_id?: string; target_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sourceId = (body.source_id ?? "").trim();
  const targetId = (body.target_id ?? "").trim();
  if (!sourceId || !targetId) {
    return NextResponse.json({ error: "source_id and target_id required" }, { status: 400 });
  }
  if (sourceId === targetId) {
    return NextResponse.json({ error: "source_id and target_id must differ" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  // 1. Load both rows.
  const { data: rows, error: loadErr } = await sb
    .from("people")
    .select("id, email, full_name, display_name, aliases, meeting_count, email_thread_count, transcript_count, last_seen_at")
    .in("id", [sourceId, targetId]);
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 502 });
  const source = (rows ?? []).find(r => r.id === sourceId);
  const target = (rows ?? []).find(r => r.id === targetId);
  if (!source) return NextResponse.json({ error: "source not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "target not found" }, { status: 404 });

  // 2. Build the new aliases array for target. Normalise so we don't add the
  //    target's own name as an alias of itself.
  const existingAliases = new Set<string>((target.aliases ?? []).map((a: string) => a.trim().toLowerCase()));
  const extra: string[] = [];
  const add = (s: string | null | undefined) => {
    if (!s) return;
    const trimmed = s.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed) return;
    if (key === (target.full_name ?? "").toLowerCase().trim()) return;
    if (key === (target.display_name ?? "").toLowerCase().trim()) return;
    if (existingAliases.has(key)) return;
    existingAliases.add(key);
    extra.push(trimmed);
  };
  add(source.full_name);
  add(source.display_name);
  for (const a of (source.aliases ?? []) as string[]) add(a);

  const newAliases = [...(target.aliases ?? []), ...extra];

  // 3. Re-point conversation_messages. Done before the update so we can undo
  //    by keeping source around if this step fails.
  const { error: msgErr, count: msgCount } = await sb
    .from("conversation_messages")
    .update({ sender_person_id: targetId }, { count: "exact" })
    .eq("sender_person_id", sourceId);
  if (msgErr) return NextResponse.json({ error: `conversation_messages move failed: ${msgErr.message}` }, { status: 502 });

  // 4. Update the target row (aliases + counts + last_seen_at).
  const nowLastSeen = latestIso(source.last_seen_at ?? null, target.last_seen_at ?? null);
  const { error: updErr } = await sb
    .from("people")
    .update({
      aliases:            newAliases,
      meeting_count:      (target.meeting_count      ?? 0) + (source.meeting_count      ?? 0),
      email_thread_count: (target.email_thread_count ?? 0) + (source.email_thread_count ?? 0),
      transcript_count:   (target.transcript_count   ?? 0) + (source.transcript_count   ?? 0),
      last_seen_at:       nowLastSeen,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", targetId);
  if (updErr) return NextResponse.json({ error: `target update failed: ${updErr.message}` }, { status: 502 });

  // 5. Delete the source row.
  const { error: delErr } = await sb.from("people").delete().eq("id", sourceId);
  if (delErr) return NextResponse.json({ error: `source delete failed: ${delErr.message}` }, { status: 502 });

  // 6. Audit log (best-effort — never fail the merge if logging fails).
  try {
    await sb.from("people_merge_audit").insert({
      source_id:        sourceId,
      target_id:        targetId,
      actor,
      moved_message_rows: msgCount ?? 0,
      absorbed_aliases: extra,
      source_snapshot:  source,
      merged_at:        new Date().toISOString(),
    });
  } catch { /* audit table may not exist yet — swallow */ }

  return NextResponse.json({
    ok:                  true,
    target_id:           targetId,
    absorbed_aliases:    extra,
    moved_message_rows:  msgCount ?? 0,
  });
}

function latestIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
