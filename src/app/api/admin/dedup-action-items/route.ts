/**
 * One-shot fuzzy-dedup pass over open action_items.
 *
 * Same logic as the ingest-time fuzzy dedup, but applied retroactively:
 *   1. Group open items by (intent, counterparty_contact_id) when contact_id
 *      is set; fall back to (intent, normalized counterparty) otherwise.
 *   2. Within each group, build clusters using overlap coefficient ≥ 0.5
 *      on actionItemFingerprint(subject).
 *   3. For each cluster of size ≥ 2: keep the row with latest last_motion_at
 *      as the survivor; mark the rest as status='merged', merged_into=keeper.
 *
 * Modes:
 *   POST { mode: "dry_run" }  → returns clusters + would-be merges, no writes
 *   POST { mode: "execute" }  → applies the merges, returns counts + details
 *
 * Auth: adminGuardApi() — admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  actionItemFingerprint,
  overlapCoefficient,
  normalizeCounterparty,
} from "@/lib/normalize";

const FUZZY_THRESHOLD = 0.5;

type Row = {
  id: string;
  intent: string;
  subject: string;
  counterparty: string | null;
  counterparty_contact_id: string | null;
  last_motion_at: string;
  source_type: string;
};

type Cluster = {
  groupKey: string;
  intent: string;
  counterparty: string | null;
  keeper: { id: string; subject: string; lastMotion: string };
  merged: { id: string; subject: string; lastMotion: string; similarity: number }[];
};

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let mode: "dry_run" | "execute" = "dry_run";
  try {
    const body = await req.json().catch(() => ({}));
    if (body.mode === "execute") mode = "execute";
  } catch {
    // body optional
  }

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("action_items")
    .select("id, intent, subject, counterparty, counterparty_contact_id, last_motion_at, source_type")
    .eq("status", "open")
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];

  // Group by (intent, counterparty_contact_id || normalizeCounterparty(counterparty))
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const cpKey = r.counterparty_contact_id
      ? `id:${r.counterparty_contact_id}`
      : r.counterparty
        ? `cp:${normalizeCounterparty(r.counterparty)}`
        : "cp:unknown";
    const key = `${r.intent}|${cpKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // Within each group, build clusters by greedy pairwise overlap
  const clusters: Cluster[] = [];
  for (const [groupKey, items] of groups) {
    if (items.length < 2) continue;

    // Precompute fingerprints
    const fps = items.map(it => actionItemFingerprint(it.subject));
    const visited = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      if (visited.has(i)) continue;
      const cluster: { idx: number; sim: number }[] = [{ idx: i, sim: 1 }];
      for (let j = i + 1; j < items.length; j++) {
        if (visited.has(j)) continue;
        const sim = overlapCoefficient(fps[i], fps[j]);
        if (sim >= FUZZY_THRESHOLD && fps[i] && fps[j]) {
          cluster.push({ idx: j, sim });
        }
      }
      if (cluster.length < 2) continue;
      cluster.forEach(c => visited.add(c.idx));

      // Pick keeper = latest last_motion_at
      cluster.sort((a, b) =>
        new Date(items[b.idx].last_motion_at).getTime() -
        new Date(items[a.idx].last_motion_at).getTime()
      );
      const keeperRow = items[cluster[0].idx];
      const merged = cluster.slice(1).map(c => ({
        id:         items[c.idx].id,
        subject:    items[c.idx].subject,
        lastMotion: items[c.idx].last_motion_at,
        similarity: Number(c.sim.toFixed(3)),
      }));

      clusters.push({
        groupKey,
        intent:       keeperRow.intent,
        counterparty: keeperRow.counterparty,
        keeper:       { id: keeperRow.id, subject: keeperRow.subject, lastMotion: keeperRow.last_motion_at },
        merged,
      });
    }
  }

  const totalToMerge = clusters.reduce((acc, c) => acc + c.merged.length, 0);

  if (mode === "dry_run") {
    return NextResponse.json({
      mode: "dry_run",
      scanned: rows.length,
      clusters_found: clusters.length,
      items_to_merge: totalToMerge,
      clusters,
    });
  }

  // Execute: apply merges
  const errors: { id: string; error: string }[] = [];
  let mergedCount = 0;
  for (const c of clusters) {
    for (const m of c.merged) {
      const { error: updErr } = await sb
        .from("action_items")
        .update({
          status:           "merged",
          merged_into:      c.keeper.id,
          resolved_at:      new Date().toISOString(),
          resolved_reason:  "deduped",
        })
        .eq("id", m.id);
      if (updErr) errors.push({ id: m.id, error: updErr.message });
      else mergedCount++;
    }
  }

  return NextResponse.json({
    mode: "execute",
    scanned: rows.length,
    clusters_found: clusters.length,
    items_merged: mergedCount,
    errors: errors.length > 0 ? errors : undefined,
    clusters,
  });
}
