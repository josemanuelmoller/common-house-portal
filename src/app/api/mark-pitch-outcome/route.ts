/**
 * POST /api/mark-pitch-outcome
 *
 * Upserts a row in content_pitch_outcomes. Called from the Comms tab after a
 * pitch has been published, so JMM can log whether it worked (worth_repeating)
 * plus any concrete metrics (impressions, comments, DMs). This feeds the
 * generator's anti-repetition / quality loop on future batches.
 *
 * Body: {
 *   pitchId: string;
 *   worth_repeating?: boolean | null;
 *   impressions?: number | null;
 *   comments_count?: number | null;
 *   dms_received?: number | null;
 *   notes?: string | null;
 *   published_at?: string | null;   // ISO timestamp; defaults to now() server-side
 * }
 * Auth: admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { upsertPitchOutcome, updatePitchStatus } from "@/lib/comms-strategy";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const pitchId: string = body.pitchId;
  if (!pitchId) {
    return NextResponse.json({ error: "pitchId required" }, { status: 400 });
  }

  const outcome = {
    worth_repeating: body.worth_repeating ?? null,
    impressions:     body.impressions ?? null,
    comments_count:  body.comments_count ?? null,
    dms_received:    body.dms_received ?? null,
    notes:           body.notes ?? null,
    published_at:    body.published_at ?? new Date().toISOString(),
  };

  try {
    await upsertPitchOutcome(pitchId, outcome);
    // If caller confirms publication and pitch status is still `drafted`,
    // advance it to `published` so the queue reflects lifecycle truth.
    if (body.advance_status === true) {
      await updatePitchStatus(pitchId, "published");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "upsert error", detail: String(e) }, { status: 500 });
  }
}
