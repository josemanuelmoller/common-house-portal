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

/** Fetch the current relationship_class for a set of emails. */
export async function loadAttendeeClasses(emails: string[]): Promise<AttendeeLookup> {
  const out: AttendeeLookup = new Map();
  const unique = [...new Set(emails.map(e => e.toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return out;
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("hall_attendees")
      .select("email, relationship_class")
      .in("email", unique);
    for (const r of (data ?? []) as { email: string; relationship_class: string | null }[]) {
      out.set(r.email, (r.relationship_class as RelationshipClass) ?? null);
    }
  } catch { /* supabase unreachable — everybody looks unknown */ }
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
