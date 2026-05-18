/**
 * GET /api/suggested-time-blocks
 *
 * Returns the current set of Suggested Time Blocks for the signed-in admin.
 * Regenerates the set when the stored one is stale (no future suggestions,
 * all acted on, or older than 4 hours).
 *
 * Regeneration pipeline:
 *   1. Pull busy blocks + upcoming meetings from Google Calendar
 *   2. Compute open slots (working hours, buffers, lunch, slot buckets)
 *   3. Build candidates from loops + opportunities + meetings
 *   4. Remove candidates whose fingerprint is dismissed or snoozed for this user
 *   5. Greedy match → top 3-5 suggestions
 *   6. Persist new rows; mark outdated "suggested" rows as "expired"
 *   7. Return the fresh set
 *
 * Auth: Clerk admin only. Not for cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  listBusyBlocks,
  listUpcomingMeetings,
  findOpenSlots,
  formatSlotLabel,
} from "@/lib/calendar-slots";
import {
  candidatesFromLoops,
  candidatesFromOpportunities,
  candidatesFromMeetings,
  candidatesFromRecentMeetings,
  loopCoveredEntityIds,
} from "@/lib/time-block-candidates";
import { matchCandidatesToSlots } from "@/lib/time-block-matcher";
import { getHallPreferences } from "@/lib/hall-preferences";
import { classifyGoogleError } from "@/lib/google-auth";
import { logHallEvent } from "@/lib/hall-events";
import {
  collectNonSelfEmails,
  loadAttendeeClasses,
  observeAttendees,
} from "@/lib/meeting-classifier";

export const dynamic = "force-dynamic";

const FRESH_WINDOW_MS = 4 * 3600_000;
const MAX_SUGGESTIONS = 5;

type StoredBlock = {
  id: string;
  title: string;
  linked_entity_type: string;
  linked_entity_id: string;
  linked_entity_label: string;
  suggested_start_time: string;
  suggested_end_time: string;
  duration_minutes: number;
  task_type: string;
  urgency_score: number;
  confidence_score: number;
  why_now: string;
  expected_outcome: string;
  fingerprint: string;
  status: string;
  generated_at: string;
  gcal_event_link: string | null;
};

export async function GET(_req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const prefs = await getHallPreferences(email);

  logHallEvent({ source: "suggested-time-blocks", type: "stb_requested", user_email: email });

  // ── Step 1: check if stored set is still fresh ──────────────────────────
  const { data: existing } = await sb
    .from("suggested_time_blocks")
    .select("id,title,linked_entity_type,linked_entity_id,linked_entity_label,suggested_start_time,suggested_end_time,duration_minutes,task_type,urgency_score,confidence_score,why_now,expected_outcome,fingerprint,status,generated_at,gcal_event_link")
    .eq("user_email", email)
    .eq("status", "suggested")
    .gte("suggested_start_time", nowIso)
    .order("suggested_start_time", { ascending: true })
    .limit(MAX_SUGGESTIONS);

  const existingRows = (existing ?? []) as StoredBlock[];
  const newestGeneratedAt = existingRows[0]?.generated_at;
  const isFresh =
    existingRows.length > 0 &&
    newestGeneratedAt &&
    Date.now() - new Date(newestGeneratedAt).getTime() < FRESH_WINDOW_MS;

  if (isFresh) {
    logHallEvent({
      source: "suggested-time-blocks", type: "stb_returned_cached", user_email: email,
      metadata: { count: existingRows.length },
    });
    return NextResponse.json({
      mode: "cached",
      suggestions: existingRows.map(r => formatForClient(r, prefs.timezone)),
      generated_at: newestGeneratedAt,
    });
  }

  // ── Step 2: regenerate ──────────────────────────────────────────────────
  try {
    const now = new Date();

    const [busy, upcoming] = await Promise.all([
      listBusyBlocks(7, prefs.timezone),
      listUpcomingMeetings(7),
    ]);

    const slots = findOpenSlots(now, 7, busy, upcoming, prefs);

    if (slots.length === 0) {
      logHallEvent({
        source: "suggested-time-blocks", type: "stb_no_valid_slots", user_email: email,
        metadata: { busy_blocks: busy.length, upcoming_meetings: upcoming.length },
      });
      return NextResponse.json({
        mode: "empty",
        suggestions: [],
        reason: "No open working-hour slots found in the next 7 days.",
      });
    }

    // Pull candidates
    const covered = await loopCoveredEntityIds();
    const [loopCands, oppCands] = await Promise.all([
      candidatesFromLoops(20),
      candidatesFromOpportunities(covered, 15),
    ]);
    // Recent meetings for follow-up: we need meetings that ENDED in the last
    // 24h; upcoming.list only returns future. Fetch past separately via a second
    // events.list call embedded here to keep surface area small.
    const recent = await listPastMeetings(1);

    // Attendee enrichment — look up who's in each meeting and observe new
    // emails so Jose can classify them later from /admin/hall/contacts.
    // is_personal meetings skip prep/follow-up entirely; VIP meetings get
    // an urgency boost. Upsert is fire-and-forget best-effort.
    const attendeeEmails = collectNonSelfEmails([...upcoming, ...recent]);
    const attendeeLookup = await loadAttendeeClasses(attendeeEmails);
    void observeAttendees([...upcoming, ...recent]);

    const prepCands      = await candidatesFromMeetings(upcoming, now, attendeeLookup);
    const followUpCands  = candidatesFromRecentMeetings(recent, now, attendeeLookup);

    // Fingerprint blacklist: dismissed in last 24h, snoozed until future
    const { data: blocks } = await sb
      .from("suggested_time_blocks")
      .select("fingerprint,status,dismissed_at,snoozed_until")
      .eq("user_email", email)
      .in("status", ["dismissed", "snoozed"]);

    const suppressed = new Set<string>();
    const cutoff = Date.now() - 24 * 3600_000;
    for (const r of (blocks ?? []) as { fingerprint: string; status: string; dismissed_at: string | null; snoozed_until: string | null }[]) {
      if (r.status === "dismissed" && r.dismissed_at && new Date(r.dismissed_at).getTime() > cutoff) {
        suppressed.add(r.fingerprint);
      } else if (r.status === "snoozed" && r.snoozed_until && new Date(r.snoozed_until).getTime() > Date.now()) {
        suppressed.add(r.fingerprint);
      }
    }

    const allCands = [
      ...followUpCands,              // follow-ups decay fastest → first in pool
      ...prepCands,
      ...loopCands,
      ...oppCands,
    ].filter(c => !suppressed.has(c.fingerprint));

    const matches = matchCandidatesToSlots(allCands, slots, now, MAX_SUGGESTIONS, {
      timezone:                     prefs.timezone,
      prefer_morning_for_deep_work: prefs.prefer_morning_for_deep_work,
    });

    logHallEvent({
      source: "suggested-time-blocks", type: "stb_suggestions_generated", user_email: email,
      metadata: {
        slots_found:          slots.length,
        candidates_considered: allCands.length,
        loop_candidates:       loopCands.length,
        opportunity_candidates: oppCands.length,
        prep_candidates:       prepCands.length,
        followup_candidates:   followUpCands.length,
        suppressed_count:      suppressed.size,
      },
    });

    if (matches.length === 0) {
      logHallEvent({
        source: "suggested-time-blocks", type: "stb_no_strong_candidates", user_email: email,
        metadata: { slots_found: slots.length, candidates_considered: allCands.length },
      });
      return NextResponse.json({
        mode: "empty",
        suggestions: [],
        reason: "No candidates matched available slots.",
      });
    }

    // Expire previous suggested rows
    await sb
      .from("suggested_time_blocks")
      .update({ status: "expired" })
      .eq("user_email", email)
      .eq("status", "suggested");

    // Insert fresh rows — cap the actual start/end to the right-sized block so
    // the Google Calendar event we later create is never the full open slot.
    // Without this cap, a 45-minute prep task dropped into a 4-hour slot would
    // materialise on the calendar as a 4-hour event.
    const inserted = matches.map(m => {
      const cappedMin  = Math.min(m.slot.durationMin, m.candidate.duration_min + 15);
      const startDate  = m.slot.start;
      const endDate    = new Date(startDate.getTime() + cappedMin * 60_000);
      return {
        user_email:           email,
        title:                m.candidate.title,
        linked_entity_type:   m.candidate.entity_type,
        linked_entity_id:     m.candidate.entity_id,
        linked_entity_label:  m.candidate.entity_label,
        suggested_start_time: startDate.toISOString(),
        suggested_end_time:   endDate.toISOString(),
        duration_minutes:     cappedMin,
        task_type:            m.candidate.task_type,
        urgency_score:        m.candidate.urgency_score,
        confidence_score:     m.candidate.confidence_score,
        why_now:              m.candidate.why_now,
        expected_outcome:     m.candidate.expected_outcome,
        fingerprint:          m.candidate.fingerprint,
        status:               "suggested",
      };
    });
    const { data: saved, error: insertErr } = await sb
      .from("suggested_time_blocks")
      .insert(inserted)
      .select("id,title,linked_entity_type,linked_entity_id,linked_entity_label,suggested_start_time,suggested_end_time,duration_minutes,task_type,urgency_score,confidence_score,why_now,expected_outcome,fingerprint,status,generated_at,gcal_event_link");

    if (insertErr) {
      return NextResponse.json({ error: "insert_failed", message: insertErr.message }, { status: 500 });
    }

    // Attach slot label for client display
    const suggestions = (saved ?? []).map((row, i) => ({
      ...formatForClient(row as StoredBlock, prefs.timezone),
      slot_label: formatSlotLabel(matches[i].slot, prefs.timezone),
    }));

    logHallEvent({
      source: "suggested-time-blocks", type: "stb_suggestions_matched", user_email: email,
      metadata: { matched: suggestions.length, mode: "fresh" },
    });
    logHallEvent({
      source: "suggested-time-blocks", type: "stb_returned_fresh", user_email: email,
      metadata: { count: suggestions.length },
    });

    return NextResponse.json({
      mode: "fresh",
      suggestions,
      slots_found: slots.length,
      candidates_considered: allCands.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind = classifyGoogleError(err);
    const errorCode =
      kind === "scope_missing" ? "calendar_scope_missing"
      : kind === "auth_revoked" ? "calendar_auth_revoked"
      : "generation_failed";
    logHallEvent({
      source: "suggested-time-blocks", type: "stb_calendar_auth_error", user_email: email,
      metadata: { error_code: errorCode, message: message.slice(0, 240) },
    });
    return NextResponse.json({ error: errorCode, message }, { status: 502 });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function listPastMeetings(daysBack: number) {
  const { getCalendarClient, CALENDAR_ID } = await import("@/lib/google-calendar");
  const cal = getCalendarClient();
  if (!cal) return [];
  const now = new Date();
  const start = new Date(now.getTime() - daysBack * 24 * 3600_000);
  const res = await cal.events.list({
    calendarId:   CALENDAR_ID,
    timeMin:      start.toISOString(),
    timeMax:      now.toISOString(),
    singleEvents: true,
    orderBy:      "startTime",
    maxResults:   30,
  });
  const out: import("@/lib/calendar-slots").UpcomingMeeting[] = [];
  for (const e of res.data.items ?? []) {
    const startIso = e.start?.dateTime ?? null;
    const endIso   = e.end?.dateTime   ?? null;
    if (!startIso || !endIso || !e.id) continue;
    const attendees = (e.attendees ?? []).filter(a => !a.resource);
    if (attendees.length === 0) continue;
    if (e.status === "cancelled") continue;
    const structured = attendees.map(a => ({
      email:          (a.email ?? "").toLowerCase(),
      displayName:    a.displayName ?? null,
      responseStatus: (["accepted", "tentative", "needsAction", "declined"] as const).includes(
        a.responseStatus as never,
      )
        ? (a.responseStatus as "accepted" | "tentative" | "needsAction" | "declined")
        : "unknown" as const,
      self:           a.self === true,
    })).filter(a => a.email);
    out.push({
      id:             e.id,
      title:          e.summary || "(untitled meeting)",
      description:    (e.description ?? "").trim(),
      start:          new Date(startIso),
      end:            new Date(endIso),
      attendeeCount:  structured.filter(a => a.responseStatus !== "declined").length,
      organizerEmail: e.organizer?.email?.toLowerCase() ?? null,
      htmlLink:       e.htmlLink ?? "",
      attendees:      structured,
    });
  }
  return out;
}

function formatForClient(row: StoredBlock, tz: string) {
  return {
    id:                 row.id,
    title:              row.title,
    entity_type:        row.linked_entity_type,
    entity_id:          row.linked_entity_id,
    entity_label:       row.linked_entity_label,
    start:              row.suggested_start_time,
    end:                row.suggested_end_time,
    duration_min:       row.duration_minutes,
    task_type:          row.task_type,
    urgency_score:      row.urgency_score,
    confidence_score:   row.confidence_score,
    why_now:            row.why_now,
    expected_outcome:   row.expected_outcome,
    status:             row.status,
    gcal_event_link:    row.gcal_event_link,
    slot_label:         formatSlotLabel({
      start: new Date(row.suggested_start_time),
      end:   new Date(row.suggested_end_time),
      durationMin: row.duration_minutes,
      size: row.duration_minutes >= 90 ? "deep" : row.duration_minutes >= 45 ? "medium" : "quick",
    }, tz),
  };
}
