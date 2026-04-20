/**
 * meeting-classifier.ts
 *
 * Layer B.5 of Suggested Time Blocks — derives *who* is in each meeting and
 * turns that into classification flags the candidate generator uses.
 *
 * Never blocks a meeting from the calendar (STB still treats every meeting as
 * busy time for slot-finding). Only controls whether prep / follow-up tasks
 * are emitted, and adjusts urgency for VIP meetings.
 *
 * Rule layout:
 *   is_personal  — all non-self non-declined attendees classified Family |
 *                  Personal Service | Friend  → skip prep/follow-up entirely
 *   has_vip      — any non-self accepted attendee classified Investor |
 *                  Funder | Portfolio  → boost urgency on the prep candidate
 *
 * Unknown attendees are observed so Jose can label them in /admin/hall/contacts.
 */

import { getSupabaseServerClient } from "./supabase-server";
import type { MeetingAttendee, UpcomingMeeting } from "./calendar-slots";
import { lookupByEmails as googleLookupByEmails } from "./google-contacts";

/**
 * Cache TTL for Google Contacts resolution. Contacts change infrequently, so
 * 24h keeps the classifier fast (one People API call per STB run, for the
 * handful of attendees whose cache is stale). Manual re-tag via
 * /api/hall-contacts forces immediate refresh on that email.
 */
const GOOGLE_CACHE_TTL_MS = 24 * 3600_000;

export type RelationshipClass =
  | "Family"
  | "Personal Service"
  | "Friend"
  | "Team"
  | "Portfolio"
  | "Investor"
  | "Funder"
  | "Vendor"
  | "External";

const PERSONAL_CLASSES: ReadonlySet<string> = new Set(["Family", "Personal Service", "Friend"]);
const VIP_CLASSES:      ReadonlySet<string> = new Set(["Investor", "Funder", "Portfolio"]);

/**
 * Multi-tag by design: a single attendee can carry multiple classes (e.g.
 * Jose's brother is Family AND CH Team). Returning an empty array means
 * "unknown" — the classifier fails open.
 */
export type AttendeeLookup = Map<string, RelationshipClass[]>;

/**
 * Resolve relationship_class for each email via a read-through cache:
 *   1. Look up each email in hall_attendees (Supabase)
 *   2. Emails with relationship_class explicitly set (human-tagged locally)
 *      win immediately — no People API call.
 *   3. Emails with NO local class but fresh Google sync (<TTL) use the
 *      cached google-derived class.
 *   4. Anything else hits People API once; results are cached for next run.
 *
 * Never throws — if Google/Supabase is unreachable the missing emails
 * simply resolve to null (unknown → fail-open in the gate).
 */
export async function loadAttendeeClasses(emails: string[]): Promise<AttendeeLookup> {
  const out: AttendeeLookup = new Map();
  const unique = [...new Set(emails.map(e => e.toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return out;

  let sb;
  try { sb = getSupabaseServerClient(); } catch { sb = null; }

  type Row = {
    email: string;
    relationship_class:   string | null;   // legacy mirror
    relationship_classes: string[] | null; // canonical
    google_synced_at:     string | null;
  };
  let rows: Row[] = [];
  if (sb) {
    try {
      const { data } = await sb
        .from("hall_attendees")
        .select("email, relationship_class, relationship_classes, google_synced_at")
        .in("email", unique);
      rows = (data ?? []) as Row[];
    } catch { /* ignore */ }
  }

  const byEmail = new Map<string, Row>();
  for (const r of rows) byEmail.set(r.email, r);

  const needGoogle: string[] = [];
  const cutoff = Date.now() - GOOGLE_CACHE_TTL_MS;

  for (const email of unique) {
    const row = byEmail.get(email);
    const classes: RelationshipClass[] = (row?.relationship_classes ?? []).filter(
      (c): c is RelationshipClass => !!c,
    ) as RelationshipClass[];
    if (classes.length > 0) {
      out.set(email, classes);
      continue;
    }
    const freshGoogle = row?.google_synced_at && new Date(row.google_synced_at).getTime() > cutoff;
    if (freshGoogle) {
      out.set(email, []);
      continue;
    }
    needGoogle.push(email);
  }

  if (needGoogle.length === 0) return out;

  // Hit People API for the stale/missing ones.
  let resolved: Awaited<ReturnType<typeof googleLookupByEmails>>;
  try {
    resolved = await googleLookupByEmails(needGoogle);
  } catch {
    for (const e of needGoogle) out.set(e, []);
    return out;
  }

  // Persist cache + derive classes in the same pass.
  const nowIso = new Date().toISOString();
  const updates: Array<{
    email: string;
    relationship_classes: string[];
    google_resource_name: string | null;
    google_source: string;
    google_labels: string[];
    google_synced_at: string;
    updated_at: string;
  }> = [];

  for (const email of needGoogle) {
    const r = resolved.get(email);
    const googleClasses = (r?.classes ?? []) as RelationshipClass[];
    out.set(email, googleClasses);
    updates.push({
      email,
      relationship_classes: googleClasses,
      google_resource_name: r?.resourceName ?? null,
      google_source:        r?.source ?? "not_found",
      google_labels:        r?.labels ?? [],
      google_synced_at:     nowIso,
      updated_at:           nowIso,
    });
  }

  if (sb && updates.length > 0) {
    try {
      // Never clobber a human-set tag set: if the row already has any
      // relationship_classes, skip the classes field in the upsert for that row.
      const { data: existing } = await sb
        .from("hall_attendees")
        .select("email, relationship_classes")
        .in("email", updates.map(u => u.email));
      const humanSet = new Set(
        ((existing ?? []) as { email: string; relationship_classes: string[] | null }[])
          .filter(r => (r.relationship_classes ?? []).length > 0)
          .map(r => r.email),
      );
      const safeUpdates = updates.map(u =>
        humanSet.has(u.email)
          ? { ...u, relationship_classes: undefined }
          : u,
      );
      await sb
        .from("hall_attendees")
        .upsert(safeUpdates, { onConflict: "email", ignoreDuplicates: false });
    } catch { /* cache write failures are non-critical */ }
  }

  return out;
}

/** All non-self, non-declined attendee emails across many meetings. Used for bulk lookup. */
export function collectNonSelfEmails(meetings: UpcomingMeeting[]): string[] {
  const out = new Set<string>();
  for (const m of meetings) {
    for (const a of m.attendees ?? []) {
      if (a.self) continue;
      if (a.responseStatus === "declined") continue;
      if (a.email) out.add(a.email);
    }
  }
  return [...out];
}

export type MeetingClassification = {
  is_personal: boolean;
  has_vip:     boolean;
  confirmed_count:   number;
  tentative_count:   number;
  needs_action_count: number;
  all_classes_present: RelationshipClass[][];
  unknown_attendees:  MeetingAttendee[];
};

export function classifyMeeting(
  m: UpcomingMeeting,
  lookup: AttendeeLookup,
): MeetingClassification {
  const nonSelf = (m.attendees ?? []).filter(a => !a.self && a.responseStatus !== "declined");
  let confirmed = 0, tentative = 0, needsAction = 0;
  for (const a of nonSelf) {
    if (a.responseStatus === "accepted") confirmed++;
    else if (a.responseStatus === "tentative") tentative++;
    else if (a.responseStatus === "needsAction") needsAction++;
  }

  // Per-attendee class arrays. Empty = unknown.
  const perAttendee: RelationshipClass[][] = nonSelf.map(a => lookup.get(a.email) ?? []);

  // is_personal: at least one non-self attendee, every attendee has ≥1 class,
  // AND every class of every attendee is personal. If any attendee is unknown
  // OR has any non-personal class (e.g. brother tagged Family + CH Team),
  // the meeting is treated as work and prep is still emitted.
  const is_personal =
    nonSelf.length > 0 &&
    perAttendee.every(classes =>
      classes.length > 0 && classes.every(c => PERSONAL_CLASSES.has(c)),
    );

  // has_vip: any class of any attendee is VIP.
  const has_vip = perAttendee.some(classes => classes.some(c => VIP_CLASSES.has(c)));

  const unknown_attendees = nonSelf.filter(a => (lookup.get(a.email) ?? []).length === 0);

  return {
    is_personal,
    has_vip,
    confirmed_count:    confirmed,
    tentative_count:    tentative,
    needs_action_count: needsAction,
    all_classes_present: perAttendee,
    unknown_attendees,
  };
}

/**
 * Dedup-aware observation: for each calendar event, increment meeting_count
 * only when the event_id has never been observed before. Attendees added or
 * removed mid-flight (e.g. someone accepts late, host swaps invitees) are
 * accounted for on subsequent passes.
 *
 * Source of dedup truth: hall_calendar_events (event_id PK). This keeps STB
 * runs, the /admin/hall/contacts auto-refresh, and the cron sync safe to call
 * redundantly — the meeting_count never inflates.
 */
export async function observeAttendees(meetings: UpcomingMeeting[]): Promise<void> {
  if (meetings.length === 0) return;
  const nowIso = new Date().toISOString();

  const sb = getSupabaseServerClient();

  // 1) Load prior state for these event_ids so we know what was already credited.
  const eventIds = meetings.map(m => m.id);
  type EventRow = { event_id: string; attendee_emails: string[] | null; is_cancelled: boolean | null };
  const { data: priorRows } = await sb
    .from("hall_calendar_events")
    .select("event_id, attendee_emails, is_cancelled")
    .in("event_id", eventIds);
  const priorByEvent = new Map<string, EventRow>();
  for (const r of (priorRows ?? []) as EventRow[]) priorByEvent.set(r.event_id, r);

  // 2) Compute per-email delta.
  const net = new Map<string, number>();
  const bump = (email: string, d: number) => {
    if (!email) return;
    net.set(email, (net.get(email) ?? 0) + d);
  };

  const eventRows: Array<Record<string, unknown>> = [];
  const meta = new Map<string, { display_name: string | null; last_meeting_title: string; last_seen_at: string }>();

  for (const m of meetings) {
    const countable = [...new Set(
      (m.attendees ?? [])
        .filter(a => !a.self && a.responseStatus !== "declined" && a.email)
        .map(a => a.email),
    )];

    const prior = priorByEvent.get(m.id);
    const priorSet = new Set(prior?.attendee_emails ?? []);
    const wasNew = !prior;
    const wasCancelled = prior?.is_cancelled === true;

    if (wasNew || wasCancelled) {
      for (const email of countable) bump(email, +1);
    } else {
      for (const email of countable)   if (!priorSet.has(email))  bump(email, +1);
      for (const email of priorSet)    if (!countable.includes(email)) bump(email, -1);
    }

    const attendee_statuses: Record<string, string> = {};
    for (const a of m.attendees ?? []) if (a.email) attendee_statuses[a.email] = a.responseStatus;

    eventRows.push({
      event_id:         m.id,
      event_start:      m.start.toISOString(),
      event_end:        m.end.toISOString(),
      event_title:      (m.title ?? "").slice(0, 500),
      organizer_email:  m.organizerEmail,
      html_link:        m.htmlLink,
      attendee_emails:  countable,
      attendee_statuses,
      is_cancelled:     false,
      last_observed_at: nowIso,
      updated_at:       nowIso,
    });

    // Pick latest displayName + title per email for hall_attendees metadata.
    for (const a of m.attendees ?? []) {
      if (a.self || !a.email) continue;
      const prev = meta.get(a.email);
      const iso = m.start.toISOString();
      if (!prev || iso > prev.last_seen_at) {
        meta.set(a.email, {
          display_name:       a.displayName,
          last_meeting_title: m.title,
          last_seen_at:       iso,
        });
      }
    }
  }

  // 3) Persist event rows.
  try {
    if (eventRows.length > 0) {
      await sb.from("hall_calendar_events").upsert(eventRows, { onConflict: "event_id" });
    }
  } catch { /* best-effort */ }

  // 4) Apply attendee delta (only non-zero).
  const emailsAffected = [...net.entries()].filter(([, d]) => d !== 0);
  if (emailsAffected.length === 0) return;

  try {
    const emails = emailsAffected.map(([e]) => e);
    const { data: existing } = await sb
      .from("hall_attendees")
      .select("email, meeting_count")
      .in("email", emails);
    const countByEmail = new Map<string, number>();
    for (const r of (existing ?? []) as { email: string; meeting_count: number }[]) {
      countByEmail.set(r.email, r.meeting_count ?? 0);
    }

    const rows = emailsAffected.map(([email, delta]) => {
      const next = Math.max(0, (countByEmail.get(email) ?? 0) + delta);
      const m = meta.get(email);
      const row: Record<string, unknown> = {
        email,
        meeting_count: next,
        updated_at:    nowIso,
      };
      if (m) {
        row.display_name       = m.display_name;
        row.last_meeting_title = m.last_meeting_title;
        row.last_seen_at       = m.last_seen_at;
      }
      return row;
    });

    await sb
      .from("hall_attendees")
      .upsert(rows, { onConflict: "email", ignoreDuplicates: false });
  } catch { /* best-effort */ }
}
