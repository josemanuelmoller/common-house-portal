/**
 * GET /api/google/whoami
 *
 * Admin-only diagnostic. Returns the Google account that the shared OAuth
 * refresh token belongs to — separately for Gmail, Calendar, and People API.
 * All three should report the same email; any mismatch reveals the token
 * was minted for the wrong account.
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { CALENDAR_ID } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const auth = getGoogleAuthClient();
  if (!auth.ok) return NextResponse.json({ error: "no_auth" }, { status: 502 });

  const report: Record<string, unknown> = { calendar_id_env: CALENDAR_ID };

  // Gmail profile
  try {
    const gmail = google.gmail({ version: "v1", auth: auth.client });
    const p = await gmail.users.getProfile({ userId: "me" });
    report.gmail = {
      emailAddress:    p.data.emailAddress,
      messagesTotal:   p.data.messagesTotal,
      threadsTotal:    p.data.threadsTotal,
    };
  } catch (err) {
    report.gmail_error = err instanceof Error ? err.message : String(err);
  }

  // Calendar list — first 5 calendars the token can see, with primary flag
  try {
    const cal = google.calendar({ version: "v3", auth: auth.client });
    const list = await cal.calendarList.list({ maxResults: 20 });
    report.calendars = (list.data.items ?? []).map(c => ({
      id:         c.id,
      summary:    c.summary,
      primary:    c.primary ?? false,
      accessRole: c.accessRole,
    }));
    // Also pull the calendar object that CALENDAR_ID points to
    try {
      const target = await cal.calendars.get({ calendarId: CALENDAR_ID });
      report.target_calendar = {
        id:       target.data.id,
        summary:  target.data.summary,
        timeZone: target.data.timeZone,
      };
    } catch (err) {
      report.target_calendar_error = err instanceof Error ? err.message : String(err);
    }
  } catch (err) {
    report.calendar_error = err instanceof Error ? err.message : String(err);
  }

  // People API — who does Google consider "me"?
  try {
    const people = google.people({ version: "v1", auth: auth.client });
    const me = await people.people.get({
      resourceName: "people/me",
      personFields: "emailAddresses,names",
    });
    report.people = {
      primary_email: me.data.emailAddresses?.find(e => e.metadata?.primary)?.value
        ?? me.data.emailAddresses?.[0]?.value,
      display_name:  me.data.names?.[0]?.displayName,
    };
  } catch (err) {
    report.people_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ok: true, ...report });
}
