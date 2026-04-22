/**
 * POST /api/prep-meeting-brief
 *
 * Spike endpoint — returns a FactSheet + synthesised prose for a given Google
 * Calendar event ID. Admin-guarded. Read-only: no Notion/Supabase writes.
 *
 * Body: { eventId: string; tz?: string; factsOnly?: boolean }
 * Response: { ok: true, brief: Brief } on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { generatePrepBrief, type MeetingOverride } from "@/lib/prep-brief";

export const maxDuration = 60;

/** Bearer auth path for spike/CLI testing (matches fireflies-sync pattern). */
function bearerAuthed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  const agent = req.headers.get("x-agent-key") ?? "";
  return auth === `Bearer ${expected}` || agent === expected;
}

export async function POST(req: NextRequest) {
  if (!bearerAuthed(req)) {
    const guard = await adminGuardApi();
    if (guard) return guard;
  }

  let body: { eventId?: string; tz?: string; factsOnly?: boolean; meetingOverride?: MeetingOverride };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.eventId || typeof body.eventId !== "string") {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  try {
    const brief = await generatePrepBrief({
      eventId:         body.eventId,
      tz:              body.tz,
      factsOnly:       body.factsOnly === true,
      meetingOverride: body.meetingOverride,
    });
    return NextResponse.json({ ok: true, brief });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Surface scope errors the same way suggested-time-blocks does, so UI can
    // render a soft "re-authorise" state instead of a red error.
    if (/insufficient authentication scopes|invalid_grant|unauthorized/i.test(msg)) {
      return NextResponse.json({ error: "calendar_scope_missing", message: msg }, { status: 502 });
    }
    return NextResponse.json({ error: "prep-brief failed", detail: msg }, { status: 500 });
  }
}
