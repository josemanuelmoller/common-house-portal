/**
 * calendar-slots.ts
 * Layer A of Suggested Time Blocks — Calendar Intelligence.
 *
 * Reads busy blocks and upcoming meetings from Google Calendar, then
 * produces usable working-hours slots with the right buffer + duration buckets.
 */

import { getCalendarClient, CALENDAR_ID } from "./google-calendar";
import { HALL_PREFS_DEFAULTS, type HallPreferences } from "./hall-preferences";

/**
 * Resolved slot-generation options. Pass in from a HallPreferences row (which
 * defaults to HALL_PREFS_DEFAULTS if the user has no row yet).
 */
export type SlotOptions = Pick<
  HallPreferences,
  | "working_day_start"
  | "working_day_end"
  | "working_days"
  | "min_slot_minutes"
  | "timezone"
  | "lunch_start_hour"
  | "lunch_start_min"
  | "lunch_end_hour"
  | "lunch_end_min"
  | "meeting_buffer_minutes"
>;

export const DEFAULT_SLOT_OPTIONS: SlotOptions = HALL_PREFS_DEFAULTS;

export type BusyBlock = { start: Date; end: Date };

export type MeetingAttendee = {
  email: string;
  displayName: string | null;
  responseStatus: "accepted" | "tentative" | "needsAction" | "declined" | "unknown";
  self: boolean;
};

export type UpcomingMeeting = {
  id: string;
  title: string;
  /** Raw meeting description from Google Calendar. Used to gate prep tasks:
   * a meeting with no context (no description, no VIP, no multi-party invite
   * list) does not deserve a prep block. */
  description: string;
  start: Date;
  end: Date;
  attendeeCount: number;
  organizerEmail: string | null;
  htmlLink: string;
  attendees: MeetingAttendee[];
};

export type Slot = {
  start: Date;
  end: Date;
  durationMin: number;
  size: "quick" | "medium" | "deep";
  /** Nearest meeting immediately before this slot, if any. */
  prevMeeting?: UpcomingMeeting;
  /** Nearest meeting immediately after this slot, if any. */
  nextMeeting?: UpcomingMeeting;
};

// ─── Timezone helpers ────────────────────────────────────────────────────────
// We compute working-hours boundaries in HALL_TIMEZONE by rendering the wall
// clock with Intl.DateTimeFormat and converting back via UTC math. This avoids
// pulling in date-fns-tz for one function.

function wallClockInTZ(d: Date, tz: string): { y: number; mo: number; da: number; h: number; mi: number; wd: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
    hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y:  Number(p.year),
    mo: Number(p.month),
    da: Number(p.day),
    h:  Number(p.hour === "24" ? "0" : p.hour),
    mi: Number(p.minute),
    wd: wdMap[p.weekday] ?? 0,
  };
}

/** Build a UTC Date that corresponds to a specific wall time in HALL_TIMEZONE.
 * Iterative: guess, measure drift, correct. Handles DST transitions. */
function wallToUTC(tz: string, y: number, mo: number, da: number, h: number, mi: number): Date {
  let guess = new Date(Date.UTC(y, mo - 1, da, h, mi, 0, 0));
  for (let i = 0; i < 3; i++) {
    const wc = wallClockInTZ(guess, tz);
    const diffMin =
      ((y  - wc.y) * 365 * 24 * 60) +   // coarse; usually 0
      ((mo - wc.mo) * 30 * 24 * 60) +
      ((da - wc.da) * 24 * 60) +
      ((h  - wc.h) * 60) +
      (mi - wc.mi);
    if (Math.abs(diffMin) < 0.5) break;
    guess = new Date(guess.getTime() + diffMin * 60_000);
  }
  return guess;
}

// ─── Read calendar ───────────────────────────────────────────────────────────

export async function listBusyBlocks(daysAhead: number, tz: string = DEFAULT_SLOT_OPTIONS.timezone): Promise<BusyBlock[]> {
  const cal = getCalendarClient();
  if (!cal) throw new Error("Calendar client unavailable: GMAIL_* env vars missing.");
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 24 * 3600_000);
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      items:   [{ id: CALENDAR_ID }],
      timeZone: tz,
    },
  });
  const raw = res.data.calendars?.[CALENDAR_ID]?.busy ?? [];
  return raw
    .filter(b => b.start && b.end)
    .map(b => ({ start: new Date(b.start as string), end: new Date(b.end as string) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function listUpcomingMeetings(daysAhead: number): Promise<UpcomingMeeting[]> {
  const cal = getCalendarClient();
  if (!cal) throw new Error("Calendar client unavailable: GMAIL_* env vars missing.");
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 24 * 3600_000);
  const res = await cal.events.list({
    calendarId:    CALENDAR_ID,
    timeMin:       now.toISOString(),
    timeMax:       end.toISOString(),
    singleEvents:  true,
    orderBy:       "startTime",
    maxResults:    50,
  });
  const out: UpcomingMeeting[] = [];
  for (const e of res.data.items ?? []) {
    const startIso = e.start?.dateTime ?? null;
    const endIso   = e.end?.dateTime   ?? null;
    if (!startIso || !endIso || !e.id) continue;             // skip all-day
    const attendees = (e.attendees ?? []).filter(a => !a.resource);
    if (attendees.length === 0) continue;                     // not a meeting — likely a block
    if (e.status === "cancelled") continue;

    const structuredAttendees: MeetingAttendee[] = attendees.map(a => ({
      email:          (a.email ?? "").toLowerCase(),
      displayName:    a.displayName ?? null,
      responseStatus: (["accepted", "tentative", "needsAction", "declined"] as const).includes(
        a.responseStatus as never,
      )
        ? (a.responseStatus as MeetingAttendee["responseStatus"])
        : "unknown",
      self:           a.self === true,
    })).filter(a => a.email);

    out.push({
      id:             e.id,
      title:          e.summary || "(untitled meeting)",
      description:    (e.description ?? "").trim(),
      start:          new Date(startIso),
      end:            new Date(endIso),
      attendeeCount:  structuredAttendees.filter(a => a.responseStatus !== "declined").length,
      organizerEmail: e.organizer?.email?.toLowerCase() ?? null,
      htmlLink:       e.htmlLink ?? "",
      attendees:      structuredAttendees,
    });
  }
  return out;
}

// ─── Slot finder ─────────────────────────────────────────────────────────────

function classifySize(min: number): Slot["size"] {
  if (min >= 90) return "deep";
  if (min >= 45) return "medium";
  return "quick";
}

/** Generate working-hour windows (one per working day) within [now, end]. */
function workingHourWindows(now: Date, end: Date, opts: SlotOptions): { start: Date; end: Date }[] {
  const windows: { start: Date; end: Date }[] = [];
  const tz = opts.timezone;
  const startWc = wallClockInTZ(now, tz);
  let cursor = wallToUTC(tz, startWc.y, startWc.mo, startWc.da, 0, 0);
  const workingDays = new Set(opts.working_days);
  for (let i = 0; i < 14; i++) {
    const cWc = wallClockInTZ(cursor, tz);
    if (cursor.getTime() > end.getTime()) break;
    if (workingDays.has(cWc.wd)) {
      const winStart = wallToUTC(tz, cWc.y, cWc.mo, cWc.da, opts.working_day_start, 0);
      const winEnd   = wallToUTC(tz, cWc.y, cWc.mo, cWc.da, opts.working_day_end,   0);
      const effStart = winStart.getTime() < now.getTime() ? now : winStart;
      if (effStart.getTime() < winEnd.getTime()) {
        windows.push({ start: effStart, end: winEnd });
      }
    }
    cursor = new Date(cursor.getTime() + 25 * 3600_000);
    const nextWc = wallClockInTZ(cursor, tz);
    cursor = wallToUTC(tz, nextWc.y, nextWc.mo, nextWc.da, 0, 0);
  }
  return windows;
}

/** Return lunch break blocks for each window's date so we don't schedule over lunch. */
function lunchBlocksForWindows(windows: { start: Date; end: Date }[], opts: SlotOptions): BusyBlock[] {
  const tz = opts.timezone;
  // Zero-length lunch (start==end) → skip; lets users disable lunch by setting equal values.
  if (opts.lunch_start_hour === opts.lunch_end_hour && opts.lunch_start_min === opts.lunch_end_min) {
    return [];
  }
  return windows.map(w => {
    const wc = wallClockInTZ(w.start, tz);
    return {
      start: wallToUTC(tz, wc.y, wc.mo, wc.da, opts.lunch_start_hour, opts.lunch_start_min),
      end:   wallToUTC(tz, wc.y, wc.mo, wc.da, opts.lunch_end_hour,   opts.lunch_end_min),
    };
  });
}

/** Subtract busy blocks (with buffer) from working windows and return slots. */
export function findOpenSlots(
  now: Date,
  daysAhead: number,
  busy: BusyBlock[],
  meetings: UpcomingMeeting[],
  opts: SlotOptions = DEFAULT_SLOT_OPTIONS,
): Slot[] {
  const end = new Date(now.getTime() + daysAhead * 24 * 3600_000);
  const windows = workingHourWindows(now, end, opts);
  if (windows.length === 0) return [];

  const bufferMs = opts.meeting_buffer_minutes * 60_000;
  const buffered: BusyBlock[] = busy.map(b => ({
    start: new Date(b.start.getTime() - bufferMs),
    end:   new Date(b.end.getTime()   + bufferMs),
  }));
  const lunch = lunchBlocksForWindows(windows, opts);
  const allBusy = [...buffered, ...lunch].sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: Slot[] = [];
  for (const win of windows) {
    let cursor = win.start;
    for (const b of allBusy) {
      if (b.end.getTime() <= win.start.getTime()) continue;
      if (b.start.getTime() >= win.end.getTime()) break;
      const busyStart = b.start.getTime() < win.start.getTime() ? win.start : b.start;
      const busyEnd   = b.end.getTime()   > win.end.getTime()   ? win.end   : b.end;
      if (cursor.getTime() < busyStart.getTime()) {
        const durMin = (busyStart.getTime() - cursor.getTime()) / 60_000;
        if (durMin >= opts.min_slot_minutes) {
          slots.push({
            start: cursor,
            end:   busyStart,
            durationMin: Math.floor(durMin),
            size: classifySize(durMin),
          });
        }
      }
      if (busyEnd.getTime() > cursor.getTime()) cursor = busyEnd;
    }
    if (cursor.getTime() < win.end.getTime()) {
      const durMin = (win.end.getTime() - cursor.getTime()) / 60_000;
      if (durMin >= opts.min_slot_minutes) {
        slots.push({
          start: cursor,
          end:   win.end,
          durationMin: Math.floor(durMin),
          size: classifySize(durMin),
        });
      }
    }
  }

  const sortedMtgs = [...meetings].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const s of slots) {
    const prev = [...sortedMtgs].reverse().find(m => m.end.getTime() <= s.start.getTime() && s.start.getTime() - m.end.getTime() <= 6 * 3600_000);
    const next = sortedMtgs.find(m => m.start.getTime() >= s.end.getTime()  && m.start.getTime() - s.end.getTime()  <= 24 * 3600_000);
    s.prevMeeting = prev;
    s.nextMeeting = next;
  }

  return slots;
}

/** Human-readable window string (e.g. "Thu 14:00–15:30") in the given timezone. */
export function formatSlotLabel(s: Slot, tz: string = DEFAULT_SLOT_OPTIONS.timezone): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return `${fmt.format(s.start)}–${fmtTime.format(s.end)}`;
}
