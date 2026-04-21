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
  const { data: orphans, error: orphErr } = await sb
    .from("conversation_messages")
    .select("source_id, sender_name")
    .is("sender_person_id", null)
    .eq("sender_is_self", false)
    .limit(20000);

  if (orphErr) {
    return {
      ok: false, error: orphErr.message,
      scanned_groups: 0, total_orphan_messages: 0, candidates_filed: 0,
      self_groups: 0, no_match_groups: 0, by_reason: {},
    };
  }

  type OrphanRow = { source_id: string; sender_name: string };
  const groups = new Map<string, { source_id: string; sender_name: string; count: number }>();
  for (const r of (orphans ?? []) as OrphanRow[]) {
    const name = (r.sender_name ?? "").trim();
    if (!name) continue;
    const key = `${r.source_id}::${name.toLowerCase()}`;
    const prev = groups.get(key);
    if (!prev) groups.set(key, { source_id: r.source_id, sender_name: name, count: 1 });
    else prev.count++;
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
        total_orphan_messages: orphans?.length ?? 0,
        candidates_filed: 0,
        self_groups: selfCount, no_match_groups: noMatchCount, by_reason: byReason,
      };
    }
    filed = candidates.length;
  }

  return {
    ok: true,
    scanned_groups:        groups.size,
    total_orphan_messages: orphans?.length ?? 0,
    candidates_filed:      filed,
    self_groups:           selfCount,
    no_match_groups:       noMatchCount,
    by_reason:             byReason,
  };
}
