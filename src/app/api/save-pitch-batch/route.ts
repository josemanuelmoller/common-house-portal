/**
 * POST /api/save-pitch-batch
 *
 * Persists a batch of pitches passed directly in the body — used by the
 * Comms tab after JMM reviews a dry_run preview and decides which pitches
 * are worth keeping. Each pitch carries the IDs resolved during the
 * original dry_run call (pillar_id, audience_id, channel_id); we strip any
 * hydrated name fields before insert.
 *
 * Body: { pitches: Array<NewPitch> }
 * Auth: admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { insertPitches, type NewPitch } from "@/lib/comms-strategy";

type InboundPitch = NewPitch & {
  // Hydrated fields possibly present on the client — ignored at insert time.
  pillar_name?:   string | null;
  pillar_tier?:   string | null;
  audience_name?: string | null;
  channel_name?:  string | null;
};

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const inbound: InboundPitch[] = Array.isArray(body.pitches) ? body.pitches : [];

  if (inbound.length === 0) {
    return NextResponse.json({ error: "pitches[] required and must be non-empty" }, { status: 400 });
  }

  // Sanity-check + strip hydrated fields before insert.
  const toInsert: NewPitch[] = [];
  for (const p of inbound) {
    if (!p.proposed_for_date || typeof p.angle !== "string" || p.angle.trim().length === 0) continue;
    toInsert.push({
      proposed_for_date: p.proposed_for_date,
      pillar_id:         p.pillar_id   ?? null,
      audience_id:       p.audience_id ?? null,
      channel_id:        p.channel_id  ?? null,
      trigger:           p.trigger     ?? null,
      angle:             p.angle.slice(0, 1000),
      headline:          p.headline    ?? null,
    });
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: "No valid pitches after sanity check" }, { status: 400 });
  }

  try {
    const written = await insertPitches(toInsert);
    return NextResponse.json({ ok: true, records_written: written });
  } catch (e) {
    return NextResponse.json({ error: "insert failed", detail: String(e) }, { status: 500 });
  }
}
