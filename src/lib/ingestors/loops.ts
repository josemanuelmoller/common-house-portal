/**
 * Loops ingestor — Phase 6 of the normalization architecture.
 *
 * The Supabase `loops` table (populated by /api/sync-loops) is a legacy
 * action store that pre-dates the normalization layer. Rather than
 * retire it, we demote it to an INGESTOR: it continues detecting live
 * threads, but its rows flow into `action_items` like any other source.
 *
 * Surfaces (CoS Desk, etc.) query `action_items`, not `loops`.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 "Loops" subsection.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildFactors } from "./priority";
import {
  getWatermark,
  startIngestorRun,
  finishIngestorRun,
  persistSignals,
  setWatermark,
  summarizeResult,
} from "./persist";
import type {
  ActionSignal,
  IngestError,
  IngestInput,
  IngestResult,
  Intent,
  Signal,
} from "./types";

const INGESTOR_VERSION = "loops@1.0.0";
const SOURCE_TYPE = "loops" as const;
const DEFAULT_MAX_ITEMS = 200;

// ─── Loop status → action status ──────────────────────────────────────────
const ACTIVE_LOOP_STATUSES = ["open", "in_progress", "reopened"];

// ─── Loop type → Intent ───────────────────────────────────────────────────
function mapLoopTypeToIntent(loopType: string | null): Intent {
  switch ((loopType ?? "").toLowerCase()) {
    case "blocker":        return "decide";
    case "decision":       return "decide";
    case "commitment":     return "deliver";
    case "prep":           return "prep";
    case "review":         return "review";
    case "follow_up":      return "follow_up";
    case "follow-up":      return "follow_up";
    case "close_loop":     return "close_loop";
    default:               return "follow_up";
  }
}

type LoopRow = {
  id:                 string;
  title:              string;
  loop_type:          string | null;
  status:             string;
  priority_score:     number | null;
  linked_entity_name: string | null;
  notion_url:         string | null;
  review_url:         string | null;
  due_at:             string | null;
  founder_owned:      boolean | null;
  founder_interest:   string | null;
  is_passive_discovery: boolean | null;
  parent_project_id:  string | null;
  updated_at:         string;
  last_action_at:     string | null;
  last_meaningful_evidence_at: string | null;
};

export async function runLoopsIngestor(input: IngestInput): Promise<IngestResult> {
  const startedAt = new Date();
  const errors: IngestError[] = [];
  const signals: Signal[] = [];
  let processed = 0;
  let skipped = 0;
  let toWatermark: string | null = null;
  let fallbackUsed: string | undefined;

  // ─── Watermark ────────────────────────────────────────────────────────
  let since: string | null = null;
  if (input.mode === "backfill") {
    since = input.since ?? null;
  } else {
    since = await getWatermark(SOURCE_TYPE);
    if (!since) {
      // First run: backfill all currently-open loops (no time cap)
      since = new Date(0).toISOString();
      fallbackUsed = "no_prior_watermark_full_backfill";
    }
  }

  const runId = await startIngestorRun({
    sourceType: SOURCE_TYPE,
    ingestorVersion: INGESTOR_VERSION,
    sinceWatermark: since,
  });

  try {
    const sb = getSupabaseServerClient();

    // ─── Fetch active loops updated since watermark ─────────────────────
    const { data, error } = await sb
      .from("loops")
      .select(
        "id, title, loop_type, status, priority_score, linked_entity_name, " +
        "notion_url, review_url, due_at, founder_owned, founder_interest, " +
        "is_passive_discovery, parent_project_id, updated_at, last_action_at, " +
        "last_meaningful_evidence_at"
      )
      .in("status", ACTIVE_LOOP_STATUSES)
      .gte("updated_at", since)
      .order("priority_score", { ascending: false })
      .limit(input.maxItems ?? DEFAULT_MAX_ITEMS);

    if (error) throw new Error(`fetch loops: ${error.message}`);
    const rows = (data ?? []) as unknown as LoopRow[];

    let latest = since ? new Date(since) : new Date(0);

    for (const r of rows) {
      const updatedAt = new Date(r.updated_at);
      if (updatedAt > latest) latest = updatedAt;

      // Passive-discovery gate: only surface when founder explicitly opted in,
      // or when the item is founder-owned. Replaces the legacy "blanket
      // blockers always surface" safety-net from /api/cos-loops.
      const passiveGate =
        !r.is_passive_discovery ||
        r.founder_interest === "interested" ||
        r.founder_owned === true;
      if (!passiveGate) { skipped++; continue; }
      if (r.founder_interest === "dropped") { skipped++; continue; }

      const intent = mapLoopTypeToIntent(r.loop_type);
      const founderOwned = !!r.founder_owned;

      // last_motion_at: the most recent of {updated_at, last_meaningful_evidence_at, last_action_at}
      const motion = Math.max(
        updatedAt.getTime(),
        r.last_meaningful_evidence_at ? new Date(r.last_meaningful_evidence_at).getTime() : 0,
        r.last_action_at ? new Date(r.last_action_at).getTime() : 0,
      );
      const lastMotionIso = new Date(motion).toISOString();

      const factors = buildFactors({
        intent,
        deadline: r.due_at,
        lastMotionAt: lastMotionIso,
        tier: null,
        warmth: null,
        objectiveTier: null,
        founderOwned,
      });

      const signal: ActionSignal = {
        kind: "action",
        source_type: SOURCE_TYPE,
        source_id: r.id,
        source_url: r.review_url ?? r.notion_url ?? undefined,
        emitted_at: new Date().toISOString(),
        ingestor_version: INGESTOR_VERSION,
        related_ids: {},
        payload: {
          intent,
          ball_in_court: "jose",
          owner_person_id: null,
          founder_owned: founderOwned,
          next_action: r.title || "(untitled loop)",
          subject: r.linked_entity_name
            ? `${r.linked_entity_name}: ${r.title}`
            : r.title || "(untitled loop)",
          counterparty: r.linked_entity_name,
          deadline: r.due_at,
          last_motion_at: lastMotionIso,
          consequence: null,
          priority_factors: factors,
        },
      };
      signals.push(signal);
      processed++;
    }

    toWatermark = latest.toISOString();
  } catch (err: unknown) {
    errors.push({ message: err instanceof Error ? err.message : String(err) });
  }

  // ─── Persist + finalize ────────────────────────────────────────────────
  const { counts, errors: persistErrors } = await persistSignals(signals, { dryRun: input.dryRun ?? false });
  errors.push(...persistErrors);

  const result: IngestResult = {
    source_type: SOURCE_TYPE,
    ingestor_version: INGESTOR_VERSION,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    since_watermark: since,
    to_watermark: toWatermark,
    processed,
    skipped,
    errors,
    fallback_used: fallbackUsed,
    signals,
    dry_run: input.dryRun ?? false,
    run_id: runId,
  };

  await finishIngestorRun({
    runId,
    toWatermark,
    processed,
    skipped,
    errors,
    signalsEmitted: { ...counts, ...summarizeResult(result) },
    fallbackUsed,
    dryRun: input.dryRun ?? false,
  });

  if (!input.dryRun && input.mode === "delta" && toWatermark && errors.length === 0) {
    await setWatermark({
      sourceType: SOURCE_TYPE,
      watermark: toWatermark,
      ingestorVersion: INGESTOR_VERSION,
      runId,
    });
  }

  return result;
}
