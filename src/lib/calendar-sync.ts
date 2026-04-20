/**
 * calendar-sync.ts
 *
 * Delta-aware ingestion of Google Calendar events for the Hall intelligence
 * layer. Uses the Google Calendar sync token protocol so repeated runs only
 * see genuinely new / changed / cancelled events.
 *
 * Why delta instead of re-read:
 *   - A recurring /cron tick every 4h over a week produces ~42 reads of the
 *     same event. Naive observe-and-increment would corrupt meeting_count.
 *   - Sync tokens tell Google "only give me what changed since last call".
 *     Events unchanged since last sync do not come back at all.
 *
 * Persisted state:
 *   - hall_calendar_sync_state.sync_token       — cursor for next delta call
 *   - hall_calendar_events                      — observed events (dedup key)
 *   - hall_attendees.meeting_count              — incremented only on NEW
 *                                                  event_ids; decremented on
 *                                                  cancellations
 *
 * Failure modes handled:
 *   - 410 "sync token expired" → delete the token, redo full sync
 *   - Google unavailable       → function returns { ok: false }, state unchanged
 */

import { google, calendar_v3 } from "googleapis";
import { getGoogleAuthClient } from "./google-auth";
import { getSupabaseServerClient } from "./supabase-server";
import { CALENDAR_ID } from "./google-calendar";
import type { MeetingAttendee } from "./calendar-slots";

const SYNC_SCOPE = "primary";

export type CalendarSyncResult = {
  ok:              boolean;
  mode:            "full" | "delta" | "error";
  new_events:      number;
  updated_events:  number;
  cancelled_events: number;
  attendee_upserts: number;
  reason?:         string;
};

type ObservedEvent = {
  event_id:          string;
  event_start:       string | null;
  event_end:         string | null;
  event_title:       string;
  organizer_email:   string | null;
  html_link:         string | null;
  attendees:         MeetingAttendee[];
  is_cancelled:      boolean;
};

// ─── Google event → normalized shape ────────────────────────────────────────

function normalizeEvent(e: calendar_v3.Schema$Event): ObservedEvent | null {
  if (!e.id) return null;
  const isCancelled = e.status === "cancelled";

  // For cancelled events Google sometimes returns only { id, status } — we
  // still emit an ObservedEvent so the downstream pipeline can decrement.
  const attendeesRaw = (e.attendees ?? []).filter(a => !a.resource);
  const structured: MeetingAttendee[] = attendeesRaw.map(a => ({
    email:          (a.email ?? "").toLowerCase(),
    displayName:    a.displayName ?? null,
    responseStatus: (["accepted", "tentative", "needsAction", "declined"] as const).includes(
      a.responseStatus as never,
    )
      ? (a.responseStatus as MeetingAttendee["responseStatus"])
      : "unknown",
    self:           a.self === true,
  })).filter(a => a.email);

  return {
    event_id:        e.id,
    event_start:     e.start?.dateTime ?? e.start?.date ?? null,
    event_end:       e.end?.dateTime   ?? e.end?.date   ?? null,
    event_title:     e.summary || "(untitled)",
    organizer_email: e.organizer?.email?.toLowerCase() ?? null,
    html_link:       e.htmlLink ?? null,
    attendees:       structured,
    is_cancelled:    isCancelled,
  };
}

// ─── Dedup-aware attendee accounting ─────────────────────────────────────────

type DbEventRow = {
  event_id:        string;
  attendee_emails: string[] | null;
  is_cancelled:    boolean | null;
};

/** Emails that count for meeting_count — non-self, non-declined, non-empty. */
function countableEmails(attendees: MeetingAttendee[]): string[] {
  const out: string[] = [];
  for (const a of attendees) {
    if (a.self) continue;
    if (a.responseStatus === "declined") continue;
    if (!a.email) continue;
    out.push(a.email);
  }
  return [...new Set(out)];
}

async function applyEventsToAttendees(
  events: ObservedEvent[],
  stats: { new_events: number; updated_events: number; cancelled_events: number; attendee_upserts: number },
): Promise<void> {
  if (events.length === 0) return;
  const sb = getSupabaseServerClient();

  // 1) Load prior state for this batch of event_ids
  const eventIds = events.map(e => e.event_id);
  const { data: priorRows } = await sb
    .from("hall_calendar_events")
    .select("event_id, attendee_emails, is_cancelled")
    .in("event_id", eventIds);
  const priorByEvent = new Map<string, DbEventRow>();
  for (const r of (priorRows ?? []) as DbEventRow[]) priorByEvent.set(r.event_id, r);

  // 2) Net deltas per attendee email: +1 for each net-new event credit,
  //    -1 for each credit we are revoking.
  const net = new Map<string, number>();
  const bump = (email: string, d: number) => {
    if (!email) return;
    net.set(email, (net.get(email) ?? 0) + d);
  };

  const upsertRows: Array<Record<string, unknown>> = [];
  const nowIso = new Date().toISOString();

  for (const ev of events) {
    const prior = priorByEvent.get(ev.event_id);
    const priorCountable = new Set(prior?.attendee_emails ?? []);
    const wasCancelled = prior?.is_cancelled === true;
    const wasNew = !prior;

    const currentCountable = new Set(ev.is_cancelled ? [] : countableEmails(ev.attendees));

    // Stats
    if (ev.is_cancelled && prior && !wasCancelled) stats.cancelled_events++;
    else if (wasNew && !ev.is_cancelled)           stats.new_events++;
    else if (prior && !ev.is_cancelled)            stats.updated_events++;

    // Attendee bookkeeping — cancellation revokes ALL prior credits.
    if (ev.is_cancelled) {
      for (const email of priorCountable) bump(email, -1);
    } else if (wasNew) {
      for (const email of currentCountable) bump(email, +1);
    } else {
      // Update: newly-added attendees +1, newly-removed -1, unchanged 0.
      // If the event was previously cancelled and is now un-cancelled
      // (Google sometimes revives events), treat all current as +1.
      if (wasCancelled) {
        for (const email of currentCountable) bump(email, +1);
      } else {
        for (const email of currentCountable) if (!priorCountable.has(email)) bump(email, +1);
        for (const email of priorCountable)   if (!currentCountable.has(email)) bump(email, -1);
      }
    }

    // Upsert hall_calendar_events row
    const attendee_statuses: Record<string, string> = {};
    for (const a of ev.attendees) if (a.email) attendee_statuses[a.email] = a.responseStatus;

    upsertRows.push({
      event_id:          ev.event_id,
      event_start:       ev.event_start,
      event_end:         ev.event_end,
      event_title:       ev.event_title.slice(0, 500),
      organizer_email:   ev.organizer_email,
      html_link:         ev.html_link,
      attendee_emails:   [...currentCountable],
      attendee_statuses,
      is_cancelled:      ev.is_cancelled,
      last_observed_at:  nowIso,
      updated_at:        nowIso,
    });
  }

  // 3) Write the event rows
  if (upsertRows.length > 0) {
    await sb.from("hall_calendar_events").upsert(upsertRows, { onConflict: "event_id" });
  }

  // 4) Apply attendee deltas
  const emailsAffected = [...net.entries()].filter(([, d]) => d !== 0);
  if (emailsAffected.length === 0) return;

  const emails = emailsAffected.map(([e]) => e);
  const { data: existingAttendees } = await sb
    .from("hall_attendees")
    .select("email, meeting_count, first_seen_at")
    .in("email", emails);
  const existingByEmail = new Map<string, { meeting_count: number; first_seen_at: string | null }>();
  for (const r of (existingAttendees ?? []) as { email: string; meeting_count: number; first_seen_at: string | null }[]) {
    existingByEmail.set(r.email, { meeting_count: r.meeting_count ?? 0, first_seen_at: r.first_seen_at });
  }

  // Build enrichment metadata from the batch: pick latest displayName + title per email
  const meta = new Map<string, { display_name: string | null; last_meeting_title: string; last_seen_at: string }>();
  for (const ev of events) {
    if (ev.is_cancelled) continue;
    if (!ev.event_start) continue;
    for (const a of ev.attendees) {
      if (a.self || !a.email) continue;
      const prior = meta.get(a.email);
      if (!prior || ev.event_start > prior.last_seen_at) {
        meta.set(a.email, {
          display_name:       a.displayName,
          last_meeting_title: ev.event_title,
          last_seen_at:       ev.event_start,
        });
      }
    }
  }

  const rows = emailsAffected.map(([email, delta]) => {
    const existing = existingByEmail.get(email);
    const newCount = Math.max(0, (existing?.meeting_count ?? 0) + delta);
    const m = meta.get(email);
    const row: Record<string, unknown> = {
      email,
      meeting_count: newCount,
      updated_at:    nowIso,
    };
    if (m) {
      row.display_name       = m.display_name;
      row.last_meeting_title = m.last_meeting_title;
      row.last_seen_at       = m.last_seen_at;
    }
    return row;
  });

  await sb.from("hall_attendees").upsert(rows, { onConflict: "email", ignoreDuplicates: false });
  stats.attendee_upserts += rows.length;
}

// ─── Sync state helpers ─────────────────────────────────────────────────────

async function loadSyncToken(): Promise<string | null> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("hall_calendar_sync_state")
    .select("sync_token")
    .eq("scope", SYNC_SCOPE)
    .maybeSingle();
  return (data as { sync_token: string | null } | null)?.sync_token ?? null;
}

async function saveSyncToken(token: string | null, mode: "full" | "delta", eventCount: number): Promise<void> {
  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  await sb.from("hall_calendar_sync_state").upsert({
    scope:                  SYNC_SCOPE,
    sync_token:             token,
    ...(mode === "full"  ? { last_full_sync_at:  nowIso } : {}),
    ...(mode === "delta" ? { last_delta_sync_at: nowIso } : {}),
    last_delta_event_count: eventCount,
    updated_at:             nowIso,
  }, { onConflict: "scope" });
}

// ─── Main entry ─────────────────────────────────────────────────────────────

/**
 * Run one sync pass against Google Calendar. Delta if we have a token,
 * full otherwise. Idempotent — safe to call on page load + cron + STB run.
 */
export async function syncCalendarDelta(): Promise<CalendarSyncResult> {
  const auth = getGoogleAuthClient();
  if (!auth.ok) {
    return {
      ok: false, mode: "error",
      new_events: 0, updated_events: 0, cancelled_events: 0, attendee_upserts: 0,
      reason: "no_google_auth",
    };
  }
  const cal = google.calendar({ version: "v3", auth: auth.client });

  const stored = await loadSyncToken();
  const stats = { new_events: 0, updated_events: 0, cancelled_events: 0, attendee_upserts: 0 };

  // Page through all results (Google paginates delta too).
  const allEvents: calendar_v3.Schema$Event[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let mode: "full" | "delta" = stored ? "delta" : "full";

  try {
    do {
      const req: calendar_v3.Params$Resource$Events$List = {
        calendarId:   CALENDAR_ID,
        singleEvents: true,
        maxResults:   250,
        pageToken:    nextPageToken,
      };
      if (stored && !nextPageToken) {
        req.syncToken = stored;
      } else if (!stored && !nextPageToken) {
        // Full sync — bound by a conservative window so the first run is
        // cheap. After this we rely on delta for everything.
        const now = new Date();
        req.timeMin = new Date(now.getTime() - 2 * 24 * 3600_000).toISOString();
        req.timeMax = new Date(now.getTime() + 14 * 24 * 3600_000).toISOString();
        req.orderBy = "startTime";
      }
      const res = await cal.events.list(req);
      allEvents.push(...(res.data.items ?? []));
      nextPageToken = res.data.nextPageToken ?? undefined;
      nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
    } while (nextPageToken);
  } catch (err) {
    const code = (err as { code?: number })?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === 410 || /sync token/i.test(message)) {
      // Token expired → reset and let the next call do a full sync.
      await saveSyncToken(null, "full", 0);
      return {
        ok: true, mode: "error",
        ...stats,
        reason: "sync_token_expired_reset",
      };
    }
    return { ok: false, mode: "error", ...stats, reason: message.slice(0, 200) };
  }

  // Normalize + filter. Keep cancelled events so we can decrement. Drop
  // events with no dateTime (all-day blocks) and events with no attendees
  // that were never in our store (no work to do).
  const normalized: ObservedEvent[] = [];
  for (const raw of allEvents) {
    const ev = normalizeEvent(raw);
    if (!ev) continue;
    if (ev.is_cancelled) {
      // Always include cancellation signals — downstream checks prior state.
      normalized.push(ev);
      continue;
    }
    if (!ev.event_start || !ev.event_end) continue;              // all-day
    const hasTime = /T\d{2}/.test(ev.event_start);
    if (!hasTime) continue;
    if (ev.attendees.length === 0) continue;                     // personal block, no attendees
    normalized.push(ev);
  }

  if (normalized.length > 0) {
    await applyEventsToAttendees(normalized, stats);
  }

  if (nextSyncToken) await saveSyncToken(nextSyncToken, mode, normalized.length);

  return {
    ok:               true,
    mode,
    new_events:       stats.new_events,
    updated_events:   stats.updated_events,
    cancelled_events: stats.cancelled_events,
    attendee_upserts: stats.attendee_upserts,
  };
}
