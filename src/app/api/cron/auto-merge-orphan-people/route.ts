/**
 * GET /api/cron/auto-merge-orphan-people
 *
 * Daily Vercel cron. For every `orphan_match_candidates` row at status='pending'
 * with confidence ≥ 0.92, AUTO-MERGE the orphan WhatsApp-only `people` row
 * into the email-keyed canonical row. Lower-confidence candidates remain in
 * the queue for human review via the WA-only accordion in the portal.
 *
 * The merge logic mirrors `/api/hall-contacts/merge`:
 *   1. Re-point conversation_messages.sender_person_id from source → target
 *   2. Absorb source.full_name + source.aliases into target.aliases
 *   3. Add activity counts (meeting/email/transcript) onto target
 *   4. Move target.last_seen_at forward
 *   5. Mark candidate row resolved + write to people_merge_audit
 *   6. Soft-dismiss the source person (preserves history; doesn't delete)
 *
 * Idempotent. Bounded to 50 merges per run.
 *
 * Closes part of the "Engatel pattern" gap (`docs/migration/REJECTED_PATTERNS.md`
 * R-003). The user asked: "todo esto es pq creamos engatel manual o hay
 * algo sistemico que arreglar?" — this is one of the systemic fixes.
 *
 * Auth: Authorization: Bearer $CRON_SECRET (Vercel cron) OR
 * x-agent-key: $CRON_SECRET (manual trigger).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONFIDENCE_THRESHOLD = 0.92;
const MAX_MERGES_PER_RUN = 50;

async function _GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const agentKey = req.headers.get("x-agent-key");
  if (auth !== cronSecret && agentKey !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();
  const { data: candidates, error } = await sb
    .from("orphan_match_candidates")
    .select("id, sender_name, candidate_person_id, confidence, msg_count, candidate_reason")
    .eq("status", "pending")
    .gte("confidence", CONFIDENCE_THRESHOLD)
    .order("confidence", { ascending: false })
    .limit(MAX_MERGES_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const summary = {
    candidates_reviewed: candidates?.length ?? 0,
    merges_executed: 0,
    messages_repointed_total: 0,
    skipped: 0,
    errors: [] as string[],
  };

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, ...summary, message: "no high-confidence pending candidates" });
  }

  // Resolve each: find the orphan source person row by sender_name fuzzy
  // match, merge into candidate_person_id, mark candidate as auto_resolved.
  const nowIso = new Date().toISOString();
  for (const c of candidates) {
    try {
      // Find the WA-only orphan row that this candidate refers to.
      // The scanner records sender_name; the row has sender_name as alias
      // or full_name and email IS NULL.
      const senderName = c.sender_name as string;
      const targetId = c.candidate_person_id as string;
      const { data: orphans } = await sb
        .from("people")
        .select("id, full_name, display_name, aliases, meeting_count, email_thread_count, transcript_count, last_seen_at")
        .is("email", null)
        .is("dismissed_at", null)
        .or(`full_name.ilike.${senderName},display_name.ilike.${senderName},aliases.cs.{${senderName.replace(/[{},]/g, " ").trim()}}`)
        .limit(1);
      const source = (orphans ?? [])[0] as
        | {
            id: string;
            full_name: string | null;
            display_name: string | null;
            aliases: string[] | null;
            meeting_count: number | null;
            email_thread_count: number | null;
            transcript_count: number | null;
            last_seen_at: string | null;
          }
        | undefined;
      if (!source) {
        summary.skipped++;
        continue;
      }
      if (source.id === targetId) {
        summary.skipped++;
        continue;
      }

      // 1. Re-point conversation_messages
      const { data: movedRows, error: repointErr } = await sb
        .from("conversation_messages")
        .update({ sender_person_id: targetId })
        .eq("sender_person_id", source.id)
        .select("id");
      if (repointErr) {
        summary.errors.push(`repoint ${source.id}: ${repointErr.message}`);
        continue;
      }
      const movedCount = movedRows?.length ?? 0;

      // 2. Get target counters + aliases
      const { data: targetRow } = await sb
        .from("people")
        .select("aliases, meeting_count, email_thread_count, transcript_count, last_seen_at")
        .eq("id", targetId)
        .maybeSingle();
      const targetAliases = (targetRow?.aliases as string[] | null) ?? [];
      const sourceAliases = (source.aliases as string[] | null) ?? [];
      const absorbed = [
        source.full_name,
        source.display_name,
        ...sourceAliases,
      ].filter((s): s is string => !!s && !targetAliases.includes(s));
      const newAliases = absorbed.length > 0
        ? Array.from(new Set([...targetAliases, ...absorbed]))
        : targetAliases;

      const tgtLast = targetRow?.last_seen_at ? new Date(targetRow.last_seen_at as string) : null;
      const srcLast = source.last_seen_at ? new Date(source.last_seen_at as string) : null;
      const newLastSeen = tgtLast && srcLast ? (tgtLast > srcLast ? tgtLast : srcLast) : (tgtLast ?? srcLast);

      // 3. Update target row with absorbed activity + aliases
      const { error: updTgtErr } = await sb
        .from("people")
        .update({
          aliases: newAliases,
          meeting_count: ((targetRow?.meeting_count ?? 0) as number) + ((source.meeting_count ?? 0) as number),
          email_thread_count: ((targetRow?.email_thread_count ?? 0) as number) + ((source.email_thread_count ?? 0) as number),
          transcript_count: ((targetRow?.transcript_count ?? 0) as number) + ((source.transcript_count ?? 0) as number),
          last_seen_at: newLastSeen?.toISOString() ?? null,
          updated_at: nowIso,
        })
        .eq("id", targetId);
      if (updTgtErr) {
        summary.errors.push(`update target ${targetId}: ${updTgtErr.message}`);
        continue;
      }

      // 4. Audit: log merge
      await sb.from("people_merge_audit").insert({
        source_id: source.id,
        target_id: targetId,
        actor: "cron-auto-merge-orphan-people",
        moved_message_rows: movedCount ?? 0,
        absorbed_aliases: absorbed,
        source_snapshot: {
          full_name: source.full_name,
          display_name: source.display_name,
          aliases: source.aliases,
          confidence: c.confidence,
          reason: c.candidate_reason,
        },
        merged_at: nowIso,
      });

      // 5. Soft-dismiss source
      await sb
        .from("people")
        .update({
          dismissed_at: nowIso,
          dismissed_by: "cron-auto-merge-orphan-people",
          dismissed_reason: `auto-merged into ${targetId} (confidence ${c.confidence})`,
          updated_at: nowIso,
        })
        .eq("id", source.id);

      // 6. Mark candidate resolved
      await sb
        .from("orphan_match_candidates")
        .update({
          status: "auto_resolved",
          reviewed_by: "cron-auto-merge-orphan-people",
          reviewed_at: nowIso,
        })
        .eq("id", c.id);

      summary.merges_executed++;
      summary.messages_repointed_total += movedCount ?? 0;
    } catch (e) {
      summary.errors.push(`candidate ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}

export const GET = withRoutineLog("cron-auto-merge-orphan-people", _GET);
export const POST = GET;
