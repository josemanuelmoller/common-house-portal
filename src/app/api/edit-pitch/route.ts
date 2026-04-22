/**
 * POST /api/edit-pitch
 *
 * Inline edit of a content_pitches row — updates angle (required) and
 * optionally headline. Used by the Comms tab when JMM wants to sharpen a
 * pitch before approving.
 *
 * Body: { pitchId: string; angle: string; headline?: string }
 * Auth: admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { updatePitchAngle } from "@/lib/comms-strategy";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const pitchId: string = body.pitchId;
  const angle:   string = body.angle;
  const headline: string | undefined = body.headline;

  if (!pitchId || typeof angle !== "string" || angle.trim().length === 0) {
    return NextResponse.json({ error: "pitchId and angle required" }, { status: 400 });
  }

  try {
    await updatePitchAngle(pitchId, angle, headline ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "update error", detail: String(e) }, { status: 500 });
  }
}
