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

// ─── Organization rollup ───────────────────────────────────────────────────

export type OrgRollup = {
  domain:            string;
  contacts:          ContactView[];
  contact_count:     number;
  meeting_sum:       number;
  email_sum:         number;
  transcript_sum:    number;
  vip_count:         number;
  tagged_count:      number;
  untagged_count:    number;
  /** Classes shared by every contact in the group (for a "most common" badge). */
  shared_classes:    string[];
  last_interaction_at: string | null;
  /** Registered org row fields — null when this domain is still 'proposed'. */
  org_registered:    boolean;
  org_name:          string | null;
  org_classes:       string[];
  org_notion_id:     string | null;
  org_notes:         string | null;
};

// Email providers where a shared domain does NOT mean a shared organisation.
// These get grouped together but flagged so the UI can show them differently.
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
  "yahoo.com", "yahoo.es", "yahoo.co.uk", "icloud.com", "me.com",
  "live.com", "msn.com", "protonmail.com", "proton.me",
]);

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Groups hall_attendees by email domain. Sorts by total touches descending
 * so the orgs you interact with most land on top.
 *
 * Filters applied:
 *   - dismissed rows excluded
 *   - self identities excluded
 *   - domains with fewer than `minContacts` rolled separately (return under
 *     a '__singletons__' bucket the UI can hide or fold)
 */
export async function getOrganizationRollup(minContacts = 2): Promise<{
  orgs:       OrgRollup[];
  singletons: ContactView[];
}> {
  const { getSupabaseServerClient } = await import("./supabase-server");
  const { getSelfEmails } = await import("./hall-self");
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();

  const [contactsRes, orgsRes] = await Promise.all([
    sb.from("hall_attendees")
      .select(ALL_FIELDS)
      .is("dismissed_at", null)
      .gte("last_seen_at", new Date(Date.now() - 120 * 86400_000).toISOString())
      .order("meeting_count", { ascending: false })
      .limit(600),
    sb.from("hall_organizations")
      .select("domain, name, relationship_classes, notion_id, notes")
      .is("dismissed_at", null),
  ]);

  const rows = ((contactsRes.data ?? []) as unknown as ContactView[]).filter(r => !selfSet.has(r.email));

  type OrgRow = { domain: string; name: string; relationship_classes: string[] | null; notion_id: string | null; notes: string | null };
  const orgByDomain = new Map<string, OrgRow>();
  for (const r of (orgsRes.data ?? []) as OrgRow[]) orgByDomain.set(r.domain.toLowerCase(), r);

  const byDomain = new Map<string, ContactView[]>();
  for (const c of rows) {
    const domain = (c.email.split("@")[1] ?? "").toLowerCase();
    if (!domain) continue;
    const bucket = byDomain.get(domain) ?? [];
    bucket.push({
      ...c,
      relationship_classes: c.relationship_classes ?? [],
      google_labels:        c.google_labels ?? [],
    });
    byDomain.set(domain, bucket);
  }

  const orgs: OrgRollup[] = [];
  const singletons: ContactView[] = [];

  for (const [domain, contacts] of byDomain) {
    if (contacts.length < minContacts) {
      singletons.push(...contacts);
      continue;
    }
    const meeting_sum    = contacts.reduce((a, c) => a + (c.meeting_count ?? 0), 0);
    const email_sum      = contacts.reduce((a, c) => a + (c.email_thread_count ?? 0), 0);
    const transcript_sum = contacts.reduce((a, c) => a + (c.transcript_count ?? 0), 0);
    const vip_count      = contacts.filter(isVipContact).length;
    const tagged_count   = contacts.filter(c => (c.relationship_classes ?? []).length > 0).length;
    const untagged_count = contacts.length - tagged_count;

    // Shared classes = intersection of all contacts' class sets.
    const shared = contacts.reduce<Set<string> | null>((acc, c) => {
      const set = new Set(c.relationship_classes ?? []);
      if (acc === null) return set;
      return new Set([...acc].filter(x => set.has(x)));
    }, null) ?? new Set();

    const latest = contacts
      .map(c => c.last_seen_at)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;

    const registered = orgByDomain.get(domain);
    orgs.push({
      domain,
      contacts,
      contact_count:    contacts.length,
      meeting_sum, email_sum, transcript_sum, vip_count,
      tagged_count, untagged_count,
      shared_classes:   [...shared],
      last_interaction_at: latest,
      org_registered:   !!registered,
      org_name:         registered?.name ?? null,
      org_classes:      registered?.relationship_classes ?? [],
      org_notion_id:    registered?.notion_id ?? null,
      org_notes:        registered?.notes ?? null,
    });
  }

  orgs.sort((a, b) => (b.meeting_sum + b.email_sum + b.transcript_sum) - (a.meeting_sum + a.email_sum + a.transcript_sum));
  return { orgs, singletons };
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
