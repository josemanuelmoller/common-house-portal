/**
 * Orphan-match scanner — finds conversation_messages rows with
 * sender_person_id null that NOW resolve to a people row (via
 * person-resolver) and files pending orphan_match_candidates.
 *
 * Called from:
 *   - POST /api/resolve-orphans (admin-triggered)
 *   - server action approveOrphanCandidate/rescan (admin UI)
 *   - future cron (nightly sweep)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPersonIndex, resolvePerson } from "./person-resolver";

export type ScanResult = {
  ok:                    boolean;
  scanned_groups:        number;
  total_orphan_messages: number;
  candidates_filed:      number;
  self_groups:           number;
  no_match_groups:       number;
  by_reason:             Record<string, number>;
  error?:                string;
};

export async function scanOrphans(sb: SupabaseClient): Promise<ScanResult> {
  // PostgREST caps single-page reads at 1000 rows by default. Paginate so the
  // scanner sees every orphan, not just the first page. Without this, any
  // sender_name whose messages are beyond row 1000 of the orphan list (e.g.
  // Cristóbal Correa's 169 messages) never get considered.
  type OrphanRow = { source_id: string; sender_name: string };
  const PAGE = 1000;
  let offset = 0;
  let totalRead = 0;
  const groups = new Map<string, { source_id: string; sender_name: string; count: number }>();

  while (true) {
    const { data: page, error: orphErr } = await sb
      .from("conversation_messages")
      .select("source_id, sender_name")
      .is("sender_person_id", null)
      .eq("sender_is_self", false)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (orphErr) {
      return {
        ok: false, error: orphErr.message,
        scanned_groups: groups.size, total_orphan_messages: totalRead, candidates_filed: 0,
        self_groups: 0, no_match_groups: 0, by_reason: {},
      };
    }
    const rows = (page ?? []) as OrphanRow[];
    if (rows.length === 0) break;
    totalRead += rows.length;

    for (const r of rows) {
      const name = (r.sender_name ?? "").trim();
      if (!name) continue;
      const key = `${r.source_id}::${name.toLowerCase()}`;
      const prev = groups.get(key);
      if (!prev) groups.set(key, { source_id: r.source_id, sender_name: name, count: 1 });
      else prev.count++;
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
    // Safety cap — shouldn't ever hit in practice, but prevents runaway loops.
    if (offset >= 200_000) break;
  }

  const idx = await buildPersonIndex(sb);

  const candidates: Array<Record<string, unknown>> = [];
  const byReason: Record<string, number> = {};
  let selfCount = 0;
  let noMatchCount = 0;
  for (const g of groups.values()) {
    const match = resolvePerson({ name: g.sender_name }, idx);
    if (match.is_self) { selfCount++; continue; }
    if (!match.person_id) { noMatchCount++; continue; }
    byReason[match.matched_by] = (byReason[match.matched_by] ?? 0) + 1;
    candidates.push({
      source_id:           g.source_id,
      sender_name:         g.sender_name.toLowerCase(),
      candidate_person_id: match.person_id,
      candidate_reason:    match.matched_by,
      confidence:          match.confidence,
      msg_count:           g.count,
      status:              "pending",
    });
  }

  let filed = 0;
  if (candidates.length) {
    const { error: upsertErr } = await sb
      .from("orphan_match_candidates")
      .upsert(candidates, {
        onConflict: "source_id,candidate_person_id,sender_name",
        ignoreDuplicates: true,
      });
    if (upsertErr) {
      return {
        ok: false, error: upsertErr.message,
        scanned_groups: groups.size,
        total_orphan_messages: totalRead,
        candidates_filed: 0,
        self_groups: selfCount, no_match_groups: noMatchCount, by_reason: byReason,
      };
    }
    filed = candidates.length;
  }

  return {
    ok: true,
    scanned_groups:        groups.size,
    total_orphan_messages: totalRead,
    candidates_filed:      filed,
    self_groups:           selfCount,
    no_match_groups:       noMatchCount,
    by_reason:             byReason,
  };
}
