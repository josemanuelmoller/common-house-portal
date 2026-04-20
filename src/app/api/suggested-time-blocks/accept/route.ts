/**
 * POST /api/suggested-time-blocks/accept
 * Body: { id: string }
 *
 * Creates a Google Calendar event for the suggested block and marks the row
 * as accepted. Writes to Jose's primary calendar via the same OAuth client
 * used by Gmail ingestion. Requires `calendar.events` scope on the refresh
 * token. On scope failure, returns 502 with a clear reason.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCalendarClient, CALENDAR_ID } from "@/lib/google-calendar";
import { classifyGoogleError } from "@/lib/google-auth";
import { getHallPreferences } from "@/lib/hall-preferences";
import { logHallEvent } from "@/lib/hall-events";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const { id } = await req.json().catch(() => ({ id: null }));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const { data: row, error } = await sb
    .from("suggested_time_blocks")
    .select("*")
    .eq("id", id)
    .eq("user_email", email)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.status !== "suggested") {
    return NextResponse.json({ error: "already_resolved", status: row.status }, { status: 409 });
  }

  const cal = getCalendarClient();
  if (!cal) return NextResponse.json({ error: "calendar_unavailable" }, { status: 502 });

  const prefs = await getHallPreferences(email);
  const description = [
    row.why_now,
    "",
    `Expected outcome:`,
    row.expected_outcome,
    "",
    `Linked: ${row.linked_entity_type} · ${row.linked_entity_label}`,
    `Suggested by Common House Hall.`,
  ].join("\n");

  try {
    const ev = await cal.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary:     row.title,
        description,
        start:       { dateTime: row.suggested_start_time, timeZone: prefs.timezone },
        end:         { dateTime: row.suggested_end_time,   timeZone: prefs.timezone },
        reminders:   { useDefault: true },
        colorId:     "2",  // sage; distinct from blocked meetings
        source:      { title: "Hall", url: "https://portal.wearecommonhouse.com/admin" },
      },
    });

    const eventId   = ev.data.id ?? null;
    const eventLink = ev.data.htmlLink ?? null;

    await sb
      .from("suggested_time_blocks")
      .update({
        status:         "accepted",
        accepted_at:    new Date().toISOString(),
        gcal_event_id:  eventId,
        gcal_event_link: eventLink,
      })
      .eq("id", id);

    logHallEvent({
      source: "suggested-time-blocks", type: "stb_accept", user_email: email,
      metadata: { id, task_type: row.task_type, duration_min: row.duration_minutes },
    });

    return NextResponse.json({ ok: true, event_link: eventLink });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind = classifyGoogleError(err);
    const errorCode =
      kind === "scope_missing" ? "calendar_scope_missing"
      : kind === "auth_revoked" ? "calendar_auth_revoked"
      : "calendar_write_failed";
    logHallEvent({
      source: "suggested-time-blocks", type: "stb_accept_error", user_email: email,
      metadata: { id, error_code: errorCode, message: message.slice(0, 240) },
    });
    return NextResponse.json({ error: errorCode, message }, { status: 502 });
  }
}
