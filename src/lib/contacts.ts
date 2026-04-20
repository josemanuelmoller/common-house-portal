/**
 * contacts.ts — Unified read API for Hall contacts.
 *
 * Every consumer of hall_attendees (inbox triage, daily briefing, drawer
 * page, STB classifier, CH People sync, evidence enrichment, …) goes
 * through this file. Central place to:
 *   - Look up a contact by email
 *   - Stitch a cross-channel timeline (calendar + email + transcript)
 *   - Get / generate a short relationship brief
 *
 * Keeping every downstream feature on one helper means new columns,
 * relationship classes or timeline sources ship in one edit, not N.
 */

import { getSupabaseServerClient } from "./supabase-server";

export type ContactView = {
  email:                   string;
  display_name:            string | null;
  relationship_classes:    string[];
  classified_at:           string | null;
  classified_by:           string | null;
  meeting_count:           number;
  email_thread_count:      number;
  transcript_count:        number;
  first_seen_at:           string;
  last_seen_at:            string | null;
  last_meeting_title:      string | null;
  last_email_at:           string | null;
  last_email_subject:      string | null;
  last_transcript_at:      string | null;
  last_transcript_title:   string | null;
  google_resource_name:    string | null;
  google_source:           string | null;
  google_labels:           string[] | null;
  google_synced_at:        string | null;
  auto_suggested:          string | null;
};

const ALL_FIELDS =
  "email, display_name, relationship_classes, classified_at, classified_by, " +
  "meeting_count, email_thread_count, transcript_count, " +
  "first_seen_at, last_seen_at, last_meeting_title, " +
  "last_email_at, last_email_subject, last_transcript_at, last_transcript_title, " +
  "google_resource_name, google_source, google_labels, google_synced_at, auto_suggested";

export async function getContactByEmail(email: string): Promise<ContactView | null> {
  const key = email.toLowerCase();
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("hall_attendees")
    .select(ALL_FIELDS)
    .eq("email", key)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as ContactView;
  return {
    ...row,
    relationship_classes: row.relationship_classes ?? [],
    google_labels:        row.google_labels ?? [],
  };
}

/** Returns the contacts whose email is in the given list, one SELECT. */
export async function getContactsByEmails(emails: string[]): Promise<Map<string, ContactView>> {
  const keys = [...new Set(emails.map(e => e.toLowerCase()).filter(Boolean))];
  const out  = new Map<string, ContactView>();
  if (keys.length === 0) return out;
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("hall_attendees")
    .select(ALL_FIELDS)
    .in("email", keys);
  for (const r of (data ?? []) as unknown as ContactView[]) {
    out.set(r.email, {
      ...r,
      relationship_classes: r.relationship_classes ?? [],
      google_labels:        r.google_labels ?? [],
    });
  }
  return out;
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export type TimelineEntry =
  | { kind: "meeting";    at: string; title: string; event_id: string; attendee_count: number }
  | { kind: "email";      at: string; title: string; thread_id: string; notion_source_id: string | null }
  | { kind: "transcript"; at: string; title: string; transcript_id: string; meeting_link: string | null };

export async function getContactTimeline(email: string, limit = 15): Promise<TimelineEntry[]> {
  const key = email.toLowerCase();
  const sb = getSupabaseServerClient();

  const [calendar, mails, transcripts] = await Promise.all([
    sb.from("hall_calendar_events")
      .select("event_id, event_title, event_start, attendee_emails")
      .contains("attendee_emails", [key])
      .eq("is_cancelled", false)
      .order("event_start", { ascending: false })
      .limit(limit),
    sb.from("hall_email_observations")
      .select("thread_id, subject, last_message_at, notion_source_id, attendee_emails")
      .contains("attendee_emails", [key])
      .order("last_message_at", { ascending: false })
      .limit(limit),
    sb.from("hall_transcript_observations")
      .select("transcript_id, title, meeting_at, meeting_link, participant_emails")
      .contains("participant_emails", [key])
      .order("meeting_at", { ascending: false })
      .limit(limit),
  ]);

  const entries: TimelineEntry[] = [];
  for (const r of (calendar.data ?? []) as { event_id: string; event_title: string; event_start: string; attendee_emails: string[] }[]) {
    entries.push({
      kind:           "meeting",
      at:             r.event_start,
      title:          r.event_title,
      event_id:       r.event_id,
      attendee_count: r.attendee_emails?.length ?? 0,
    });
  }
  for (const r of (mails.data ?? []) as { thread_id: string; subject: string; last_message_at: string; notion_source_id: string | null }[]) {
    entries.push({
      kind:             "email",
      at:               r.last_message_at,
      title:            r.subject,
      thread_id:        r.thread_id,
      notion_source_id: r.notion_source_id,
    });
  }
  for (const r of (transcripts.data ?? []) as { transcript_id: string; title: string; meeting_at: string; meeting_link: string | null }[]) {
    entries.push({
      kind:          "transcript",
      at:            r.meeting_at,
      title:         r.title,
      transcript_id: r.transcript_id,
      meeting_link:  r.meeting_link,
    });
  }

  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return entries.slice(0, limit);
}

// ─── Derived helpers useful across consumers ────────────────────────────────

const PERSONAL_CLASSES = new Set(["Family", "Personal Service", "Friend"]);
const VIP_CLASSES      = new Set(["VIP"]);

export function isPersonalContact(c: ContactView): boolean {
  const cs = c.relationship_classes ?? [];
  return cs.length > 0 && cs.every(x => PERSONAL_CLASSES.has(x));
}

export function isVipContact(c: ContactView): boolean {
  return (c.relationship_classes ?? []).some(x => VIP_CLASSES.has(x));
}

/** A generic relevance score for downstream priorization (inbox, STB, briefing). */
export function contactPriorityScore(c: ContactView): number {
  let score = 0;
  if (isVipContact(c))                                            score += 100;
  if (c.relationship_classes?.includes("Client"))                 score += 30;
  if (c.relationship_classes?.includes("Investor"))               score += 25;
  if (c.relationship_classes?.includes("Funder"))                 score += 25;
  if (c.relationship_classes?.includes("Portfolio"))              score += 20;
  if (c.relationship_classes?.includes("Partner"))                score += 15;
  if (c.relationship_classes?.includes("Team"))                   score += 12;
  // Personal is negative pressure — we de-prioritize triage of personal threads.
  if (isPersonalContact(c))                                       score -= 80;
  // Frequency adds mild weight — someone you meet weekly outranks a stranger.
  score += Math.min(15, c.meeting_count + c.email_thread_count + c.transcript_count);
  return score;
}
