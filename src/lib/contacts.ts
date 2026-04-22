/**
 * contacts.ts — Unified read API for Hall contacts.
 *
 * Every consumer of the unified `people` table (inbox triage, daily briefing,
 * drawer page, STB classifier, Hall contact views, evidence enrichment, …) goes
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
    .from("people")
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

/**
 * Returns the contacts whose email is in the given list, one SELECT.
 * relationship_classes are unioned with their org's classes (if a registered
 * hall_organizations row exists for the email's domain) so any downstream
 * consumer (inbox VIP-escalate, STB personal-mute, priority score, …)
 * respects the org tag even when the individual contact has no tag.
 */
export async function getContactsByEmails(emails: string[]): Promise<Map<string, ContactView>> {
  const keys = [...new Set(emails.map(e => e.toLowerCase()).filter(Boolean))];
  const out  = new Map<string, ContactView>();
  if (keys.length === 0) return out;
  const sb = getSupabaseServerClient();

  const domains = [...new Set(keys.map(e => (e.split("@")[1] ?? "").toLowerCase()).filter(Boolean))];

  const [contactsRes, orgsRes] = await Promise.all([
    sb.from("people").select(ALL_FIELDS).in("email", keys),
    domains.length > 0
      ? sb.from("hall_organizations")
          .select("domain, relationship_classes")
          .in("domain", domains)
          .is("dismissed_at", null)
      : Promise.resolve({ data: [] as { domain: string; relationship_classes: string[] | null }[] }),
  ]);

  const orgByDomain = new Map<string, string[]>();
  for (const r of (orgsRes.data ?? []) as { domain: string; relationship_classes: string[] | null }[]) {
    if ((r.relationship_classes ?? []).length > 0) {
      orgByDomain.set(r.domain.toLowerCase(), r.relationship_classes!);
    }
  }

  for (const r of (contactsRes.data ?? []) as unknown as ContactView[]) {
    const domain = ((r.email ?? "").split("@")[1] ?? "").toLowerCase();
    const orgClasses = orgByDomain.get(domain) ?? [];
    const union = [...new Set([...(r.relationship_classes ?? []), ...orgClasses])];
    out.set(r.email, {
      ...r,
      relationship_classes: union,
      google_labels:        r.google_labels ?? [],
    });
  }

  // Also synthesize views for emails that are NOT in people yet but
  // whose org IS tagged — e.g. a cold email from someone at a Client org.
  for (const email of keys) {
    if (out.has(email)) continue;
    const domain = (email.split("@")[1] ?? "").toLowerCase();
    const orgClasses = orgByDomain.get(domain);
    if (!orgClasses) continue;
    out.set(email, {
      email,
      display_name:          null,
      relationship_classes:  orgClasses,
      classified_at:         null,
      classified_by:         null,
      meeting_count:         0,
      email_thread_count:    0,
      transcript_count:      0,
      first_seen_at:         new Date().toISOString(),
      last_seen_at:          null,
      last_meeting_title:    null,
      last_email_at:         null,
      last_email_subject:    null,
      last_transcript_at:    null,
      last_transcript_title: null,
      google_resource_name:  null,
      google_source:         null,
      google_labels:         [],
      google_synced_at:      null,
      auto_suggested:        null,
    });
  }

  return out;
}

// ─── WhatsApp clips ─────────────────────────────────────────────────────────

export type WhatsappClip = {
  source_id:     string;
  notion_id:     string | null;
  title:         string;
  source_url:    string | null;
  first_ts:      string;   // ISO
  last_ts:       string;   // ISO
  total_count:   number;
  their_count:   number;   // messages where this contact was the sender
  preview:       { ts: string; sender: string; text: string }[]; // last 3 of theirs
};

// Returns WhatsApp conversation clips where the given contact appears as a
// sender. Two resolution paths:
//   (a) if `person_id` is provided — filter by sender_person_id. This is
//       the authoritative path: set by the clipper when it can match, and
//       backfilled by the orphan-scanner approve flow. Covers cases where
//       the WA handle differs from the contact's display_name (e.g. a
//       contact named "Kiumarz Goharriz" who appears as "Kiu" on WA —
//       after approving the orphan match, person_id points to the right
//       row even though sender_name says "Kiu").
//   (b) falls back to an ILIKE probe on `sender_name` for legacy /
//       not-yet-linked messages, using the longest token from
//       display_name as the probe. Preserves behaviour for contacts
//       whose messages haven't been re-linked yet.
export async function getContactWhatsappClips(
  opts: { person_id?: string | null; display_name?: string | null } | string | null,
  limit = 10,
): Promise<WhatsappClip[]> {
  // Back-compat: if caller passed a bare string (old signature), treat it
  // as display_name with no person_id.
  const normOpts = typeof opts === "string" || opts == null
    ? { person_id: null, display_name: opts ?? null }
    : opts;
  const personId = (normOpts.person_id ?? "").trim() || null;
  const name     = (normOpts.display_name ?? "").trim();

  const sb = getSupabaseServerClient();

  type Row = {
    source_id:   string;
    ts:          string;
    sender_name: string;
    text:        string;
    sources:     { notion_id: string | null; title: string | null; source_url: string | null; source_platform: string | null } | null;
  };

  let rows: Row[] = [];

  // Path (a) — person_id is authoritative. Fetch by sender_person_id.
  if (personId) {
    const { data, error } = await sb
      .from("conversation_messages")
      .select("source_id, ts, sender_name, text, sources!inner(notion_id, title, source_url, source_platform)")
      .eq("sender_person_id", personId)
      .order("ts", { ascending: false })
      .limit(500);
    if (!error && data) {
      rows = (data as unknown as Row[]).filter(r => r.sources?.source_platform === "WhatsApp");
    }
  }

  // Path (b) — fall back to (or also merge with) ILIKE probes on sender_name.
  // Two kinds of probes:
  //   - the longest token of display_name  ("Kiumarz Goharriz" → "Goharriz")
  //   - every alias stored on people.aliases (approving an orphan match
  //     adds the WA sender variant here; "Kiu" ends up in aliases after
  //     you approve the first match). This fixes the case where the
  //     orphan-scanner approved Kiu → Kiumarz for one source but other
  //     unrelated WA conversations where he still shows as "Kiu" were
  //     never re-linked to his person_id.
  const probes = new Set<string>();
  if (name.length >= 3) {
    const tokens = name
      .split(/[\s,.]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);
    if (tokens.length > 0) {
      probes.add(tokens.slice().sort((a, b) => b.length - a.length)[0]);
    }
  }
  if (personId) {
    const { data: aliasRow } = await sb
      .from("people")
      .select("aliases")
      .eq("id", personId)
      .maybeSingle();
    const aliases = ((aliasRow as { aliases: string[] | null } | null)?.aliases ?? []) as string[];
    for (const a of aliases) {
      const cleaned = (a ?? "").trim();
      if (cleaned.length >= 3) probes.add(cleaned);
    }
  }

  if (probes.size > 0) {
    const seen = new Set(rows.map(r => `${r.source_id}::${r.ts}`));
    for (const probe of probes) {
      const pattern = `%${probe}%`;
      const { data, error } = await sb
        .from("conversation_messages")
        .select("source_id, ts, sender_name, text, sources!inner(notion_id, title, source_url, source_platform)")
        .ilike("sender_name", pattern)
        .order("ts", { ascending: false })
        .limit(500);
      if (!error && data) {
        const extra = (data as unknown as Row[]).filter(r => r.sources?.source_platform === "WhatsApp");
        for (const r of extra) {
          const k = `${r.source_id}::${r.ts}`;
          if (!seen.has(k)) { rows.push(r); seen.add(k); }
        }
      }
    }
  }

  if (rows.length === 0) return [];

  // Group by source_id
  const bySource = new Map<string, Row[]>();
  for (const r of rows) {
    if (!bySource.has(r.source_id)) bySource.set(r.source_id, []);
    bySource.get(r.source_id)!.push(r);
  }

  // For each source: also pull the total message count (all senders) via a
  // second batched query.
  const sourceIds = [...bySource.keys()];
  const totalCounts = new Map<string, number>();
  if (sourceIds.length > 0) {
    // Supabase doesn't support count grouping via PostgREST easily, so pull
    // the ids and count in JS. Cheap for the sizes we expect (< 50 clips).
    const { data: allRows } = await sb
      .from("conversation_messages")
      .select("source_id")
      .in("source_id", sourceIds);
    for (const r of (allRows ?? []) as { source_id: string }[]) {
      totalCounts.set(r.source_id, (totalCounts.get(r.source_id) ?? 0) + 1);
    }
  }

  const clips: WhatsappClip[] = [];
  for (const [sid, msgs] of bySource) {
    const src = msgs[0].sources;
    if (!src) continue;
    const sorted = [...msgs].sort((a, b) => a.ts.localeCompare(b.ts));
    clips.push({
      source_id:   sid,
      notion_id:   src.notion_id,
      title:       src.title ?? "WhatsApp conversation",
      source_url:  src.source_url,
      first_ts:    sorted[0].ts,
      last_ts:     sorted[sorted.length - 1].ts,
      total_count: totalCounts.get(sid) ?? msgs.length,
      their_count: msgs.length,
      preview:     sorted.slice(-3).map(m => ({ ts: m.ts, sender: m.sender_name, text: (m.text ?? "").slice(0, 140) })),
    });
  }

  // Sort clips by most-recent activity
  clips.sort((a, b) => b.last_ts.localeCompare(a.last_ts));
  return clips.slice(0, limit);
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

  // Dedupe calendar events that share (title, start_time) — happens when the
  // same meeting is invited twice (e.g. host adds you from two different
  // calendars) and Google creates two event_ids. Keep the richer row.
  type CalRow = { event_id: string; event_title: string; event_start: string; attendee_emails: string[] };
  const calRows = (calendar.data ?? []) as CalRow[];
  const calByKey = new Map<string, CalRow>();
  for (const r of calRows) {
    const normTitle = (r.event_title ?? "").trim().toLowerCase();
    const key       = `${normTitle}::${r.event_start}`;
    const prev      = calByKey.get(key);
    const attendees = r.attendee_emails?.length ?? 0;
    const prevAttendees = prev?.attendee_emails?.length ?? 0;
    if (!prev || attendees > prevAttendees) calByKey.set(key, r);
  }
  for (const r of calByKey.values()) {
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
 * Groups people by email domain. Sorts by total touches descending
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
    sb.from("people")
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
    const domain = ((c.email ?? "").split("@")[1] ?? "").toLowerCase();
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

// ─── Organisation registry views ────────────────────────────────────────────

export type OrganizationListEntry = {
  domain:                string;
  name:                  string;
  relationship_classes:  string[];
  notion_id:             string | null;
  notion_synced_at:      string | null;
  notes:                 string | null;
  contact_count:         number;
  meeting_sum:           number;
  email_sum:             number;
  transcript_sum:        number;
  vip_contact_count:     number;
  last_interaction_at:   string | null;
  dismissed_at:          string | null;
  dismissed_reason:      string | null;
};

export async function getOrganizationsList(): Promise<OrganizationListEntry[]> {
  const sb = getSupabaseServerClient();
  const { getSelfEmails } = await import("./hall-self");
  const selfSet = await getSelfEmails();

  const [orgsRes, attendeesRes] = await Promise.all([
    sb.from("hall_organizations")
      .select("domain, name, relationship_classes, notion_id, notion_synced_at, notes, dismissed_at, dismissed_reason")
      .order("updated_at", { ascending: false }),
    sb.from("people")
      .select("email, meeting_count, email_thread_count, transcript_count, last_seen_at, relationship_classes")
      .is("dismissed_at", null),
  ]);

  type AggBucket = { count: number; meetings: number; emails: number; transcripts: number; vip: number; latest: string | null };
  const byDomain = new Map<string, AggBucket>();
  for (const r of (attendeesRes.data ?? []) as { email: string; meeting_count: number; email_thread_count: number; transcript_count: number; last_seen_at: string | null; relationship_classes: string[] | null }[]) {
    if (selfSet.has(r.email)) continue;
    const d = ((r.email ?? "").split("@")[1] ?? "").toLowerCase();
    if (!d) continue;
    const b = byDomain.get(d) ?? { count: 0, meetings: 0, emails: 0, transcripts: 0, vip: 0, latest: null };
    b.count++;
    b.meetings    += r.meeting_count      ?? 0;
    b.emails      += r.email_thread_count ?? 0;
    b.transcripts += r.transcript_count   ?? 0;
    if ((r.relationship_classes ?? []).includes("VIP")) b.vip++;
    if (r.last_seen_at && (!b.latest || r.last_seen_at > b.latest)) b.latest = r.last_seen_at;
    byDomain.set(d, b);
  }

  const out: OrganizationListEntry[] = [];
  for (const o of (orgsRes.data ?? []) as { domain: string; name: string; relationship_classes: string[] | null; notion_id: string | null; notion_synced_at: string | null; notes: string | null; dismissed_at: string | null; dismissed_reason: string | null }[]) {
    const a = byDomain.get(o.domain.toLowerCase()) ?? { count: 0, meetings: 0, emails: 0, transcripts: 0, vip: 0, latest: null };
    out.push({
      domain: o.domain,
      name: o.name,
      relationship_classes: o.relationship_classes ?? [],
      notion_id: o.notion_id,
      notion_synced_at: o.notion_synced_at,
      notes: o.notes,
      contact_count: a.count,
      meeting_sum: a.meetings,
      email_sum: a.emails,
      transcript_sum: a.transcripts,
      vip_contact_count: a.vip,
      last_interaction_at: a.latest,
      dismissed_at: o.dismissed_at,
      dismissed_reason: o.dismissed_reason,
    });
  }
  return out;
}

export type ProposedOrganization = {
  domain:              string;
  contact_count:       number;
  meeting_sum:         number;
  email_sum:           number;
  transcript_sum:      number;
  vip_contact_count:   number;
  last_interaction_at: string | null;
  sample_names:        string[];
};

/** Domains with ≥minContacts active attendees but NO row in hall_organizations. */
export async function getProposedOrganizations(minContacts = 3): Promise<ProposedOrganization[]> {
  const sb = getSupabaseServerClient();
  const { getSelfEmails } = await import("./hall-self");
  const selfSet = await getSelfEmails();

  const [orgsRes, attendeesRes] = await Promise.all([
    sb.from("hall_organizations").select("domain"),
    sb.from("people")
      .select("email, display_name, meeting_count, email_thread_count, transcript_count, last_seen_at, relationship_classes")
      .is("dismissed_at", null)
      .gte("last_seen_at", new Date(Date.now() - 180 * 86400_000).toISOString()),
  ]);

  const existing = new Set(((orgsRes.data ?? []) as { domain: string }[]).map(r => r.domain.toLowerCase()));

  type Bucket = { count: number; meetings: number; emails: number; transcripts: number; vip: number; latest: string | null; names: string[] };
  const byDomain = new Map<string, Bucket>();
  for (const r of (attendeesRes.data ?? []) as { email: string; display_name: string | null; meeting_count: number; email_thread_count: number; transcript_count: number; last_seen_at: string | null; relationship_classes: string[] | null }[]) {
    if (selfSet.has(r.email)) continue;
    const d = ((r.email ?? "").split("@")[1] ?? "").toLowerCase();
    if (!d) continue;
    if (existing.has(d)) continue;
    if (PERSONAL_DOMAINS.has(d)) continue;
    const b = byDomain.get(d) ?? { count: 0, meetings: 0, emails: 0, transcripts: 0, vip: 0, latest: null, names: [] };
    b.count++;
    b.meetings    += r.meeting_count      ?? 0;
    b.emails      += r.email_thread_count ?? 0;
    b.transcripts += r.transcript_count   ?? 0;
    if ((r.relationship_classes ?? []).includes("VIP")) b.vip++;
    if (r.last_seen_at && (!b.latest || r.last_seen_at > b.latest)) b.latest = r.last_seen_at;
    if (r.display_name && b.names.length < 3 && !b.names.includes(r.display_name)) b.names.push(r.display_name);
    byDomain.set(d, b);
  }

  const out: ProposedOrganization[] = [];
  for (const [domain, b] of byDomain) {
    if (b.count < minContacts) continue;
    out.push({
      domain,
      contact_count:       b.count,
      meeting_sum:         b.meetings,
      email_sum:           b.emails,
      transcript_sum:      b.transcripts,
      vip_contact_count:   b.vip,
      last_interaction_at: b.latest,
      sample_names:        b.names,
    });
  }
  out.sort((a, b) => (b.meeting_sum + b.email_sum + b.transcript_sum) - (a.meeting_sum + a.email_sum + a.transcript_sum));
  return out;
}

export type OrganizationDetail = {
  org:       OrganizationListEntry | null;
  contacts:  ContactView[];
  timeline:  TimelineEntry[];
};

export async function getOrganizationDetail(domain: string, timelineLimit = 30): Promise<OrganizationDetail> {
  const d = domain.toLowerCase();
  const sb = getSupabaseServerClient();
  const { getSelfEmails } = await import("./hall-self");
  const selfSet = await getSelfEmails();

  const [orgRowRes, contactRowsRes] = await Promise.all([
    sb.from("hall_organizations")
      .select("domain, name, relationship_classes, notion_id, notion_synced_at, notes, dismissed_at, dismissed_reason")
      .eq("domain", d)
      .maybeSingle(),
    sb.from("people")
      .select(ALL_FIELDS)
      .ilike("email", `%@${d}`)
      .is("dismissed_at", null)
      .order("meeting_count", { ascending: false })
      .limit(200),
  ]);

  const contacts = ((contactRowsRes.data ?? []) as unknown as ContactView[])
    .filter(r => !selfSet.has(r.email))
    .map(c => ({ ...c, relationship_classes: c.relationship_classes ?? [], google_labels: c.google_labels ?? [] }));

  const agg = contacts.reduce(
    (a, c) => ({
      meetings:    a.meetings    + (c.meeting_count ?? 0),
      emails:      a.emails      + (c.email_thread_count ?? 0),
      transcripts: a.transcripts + (c.transcript_count ?? 0),
      vip:         a.vip         + (isVipContact(c) ? 1 : 0),
      latest:      (!a.latest || (c.last_seen_at && c.last_seen_at > a.latest)) ? (c.last_seen_at ?? a.latest) : a.latest,
    }),
    { meetings: 0, emails: 0, transcripts: 0, vip: 0, latest: null as string | null },
  );

  let org: OrganizationListEntry | null = null;
  const r = orgRowRes.data as { domain: string; name: string; relationship_classes: string[] | null; notion_id: string | null; notion_synced_at: string | null; notes: string | null; dismissed_at: string | null; dismissed_reason: string | null } | null;
  if (r) {
    org = {
      domain: r.domain,
      name: r.name,
      relationship_classes: r.relationship_classes ?? [],
      notion_id: r.notion_id,
      notion_synced_at: r.notion_synced_at,
      notes: r.notes,
      contact_count: contacts.length,
      meeting_sum: agg.meetings,
      email_sum: agg.emails,
      transcript_sum: agg.transcripts,
      vip_contact_count: agg.vip,
      last_interaction_at: agg.latest,
      dismissed_at: r.dismissed_at,
      dismissed_reason: r.dismissed_reason,
    };
  }

  // Unified timeline across every contact at the domain.
  const emails = contacts.map(c => c.email);
  const timeline: TimelineEntry[] = [];
  if (emails.length > 0) {
    const [cal, mails, tx] = await Promise.all([
      sb.from("hall_calendar_events")
        .select("event_id, event_title, event_start, attendee_emails")
        .overlaps("attendee_emails", emails)
        .eq("is_cancelled", false)
        .order("event_start", { ascending: false })
        .limit(timelineLimit),
      sb.from("hall_email_observations")
        .select("thread_id, subject, last_message_at, notion_source_id, attendee_emails")
        .overlaps("attendee_emails", emails)
        .order("last_message_at", { ascending: false })
        .limit(timelineLimit),
      sb.from("hall_transcript_observations")
        .select("transcript_id, title, meeting_at, meeting_link, participant_emails")
        .overlaps("participant_emails", emails)
        .order("meeting_at", { ascending: false })
        .limit(timelineLimit),
    ]);
    for (const r of (cal.data ?? []) as { event_id: string; event_title: string; event_start: string; attendee_emails: string[] }[]) {
      timeline.push({ kind: "meeting", at: r.event_start, title: r.event_title, event_id: r.event_id, attendee_count: r.attendee_emails?.length ?? 0 });
    }
    for (const r of (mails.data ?? []) as { thread_id: string; subject: string; last_message_at: string; notion_source_id: string | null }[]) {
      timeline.push({ kind: "email", at: r.last_message_at, title: r.subject, thread_id: r.thread_id, notion_source_id: r.notion_source_id });
    }
    for (const r of (tx.data ?? []) as { transcript_id: string; title: string; meeting_at: string; meeting_link: string | null }[]) {
      timeline.push({ kind: "transcript", at: r.meeting_at, title: r.title, transcript_id: r.transcript_id, meeting_link: r.meeting_link });
    }
    timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  return { org, contacts, timeline: timeline.slice(0, timelineLimit) };
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
