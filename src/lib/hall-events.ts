/**
 * hall-events.ts
 *
 * Lightweight structured logger for Hall feature telemetry.
 * Two sinks:
 *   1. stderr  — always; shows up in Vercel function logs, cheap and visible
 *   2. Supabase hall_events — fire-and-forget insert; queryable aggregation
 *
 * Design rules:
 *   - Never throws, never blocks a response. If Supabase is slow or broken,
 *     we silently continue — the console line is the source of truth.
 *   - Flat, bounded metadata: scalars only at the top; nested objects go under
 *     `metadata` (JSONB).
 *   - Event types are a closed enum (`HallEventType`) to keep dashboards sane.
 */

import { getSupabaseServerClient } from "./supabase-server";

export type HallEventType =
  // Suggested Time Blocks pipeline
  | "stb_requested"               // GET /api/suggested-time-blocks called
  | "stb_returned_cached"
  | "stb_returned_fresh"
  | "stb_calendar_auth_error"     // scope missing / token revoked / env missing
  | "stb_no_valid_slots"
  | "stb_no_strong_candidates"
  | "stb_suggestions_generated"   // pipeline succeeded; count in metadata
  | "stb_suggestions_matched"     // how many slot/candidate pairs survived
  | "stb_accept"
  | "stb_accept_error"
  | "stb_dismiss"
  | "stb_snooze"
  // Reserved for future Hall surfaces
  | "hall_other";

export type HallEventPayload = {
  source:     string;              // "suggested-time-blocks" | etc.
  type:       HallEventType;
  user_email: string;
  metadata?:  Record<string, string | number | boolean | null>;
};

/** Write a structured event line and asynchronously persist it. */
export function logHallEvent(payload: HallEventPayload): void {
  const { source, type, user_email, metadata } = payload;
  const line = JSON.stringify({
    ts:    new Date().toISOString(),
    scope: "hall",
    source,
    type,
    user_email,
    ...(metadata ?? {}),
  });
  // eslint-disable-next-line no-console
  console.log(line);

  // Fire-and-forget insert; never awaited so routes stay fast.
  void insertAsync(payload);
}

async function insertAsync(p: HallEventPayload): Promise<void> {
  try {
    const sb = getSupabaseServerClient();
    await sb.from("hall_events").insert({
      user_email: p.user_email,
      source:     p.source,
      event_type: p.type,
      metadata:   p.metadata ?? {},
    });
  } catch {
    // Swallow — console line is already out.
  }
}
