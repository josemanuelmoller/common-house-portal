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
import { buildDedupKey, actionItemFingerprint, overlapCoefficient, normalizeCounterparty } from "@/lib/normalize";
import { computePriorityScore } from "./priority";
import type {
  ActionSignal,
  IngestError,
  IngestResult,
  RelationshipSignal,
  Signal,
  SourceType,
} from "./types";

// ─── DLQ ──────────────────────────────────────────────────────────────────
/**
 * Record a per-row error in the dead-letter queue. Fail-soft: never throws
 * — DLQ is a logging facility, it must not break the parent ingestor.
 * Lets the watermark advance past poison rows so the pipeline doesn't stall.
 */
export async function recordDlqEntry(params: {
  sourceType: SourceType;
  sourceId?: string;
  ingestorVersion: string;
  runId: string | null;
  errorMessage: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = getSupabaseServerClient();
    await sb.from("ingestor_dlq").insert({
      source_type:      params.sourceType,
      source_id:        params.sourceId ?? null,
      ingestor_version: params.ingestorVersion,
      run_id:           params.runId,
      error_message:    params.errorMessage.slice(0, 4000),
      context:          params.context ?? null,
    });
  } catch {
    // Swallow — DLQ failure should never bubble up to ingestor.
  }
}

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
  action: "inserted" | "updated" | "skipped" | "reopened";
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

  // No OPEN row matched. Before inserting, check for a recently-closed row
  // with the same dedup_key. If it exists and the incoming motion is fresher
  // by a meaningful margin, REOPEN it — preserves user's prior dismissal/
  // resolution audit and prevents an infinite "dismiss → re-emit" loop.
  // Reopen gate (mirrors docs/loop-lifecycle.md §Reopen gate + §10 of
  // NORMALIZATION_ARCHITECTURE.md):
  //   1. Closed row exists with same dedup_key
  //   2. Closed less than 90 days ago (older than 90d → create fresh row)
  //   3. New motion is at least 1 minute newer than the closed row's
  //      last_motion_at (so a re-run with the same data doesn't reopen)
  //   4. NOT manual_done — if Jose explicitly marked it done, don't
  //      resurrect; only auto-closures (stale_decay, deadline_passed) and
  //      manual_dismiss are eligible
  const { data: closed } = await sb
    .from("action_items")
    .select("id, status, resolved_at, resolved_reason, last_motion_at")
    .eq("dedup_key", dedup_key)
    .in("status", ["resolved", "dismissed", "stale"])
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (closed) {
    const resolvedAt = closed.resolved_at ? new Date(closed.resolved_at as string).getTime() : 0;
    const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
    const incomingT = new Date(signal.payload.last_motion_at).getTime();
    const closedMotionT = new Date(closed.last_motion_at as string).getTime();
    const meaningfullyNewer = incomingT > closedMotionT + 60_000;
    const reason = closed.resolved_reason as string | null;
    const reopenable = reason !== "manual_done";

    if (resolvedAt > ninetyDaysAgo && meaningfullyNewer && reopenable) {
      const { error: reErr } = await sb
        .from("action_items")
        .update({
          status:           "open",
          resolved_at:      null,
          resolved_reason:  null,
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
        .eq("id", closed.id as string);
      if (reErr) throw new Error(`persistActionSignal reopen: ${reErr.message}`);
      return { action: "reopened", id: closed.id as string };
    }
    // Closed row exists but is too old / explicitly done / not newer → fall through to insert
  }

  // ─── Fuzzy dedup (paraphrase-resistant) ────────────────────────────────
  // Catches duplicates where intent + counterparty match but subject is
  // worded differently (different ingestor, different speaker phrasing).
  // Example:
  //   "Follow up with Carlos on Istanbul Initiative status report"
  //   "Chase Carlos on Istanbul Initiative briefing document completion"
  // Threshold 0.5 on overlap coefficient + same intent + same counterparty.
  const FUZZY_THRESHOLD = 0.5;
  let fuzzyMatchQuery = sb
    .from("action_items")
    .select("id, subject, last_motion_at")
    .eq("status", "open")
    .eq("intent", signal.payload.intent)
    .limit(20);
  if (signal.related_ids?.contact_id) {
    fuzzyMatchQuery = fuzzyMatchQuery.eq("counterparty_contact_id", signal.related_ids.contact_id);
  } else if (signal.payload.counterparty) {
    // Fall back to normalized counterparty string match. This is fuzzier than
    // contact_id but still scopes us to plausible candidates.
    const normCp = normalizeCounterparty(signal.payload.counterparty);
    if (normCp) fuzzyMatchQuery = fuzzyMatchQuery.ilike("counterparty", `%${normCp.split(" ")[0]}%`);
    else fuzzyMatchQuery = fuzzyMatchQuery.eq("counterparty", signal.payload.counterparty);
  }
  const { data: fuzzyCandidates } = await fuzzyMatchQuery;

  if (fuzzyCandidates && fuzzyCandidates.length > 0) {
    const incomingFp = actionItemFingerprint(signal.payload.subject);
    if (incomingFp) {
      let bestMatch: { id: string; lastMotion: string; similarity: number } | null = null;
      for (const c of fuzzyCandidates) {
        const sim = overlapCoefficient(incomingFp, actionItemFingerprint(c.subject as string));
        if (sim >= FUZZY_THRESHOLD && (!bestMatch || sim > bestMatch.similarity)) {
          bestMatch = {
            id:         c.id as string,
            lastMotion: c.last_motion_at as string,
            similarity: sim,
          };
        }
      }
      if (bestMatch) {
        const existingT = new Date(bestMatch.lastMotion).getTime();
        const incomingT = new Date(signal.payload.last_motion_at).getTime();
        if (incomingT <= existingT) return { action: "skipped", id: bestMatch.id };
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
          .eq("id", bestMatch.id);
        if (updErr) throw new Error(`persistActionSignal fuzzy-update: ${updErr.message}`);
        return { action: "updated", id: bestMatch.id };
      }
    }
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

// ─── Watermark policy ─────────────────────────────────────────────────────
/**
 * A "fatal" error blocks watermark advance — typically auth/network
 * issues or anything without a `source_id`. Per-row errors (with source_id)
 * are recoverable: they go to the DLQ and we let the watermark move past
 * the poison row so the pipeline doesn't stall on a single bad input.
 */
export function hasFatalErrors(errors: IngestError[]): boolean {
  return errors.some(e => !e.source_id);
}

/**
 * Push every per-row error in `errors` to the DLQ. Top-level errors
 * (no source_id) are kept in ingestor_runs only — they're already
 * blocking the watermark.
 */
export async function flushPerRowErrorsToDlq(params: {
  sourceType: SourceType;
  ingestorVersion: string;
  runId: string | null;
  errors: IngestError[];
}): Promise<void> {
  for (const e of params.errors) {
    if (!e.source_id) continue;
    await recordDlqEntry({
      sourceType:      params.sourceType,
      sourceId:        e.source_id,
      ingestorVersion: params.ingestorVersion,
      runId:           params.runId,
      errorMessage:    e.message,
    });
  }
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
