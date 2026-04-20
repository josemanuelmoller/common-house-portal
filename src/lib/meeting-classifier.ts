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
  | "External"
  | null;

const PERSONAL_CLASSES: ReadonlySet<string> = new Set(["Family", "Personal Service", "Friend"]);
const VIP_CLASSES:      ReadonlySet<string> = new Set(["Investor", "Funder", "Portfolio"]);

export type AttendeeLookup = Map<string, RelationshipClass>;

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
    relationship_class: string | null;
    google_synced_at:   string | null;
  };
  let rows: Row[] = [];
  if (sb) {
    try {
      const { data } = await sb
        .from("hall_attendees")
        .select("email, relationship_class, google_synced_at")
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
    if (row?.relationship_class) {
      // Human-set class — highest priority, never re-derived from Google.
      out.set(email, row.relationship_class as RelationshipClass);
      continue;
    }
    const freshGoogle = row?.google_synced_at && new Date(row.google_synced_at).getTime() > cutoff;
    if (freshGoogle) {
      // Within TTL — trust the cached null (we already checked Google recently).
      out.set(email, null);
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
    for (const e of needGoogle) out.set(e, null);
    return out;
  }

  // Persist cache + derive class in the same pass.
  const nowIso = new Date().toISOString();
  const updates: Array<{
    email: string;
    relationship_class: string | null;
    google_resource_name: string | null;
    google_source: string;
    google_labels: string[];
    google_synced_at: string;
    updated_at: string;
  }> = [];

  for (const email of needGoogle) {
    const r = resolved.get(email);
    const googleClass = r?.class ?? null;
    out.set(email, googleClass as RelationshipClass);
    updates.push({
      email,
      // Only auto-fill relationship_class if Google told us something AND the
      // local row doesn't already have a human-set class. Upsert preserves
      // human edits that happened between this lookup and the write.
      relationship_class:   googleClass,
      google_resource_name: r?.resourceName ?? null,
      google_source:        r?.source ?? "not_found",
      google_labels:        r?.labels ?? [],
      google_synced_at:     nowIso,
      updated_at:           nowIso,
    });
  }

  if (sb && updates.length > 0) {
    try {
      // Two-step to avoid clobbering manually-set relationship_class:
      //   (1) upsert all rows with google_* fields
      //   (2) for rows where the server already has a non-null class, we want
      //       to keep it. Supabase upsert does overwrite; do a select first to
      //       filter out rows with existing relationship_class set.
      const { data: existing } = await sb
        .from("hall_attendees")
        .select("email, relationship_class")
        .in("email", updates.map(u => u.email));
      const humanSet = new Set(
        ((existing ?? []) as { email: string; relationship_class: string | null }[])
          .filter(r => r.relationship_class)
          .map(r => r.email),
      );
      const safeUpdates = updates.map(u =>
        humanSet.has(u.email)
          ? { ...u, relationship_class: undefined }  // drop the field; upsert won't touch it
          : u
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
  all_classes_present: RelationshipClass[];
  unknown_attendees:  MeetingAttendee[];  // attendees not yet in hall_attendees with a class
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

  const classes: RelationshipClass[] = nonSelf.map(a => lookup.get(a.email) ?? null);
  const knownClasses = classes.filter(c => c !== null) as Exclude<RelationshipClass, null>[];

  // is_personal: at least one non-self attendee AND every non-self attendee
  // is classified personal. An unknown attendee is NOT personal by default
  // (fail open on uncertainty — never drop prep when we do not know who is coming).
  const is_personal =
    nonSelf.length > 0 &&
    classes.every(c => c !== null && PERSONAL_CLASSES.has(c));

  const has_vip = knownClasses.some(c => VIP_CLASSES.has(c));

  const unknown_attendees = nonSelf.filter(a => !lookup.has(a.email));

  return {
    is_personal,
    has_vip,
    confirmed_count:    confirmed,
    tentative_count:    tentative,
    needs_action_count: needsAction,
    all_classes_present: classes,
    unknown_attendees,
  };
}

/**
 * Upsert observations of every non-self non-declined attendee seen in the meeting
 * set. Increments meeting_count and bumps last_seen_at / last_meeting_title for
 * already-known rows. Does NOT change relationship_class (that stays human-owned).
 */
export async function observeAttendees(meetings: UpcomingMeeting[]): Promise<void> {
  const byEmail = new Map<string, { display_name: string | null; last_meeting_title: string; last_seen_at: string }>();
  const nowIso = new Date().toISOString();

  for (const m of meetings) {
    for (const a of m.attendees ?? []) {
      if (a.self) continue;
      if (a.responseStatus === "declined") continue;
      if (!a.email) continue;
      const prev = byEmail.get(a.email);
      // Keep the latest meeting title per attendee across the batch
      if (!prev || m.start.toISOString() > prev.last_seen_at) {
        byEmail.set(a.email, {
          display_name:        a.displayName,
          last_meeting_title:  m.title,
          last_seen_at:        m.start.toISOString(),
        });
      }
    }
  }

  if (byEmail.size === 0) return;

  try {
    const sb = getSupabaseServerClient();
    // Fetch existing rows to compute meeting_count increment atomically-enough.
    const emails = [...byEmail.keys()];
    const { data: existing } = await sb
      .from("hall_attendees")
      .select("email, meeting_count")
      .in("email", emails);
    const countByEmail = new Map<string, number>();
    for (const r of (existing ?? []) as { email: string; meeting_count: number }[]) {
      countByEmail.set(r.email, r.meeting_count ?? 0);
    }

    const rows = [...byEmail.entries()].map(([email, v]) => ({
      email,
      display_name:       v.display_name,
      last_meeting_title: v.last_meeting_title,
      last_seen_at:       v.last_seen_at,
      meeting_count:      (countByEmail.get(email) ?? 0) + 1,
      updated_at:         nowIso,
      // first_seen_at preserved by upsert (default only on insert)
    }));

    await sb
      .from("hall_attendees")
      .upsert(rows, { onConflict: "email", ignoreDuplicates: false });
  } catch { /* non-critical — observation is best-effort */ }
}
