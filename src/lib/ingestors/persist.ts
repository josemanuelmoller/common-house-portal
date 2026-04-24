/**
 * Persistence layer for the ingestor contract.
 *
 * Every ingestor calls these helpers. Nothing else in the codebase should
 * write to action_items / relationship_signals / ingestor_state / ingestor_runs.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §10 (lifecycle) and §13 (observability).
 */

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildDedupKey } from "@/lib/normalize";
import { computePriorityScore } from "./priority";
import type {
  ActionSignal,
  IngestError,
  IngestResult,
  RelationshipSignal,
  Signal,
  SourceType,
} from "./types";

// ─── Watermark ────────────────────────────────────────────────────────────
export async function getWatermark(sourceType: SourceType): Promise<string | null> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("ingestor_state")
    .select("last_successful_watermark")
    .eq("source_type", sourceType)
    .maybeSingle();
  return (data?.last_successful_watermark as string | null) ?? null;
}

export async function setWatermark(params: {
  sourceType: SourceType;
  watermark: string;
  ingestorVersion: string;
  runId: string | null;
}): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("ingestor_state")
    .upsert(
      {
        source_type:               params.sourceType,
        last_successful_watermark: params.watermark,
        ingestor_version:          params.ingestorVersion,
        last_run_id:               params.runId,
        updated_at:                new Date().toISOString(),
      },
      { onConflict: "source_type" }
    );
  if (error) throw new Error(`setWatermark failed: ${error.message}`);
}

// ─── ingestor_runs ────────────────────────────────────────────────────────
export async function startIngestorRun(params: {
  sourceType: SourceType;
  ingestorVersion: string;
  sinceWatermark: string | null;
}): Promise<string> {
  const sb = getSupabaseServerClient();
  const id = randomUUID();
  const { error } = await sb.from("ingestor_runs").insert({
    id,
    source_type:      params.sourceType,
    ingestor_version: params.ingestorVersion,
    since_watermark:  params.sinceWatermark,
    status:           "running",
  });
  if (error) throw new Error(`startIngestorRun failed: ${error.message}`);
  return id;
}

export async function finishIngestorRun(params: {
  runId: string;
  toWatermark: string | null;
  processed: number;
  skipped: number;
  errors: IngestError[];
  signalsEmitted: Record<string, number>;
  fallbackUsed?: string;
  dryRun: boolean;
}): Promise<void> {
  const sb = getSupabaseServerClient();
  const status = params.errors.length > 0 ? "error" : "ok";
  const { error } = await sb
    .from("ingestor_runs")
    .update({
      finished_at:     new Date().toISOString(),
      to_watermark:    params.toWatermark,
      processed:       params.processed,
      skipped:         params.skipped,
      errors:          params.errors.length ? params.errors : null,
      signals_emitted: { ...params.signalsEmitted, dry_run: params.dryRun },
      fallback_used:   params.fallbackUsed ?? null,
      status,
    })
    .eq("id", params.runId);
  if (error) throw new Error(`finishIngestorRun failed: ${error.message}`);
}

// ─── action_items ─────────────────────────────────────────────────────────
/**
 * Upsert an ActionSignal into action_items.
 *
 * Behaviour:
 *  - Compute dedup_key from (intent, counterparty, subject).
 *  - If a row with the same dedup_key exists AND status='open', update
 *    last_motion_at, next_action, priority_factors, priority_score, merge_log.
 *  - Otherwise INSERT a new row.
 *
 * We don't use a plain upsert() here because the unique index is PARTIAL
 * (WHERE status='open'), and Supabase's upsert doesn't express that. The
 * SELECT+INSERT/UPDATE pattern is explicit and safe.
 */
export async function persistActionSignal(signal: ActionSignal): Promise<{
  action: "inserted" | "updated" | "skipped";
  id: string | null;
}> {
  const sb = getSupabaseServerClient();
  const dedup_key = buildDedupKey({
    intent:       signal.payload.intent,
    counterparty: signal.payload.counterparty,
    subject:      signal.payload.subject,
  });
  const priority_score = computePriorityScore(signal.payload.priority_factors);

  // Look for an existing open row with the same dedup_key
  const { data: existing, error: selErr } = await sb
    .from("action_items")
    .select("id, last_motion_at")
    .eq("dedup_key", dedup_key)
    .eq("status", "open")
    .maybeSingle();

  if (selErr) throw new Error(`persistActionSignal select: ${selErr.message}`);

  if (existing) {
    // Incoming older or same → skip (idempotent)
    const existingT = new Date(existing.last_motion_at as string).getTime();
    const incomingT = new Date(signal.payload.last_motion_at).getTime();
    if (incomingT <= existingT) return { action: "skipped", id: existing.id as string };

    const { error: updErr } = await sb
      .from("action_items")
      .update({
        last_motion_at:   signal.payload.last_motion_at,
        next_action:      signal.payload.next_action,
        priority_factors: signal.payload.priority_factors,
        priority_score,
        source_type:      signal.source_type,
        source_id:        signal.source_id,
        source_url:       signal.source_url ?? null,
        ingestor_version: signal.ingestor_version,
        ingested_at:      signal.emitted_at,
        deadline:         signal.payload.deadline,
        consequence:      signal.payload.consequence,
      })
      .eq("id", existing.id as string);
    if (updErr) throw new Error(`persistActionSignal update: ${updErr.message}`);
    return { action: "updated", id: existing.id as string };
  }

  // New row
  const id = randomUUID();
  const { error: insErr } = await sb.from("action_items").insert({
    id,
    source_type:             signal.source_type,
    source_id:               signal.source_id,
    source_url:              signal.source_url ?? null,
    ingested_at:             signal.emitted_at,
    ingestor_version:        signal.ingestor_version,
    intent:                  signal.payload.intent,
    ball_in_court:           signal.payload.ball_in_court,
    owner_person_id:         signal.payload.owner_person_id ?? null,
    founder_owned:           signal.payload.founder_owned ?? false,
    next_action:             signal.payload.next_action,
    subject:                 signal.payload.subject,
    counterparty:            signal.payload.counterparty,
    counterparty_contact_id: signal.related_ids?.contact_id ?? null,
    project_id:              signal.related_ids?.project_id ?? null,
    strategic_objective_id:  signal.related_ids?.objective_id ?? null,
    conversation_id:         signal.related_ids?.conversation_id ?? null,
    deadline:                signal.payload.deadline,
    last_motion_at:          signal.payload.last_motion_at,
    consequence:             signal.payload.consequence,
    priority_score,
    priority_factors:        signal.payload.priority_factors,
    status:                  "open",
    dedup_key,
  });
  if (insErr) throw new Error(`persistActionSignal insert: ${insErr.message}`);
  return { action: "inserted", id };
}

// ─── relationship_signals ─────────────────────────────────────────────────
/**
 * Upsert a RelationshipSignal into relationship_signals.
 *
 * Writes last_inbound_at / last_outbound_at / last_meeting_at depending on
 * direction. Does NOT compute warmth or next_touch_due_at yet — those
 * belong to a separate re-computation pass over the aggregate state.
 */
export async function persistRelationshipSignal(signal: RelationshipSignal): Promise<void> {
  const sb = getSupabaseServerClient();
  const { data: existing } = await sb
    .from("relationship_signals")
    .select("last_inbound_at, last_outbound_at, last_meeting_at")
    .eq("contact_id", signal.payload.contact_id)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    contact_id:          signal.payload.contact_id,
    updated_at:          new Date().toISOString(),
    updated_from_source: signal.source_type,
  };
  const at = signal.payload.at;
  if (signal.payload.direction === "inbound") {
    patch.last_inbound_at = maxTs(existing?.last_inbound_at as string | undefined, at);
  } else if (signal.payload.direction === "outbound") {
    patch.last_outbound_at = maxTs(existing?.last_outbound_at as string | undefined, at);
  } else {
    patch.last_meeting_at = maxTs(existing?.last_meeting_at as string | undefined, at);
  }

  const { error } = await sb
    .from("relationship_signals")
    .upsert(patch, { onConflict: "contact_id" });
  if (error) throw new Error(`persistRelationshipSignal: ${error.message}`);
}

function maxTs(a: string | undefined, b: string): string {
  if (!a) return b;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────
/**
 * Persist every signal in an IngestResult (unless dryRun). Returns a breakdown
 * of counts by signal kind, for use in ingestor_runs.signals_emitted.
 */
export async function persistSignals(
  signals: Signal[],
  opts: { dryRun: boolean }
): Promise<{ counts: Record<string, number>; errors: IngestError[] }> {
  const counts: Record<string, number> = { action: 0, relationship: 0 };
  const errors: IngestError[] = [];

  if (opts.dryRun) {
    for (const s of signals) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
    return { counts, errors };
  }

  for (const s of signals) {
    try {
      if (s.kind === "action") {
        const r = await persistActionSignal(s);
        counts.action += 1;
        counts[`action_${r.action}`] = (counts[`action_${r.action}`] ?? 0) + 1;
      } else if (s.kind === "relationship") {
        await persistRelationshipSignal(s);
        counts.relationship += 1;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ source_id: s.source_id, message: msg });
    }
  }
  return { counts, errors };
}

// ─── Utility: turn IngestResult into a final run log entry ─────────────────
export function summarizeResult(result: IngestResult): Record<string, number> {
  const out: Record<string, number> = {
    total_signals: result.signals.length,
    actions:       result.signals.filter(s => s.kind === "action").length,
    relationships: result.signals.filter(s => s.kind === "relationship").length,
  };
  return out;
}
