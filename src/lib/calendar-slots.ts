/**
 * calendar-slots.ts
 * Layer A of Suggested Time Blocks — Calendar Intelligence.
 *
 * Reads busy blocks and upcoming meetings from Google Calendar, then
 * produces usable working-hours slots with the right buffer + duration buckets.
 */

import { getCalendarClient, CALENDAR_ID, HALL_TIMEZONE } from "./google-calendar";

/** A time-of-day in the working-hours window (local to HALL_TIMEZONE). */
const WORK_START_HOUR = 9;
const WORK_END_HOUR   = 18;
/** Buffer around meetings, in minutes. */
const MEETING_BUFFER_MIN = 10;
/** Below this many contiguous minutes we don't produce a slot. */
const MIN_SLOT_MIN = 20;
/** Lunch gap treatment: we block 12:30-13:30 as unbookable. */
const LUNCH_START_HOUR = 12;
const LUNCH_START_MIN  = 30;
const LUNCH_END_HOUR   = 13;
const LUNCH_END_MIN    = 30;

export type BusyBlock = { start: Date; end: Date };

export type UpcomingMeeting = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  attendeeCount: number;
  organizerEmail: string | null;
  htmlLink: string;
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

export async function listBusyBlocks(daysAhead: number): Promise<BusyBlock[]> {
  const cal = getCalendarClient();
  if (!cal) throw new Error("Calendar client unavailable: GMAIL_* env vars missing.");
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 24 * 3600_000);
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      items:   [{ id: CALENDAR_ID }],
      timeZone: HALL_TIMEZONE,
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
    out.push({
      id:             e.id,
      title:          e.summary || "(untitled meeting)",
      start:          new Date(startIso),
      end:            new Date(endIso),
      attendeeCount:  attendees.length,
      organizerEmail: e.organizer?.email ?? null,
      htmlLink:       e.htmlLink ?? "",
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

/** Generate working-hour windows (one per weekday) within [now, end]. */
function workingHourWindows(now: Date, end: Date): { start: Date; end: Date }[] {
  const windows: { start: Date; end: Date }[] = [];
  const tz = HALL_TIMEZONE;
  // Walk day by day in HALL_TIMEZONE
  const startWc = wallClockInTZ(now, tz);
  let cursor = wallToUTC(tz, startWc.y, startWc.mo, startWc.da, 0, 0);
  // Cap iterations defensively.
  for (let i = 0; i < 14; i++) {
    const cWc = wallClockInTZ(cursor, tz);
    if (cursor.getTime() > end.getTime()) break;
    if (cWc.wd >= 1 && cWc.wd <= 5) {
      const winStart = wallToUTC(tz, cWc.y, cWc.mo, cWc.da, WORK_START_HOUR, 0);
      const winEnd   = wallToUTC(tz, cWc.y, cWc.mo, cWc.da, WORK_END_HOUR, 0);
      const effStart = winStart.getTime() < now.getTime() ? now : winStart;
      if (effStart.getTime() < winEnd.getTime()) {
        windows.push({ start: effStart, end: winEnd });
      }
    }
    // Advance 1 day. Use 25h step to safely cross DST.
    cursor = new Date(cursor.getTime() + 25 * 3600_000);
    const nextWc = wallClockInTZ(cursor, tz);
    cursor = wallToUTC(tz, nextWc.y, nextWc.mo, nextWc.da, 0, 0);
  }
  return windows;
}

/** Return lunch break blocks for each window's date so we don't schedule over lunch. */
function lunchBlocksForWindows(windows: { start: Date; end: Date }[]): BusyBlock[] {
  const tz = HALL_TIMEZONE;
  return windows.map(w => {
    const wc = wallClockInTZ(w.start, tz);
    return {
      start: wallToUTC(tz, wc.y, wc.mo, wc.da, LUNCH_START_HOUR, LUNCH_START_MIN),
      end:   wallToUTC(tz, wc.y, wc.mo, wc.da, LUNCH_END_HOUR,   LUNCH_END_MIN),
    };
  });
}

/** Subtract busy blocks (with buffer) from working windows and return slots. */
export function findOpenSlots(
  now: Date,
  daysAhead: number,
  busy: BusyBlock[],
  meetings: UpcomingMeeting[],
): Slot[] {
  const end = new Date(now.getTime() + daysAhead * 24 * 3600_000);
  const windows = workingHourWindows(now, end);
  if (windows.length === 0) return [];

  // Expand busy blocks by buffer
  const buffered: BusyBlock[] = busy.map(b => ({
    start: new Date(b.start.getTime() - MEETING_BUFFER_MIN * 60_000),
    end:   new Date(b.end.getTime()   + MEETING_BUFFER_MIN * 60_000),
  }));

  // Add lunch as busy
  const lunch = lunchBlocksForWindows(windows);
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
        if (durMin >= MIN_SLOT_MIN) {
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
      if (durMin >= MIN_SLOT_MIN) {
        slots.push({
          start: cursor,
          end:   win.end,
          durationMin: Math.floor(durMin),
          size: classifySize(durMin),
        });
      }
    }
  }

  // Link slots to adjacent meetings (for prep/follow-up matching).
  const sortedMtgs = [...meetings].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const s of slots) {
    const prev = [...sortedMtgs].reverse().find(m => m.end.getTime() <= s.start.getTime() && s.start.getTime() - m.end.getTime() <= 6 * 3600_000);
    const next = sortedMtgs.find(m => m.start.getTime() >= s.end.getTime()  && m.start.getTime() - s.end.getTime()  <= 24 * 3600_000);
    s.prevMeeting = prev;
    s.nextMeeting = next;
  }

  return slots;
}

/** Human-readable window string (e.g. "Thu 14:00–15:30"). */
export function formatSlotLabel(s: Slot): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: HALL_TIMEZONE,
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: HALL_TIMEZONE,
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return `${fmt.format(s.start)}–${fmtTime.format(s.end)}`;
}
