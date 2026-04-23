/**
 * contact-profile — rich helpers for the /admin/hall/contacts/[email] page.
 *
 * The legacy `ContactView` in contacts.ts stays narrow so existing callers
 * (classification UI, rollups, bulk-tag, etc.) don't need to change. Here we
 * fetch the additional fields we need for the profile surfaces (enrichment,
 * shared projects, co-attendees, organization network, topic synthesis) in
 * dedicated functions so the profile page can compose them.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";

// ─── Organization cross-reference (pipeline + projects) ─────────────────────

export type OrgOpportunity = {
  id:                 string;
  title:              string;
  status:             string | null;
  pending_action:     string | null;
  opportunity_score:  number | null;
  probability:        number | null;
  value_estimate:     number | null;
  expected_close_date: string | null;
  next_meeting_at:    string | null;
  suggested_next_step: string | null;
};

export type OrgProject = {
  id:                 string;
  name:               string | null;
  project_status:     string | null;
  current_stage:      string | null;
  hall_current_focus: string | null;
  last_meeting_date:  string | null;
};

export type OrgCrossRef = {
  opportunities: OrgOpportunity[];
  projects:      OrgProject[];
};

/**
 * For an organisation identified by its Notion ID, pull active
 * opportunities and projects. Returns empty arrays when the org isn't
 * registered in Notion or has nothing in the pipeline.
 */
export async function getOrgCrossRef(orgNotionId: string | null): Promise<OrgCrossRef> {
  if (!orgNotionId) return { opportunities: [], projects: [] };
  const sb = getSupabaseServerClient();

  const [oppsRes, projsRes] = await Promise.all([
    sb.from("opportunities")
      .select("id, title, status, pending_action, opportunity_score, probability, value_estimate, expected_close_date, next_meeting_at, suggested_next_step, is_active, is_archived")
      .eq("org_notion_id", orgNotionId)
      .eq("is_archived", false)
      .order("opportunity_score", { ascending: false, nullsFirst: false })
      .limit(20),
    sb.from("projects")
      .select("id, name, project_status, current_stage, hall_current_focus, last_meeting_date")
      .eq("primary_org_notion_id", orgNotionId)
      .neq("project_status", "Archived")
      .order("last_meeting_date", { ascending: false, nullsFirst: false })
      .limit(15),
  ]);

  const opportunities = ((oppsRes.data ?? []) as OrgOpportunity[]);
  const projects      = ((projsRes.data ?? []) as OrgProject[]);

  return { opportunities, projects };
}

/**
 * Returns CH-side contacts who have co-attended the most meetings with
 * people at this organisation. Useful to answer "who on our team has
 * the strongest relationship with X?".
 */
export async function getOrgStrongestRelationships(orgDomain: string): Promise<Array<{
  email:        string;
  display_name: string | null;
  shared_touches: number;
}>> {
  const sb = getSupabaseServerClient();
  const domain = orgDomain.toLowerCase();

  // Pull every transcript where at least one participant's email ends in @domain
  const { data: transcripts } = await sb
    .from("hall_transcript_observations")
    .select("participant_emails, meeting_at")
    .order("meeting_at", { ascending: false })
    .limit(1000);

  const selfSet = await getSelfEmails();
  const tally = new Map<string, number>();

  for (const r of (transcripts ?? []) as { participant_emails: string[] | null }[]) {
    const emails = (r.participant_emails ?? []).map(e => e.toLowerCase());
    const touchesDomain = emails.some(e => (e.split("@")[1] ?? "").toLowerCase() === domain);
    if (!touchesDomain) continue;
    for (const e of emails) {
      if (!selfSet.has(e)) continue;
      tally.set(e, (tally.get(e) ?? 0) + 1);
    }
  }

  if (tally.size === 0) return [];

  const emails = [...tally.keys()];
  const { data: people } = await sb
    .from("people")
    .select("email, display_name, full_name")
    .in("email", emails);
  const nameByEmail = new Map<string, string | null>();
  for (const p of (people ?? []) as { email: string; display_name: string | null; full_name: string | null }[]) {
    nameByEmail.set(p.email, p.display_name ?? p.full_name ?? null);
  }

  return [...tally.entries()]
    .map(([e, c]) => ({ email: e, display_name: nameByEmail.get(e) ?? null, shared_touches: c }))
    .sort((a, b) => b.shared_touches - a.shared_touches)
    .slice(0, 5);
}

// ─── Adjacent contacts (prev/next navigation) ────────────────────────────────

export type AdjacentContact = {
  email:        string;
  display_name: string | null;
  full_name:    string | null;
};

/**
 * Returns the previous + next contact in the default Browse ordering
 * (ranked by meeting_count DESC, then by last_seen DESC). Used for the
 * ← / → navigation in the profile header.
 */
export async function getAdjacentContacts(email: string): Promise<{
  prev: AdjacentContact | null;
  next: AdjacentContact | null;
  position: number | null;
  total: number;
}> {
  const sb = getSupabaseServerClient();
  const key = email.toLowerCase();

  const { data } = await sb
    .from("people")
    .select("email, display_name, full_name, meeting_count, last_seen_at")
    .not("email", "is", null)
    .is("dismissed_at", null)
    .order("meeting_count", { ascending: false })
    .order("last_seen_at",  { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as AdjacentContact[];
  const idx = rows.findIndex(r => (r.email ?? "").toLowerCase() === key);
  if (idx < 0) return { prev: null, next: null, position: null, total: rows.length };
  return {
    prev:     idx > 0 ? rows[idx - 1] : null,
    next:     idx < rows.length - 1 ? rows[idx + 1] : null,
    position: idx + 1,
    total:    rows.length,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type EnrichmentFields = {
  id:                       string;
  full_name:                string | null;
  display_name:             string | null;
  photo_url:                string | null;
  photo_source:             string | null;
  linkedin:                 string | null;
  job_title:                string | null;
  role_category:            string | null;
  function_area:            string | null;
  organization_detected:    string | null;
  linkedin_confidence:      number | null;
  linkedin_source:          string | null;
  linkedin_enriched_at:     string | null;
  linkedin_needs_review:    boolean | null;
  linkedin_last_attempt_at: string | null;
  job_title_confidence:     number | null;
  job_title_source:         string | null;
  job_title_updated_at:     string | null;
  notes:                    string | null;
  phone:                    string | null;
  country:                  string | null;
  city:                     string | null;
  recurring_topics:         string[] | null;
  recurring_topics_updated_at: string | null;
  ai_summary:               string | null;
  ai_summary_updated_at:    string | null;
  open_loops:               Array<{
    direction:  "promised_by_you" | "awaiting_from_them";
    text:       string;
    source:     "transcript" | "whatsapp" | "email" | "meeting";
    source_ref: string | null;
    ts:         string | null;
    resolved:   boolean;
  }> | null;
  open_loops_updated_at:    string | null;
};

export async function getEnrichmentByEmail(email: string): Promise<EnrichmentFields | null> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("people")
    .select("id, full_name, display_name, photo_url, photo_source, linkedin, job_title, role_category, function_area, organization_detected, linkedin_confidence, linkedin_source, linkedin_enriched_at, linkedin_needs_review, linkedin_last_attempt_at, job_title_confidence, job_title_source, job_title_updated_at, notes, phone, country, city, recurring_topics, recurring_topics_updated_at, ai_summary, ai_summary_updated_at, open_loops, open_loops_updated_at")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return (data ?? null) as EnrichmentFields | null;
}

// ─── Shared projects ─────────────────────────────────────────────────────────

/**
 * Derives projects this contact has touched with CH. Sources:
 *   (a) Fireflies transcripts linked to a project (hall_transcript_observations.project_id)
 *       where the contact is a participant.
 *   (b) Calendar meetings where the contact attended and the meeting title
 *       matches a known project workstream keyword.
 *
 * We return the top-N projects ranked by touch count with first/last dates.
 */
export type SharedProject = {
  project_id:       string | null;     // null → derived from title only
  project_name:     string;
  meeting_count:    number;
  transcript_count: number;
  first_ts:         string;
  last_ts:          string;
};

export async function getSharedProjects(email: string): Promise<SharedProject[]> {
  const sb   = getSupabaseServerClient();
  const key  = email.toLowerCase();

  // Transcripts where this contact was a participant.
  // (no project_id column in the schema — bucket by normalised title)
  const { data: transcripts } = await sb
    .from("hall_transcript_observations")
    .select("title, meeting_at")
    .contains("participant_emails", [key])
    .order("meeting_at", { ascending: false })
    .limit(500);

  // Meetings where this contact was an attendee (title only, no project_id column).
  const { data: meetings } = await sb
    .from("hall_calendar_events")
    .select("event_title, event_start")
    .contains("attendee_emails", [key])
    .eq("is_cancelled", false)
    .order("event_start", { ascending: false })
    .limit(500);

  // Bucket by project_id when available, otherwise by a normalised meeting
  // title (strips dates / "Weekly" / numbering so recurring meetings fold).
  const buckets = new Map<string, {
    key:          string;
    project_id:   string | null;
    display:      string;
    meetings:     number;
    transcripts:  number;
    firstTs:      string;
    lastTs:       string;
  }>();

  const addHit = (
    bucketKey: string,
    display: string,
    projectId: string | null,
    ts: string,
    kind: "meeting" | "transcript",
  ) => {
    const prev = buckets.get(bucketKey);
    if (!prev) {
      buckets.set(bucketKey, {
        key:         bucketKey,
        project_id:  projectId,
        display,
        meetings:    kind === "meeting"    ? 1 : 0,
        transcripts: kind === "transcript" ? 1 : 0,
        firstTs:     ts,
        lastTs:      ts,
      });
      return;
    }
    if (kind === "meeting")    prev.meetings++;
    if (kind === "transcript") prev.transcripts++;
    if (ts < prev.firstTs) prev.firstTs = ts;
    if (ts > prev.lastTs)  prev.lastTs  = ts;
    // Prefer a project_id-based bucket if we see one
    if (projectId && !prev.project_id) prev.project_id = projectId;
  };

  type TR = { title: string | null; meeting_at: string | null };
  for (const r of (transcripts ?? []) as TR[]) {
    const title = (r.title ?? "").trim();
    if (!title) continue;
    const ts = r.meeting_at ?? "";
    const normalised = normaliseMeetingTitle(title);
    if (!normalised) continue;
    const bucketKey = `t:${normalised}`;
    addHit(bucketKey, normalised, null, ts, "transcript");
  }

  type MT = { event_title: string | null; event_start: string | null };
  for (const r of (meetings ?? []) as MT[]) {
    const title = (r.event_title ?? "").trim();
    if (!title) continue;
    const ts = r.event_start ?? "";
    const normalised = normaliseMeetingTitle(title);
    if (!normalised) continue;
    const bucketKey = `t:${normalised}`;
    addHit(bucketKey, normalised, null, ts, "meeting");
  }

  // Filter out very low-signal buckets (1 touch) unless the list is short.
  const ranked = [...buckets.values()]
    .sort((a, b) => (b.meetings + b.transcripts) - (a.meetings + a.transcripts));
  const strong = ranked.filter(b => (b.meetings + b.transcripts) >= 2);
  const pick = strong.length > 0 ? strong : ranked.slice(0, 3);

  return pick.slice(0, 8).map(b => ({
    project_id:       b.project_id,
    project_name:     b.display,
    meeting_count:    b.meetings,
    transcript_count: b.transcripts,
    first_ts:         b.firstTs,
    last_ts:          b.lastTs,
  }));
}

// Strip recurring-meeting noise so "Weekly PM 24 April", "Weekly PM 1 May",
// "Weekly PM Standup" all fold to "Weekly PM".
function normaliseMeetingTitle(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")                                     // parentheticals
    .replace(/\b\d{1,4}[-./]\d{1,2}([-./]\d{1,4})?\b/g, " ")        // dates
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi, " ")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi, " ")
    .replace(/\b(week|weekly|daily|monthly|quarterly|standup|sync|catchup|catch[- ]up|check[- ]in|1[- ]?on[- ]?1|1:1)\b/gi, " ")
    .replace(/\bw\d{1,2}\b/gi, " ")
    .replace(/[#|•\-–—:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// ─── Co-attendees (CH side) ───────────────────────────────────────────────────

export type CoAttendee = {
  email:          string;
  display_name:   string | null;
  shared_touches: number;
  last_ts:        string;
  is_self:        boolean;
};

export async function getCoAttendees(email: string, limit = 8): Promise<CoAttendee[]> {
  const sb  = getSupabaseServerClient();
  const key = email.toLowerCase();

  // All transcripts the contact was in
  const { data: transcripts } = await sb
    .from("hall_transcript_observations")
    .select("participant_emails, meeting_at")
    .contains("participant_emails", [key])
    .order("meeting_at", { ascending: false })
    .limit(500);

  const selfSet = await getSelfEmails(); // CH identities
  const tally = new Map<string, { count: number; last: string }>();
  for (const r of (transcripts ?? []) as { participant_emails: string[] | null; meeting_at: string | null }[]) {
    const ts = r.meeting_at ?? "";
    for (const e of (r.participant_emails ?? []).map(x => x.toLowerCase())) {
      if (e === key) continue;
      if (!e) continue;
      const prev = tally.get(e);
      if (!prev) tally.set(e, { count: 1, last: ts });
      else { prev.count++; if (ts > prev.last) prev.last = ts; }
    }
  }

  if (tally.size === 0) return [];

  // Join against people for display_name
  const emails = [...tally.keys()];
  const { data: people } = await sb
    .from("people")
    .select("email, display_name, full_name")
    .in("email", emails);
  const nameByEmail = new Map<string, string | null>();
  for (const p of (people ?? []) as { email: string; display_name: string | null; full_name: string | null }[]) {
    nameByEmail.set(p.email, p.display_name ?? p.full_name ?? null);
  }

  return [...tally.entries()]
    .map(([e, v]) => ({
      email:          e,
      display_name:   nameByEmail.get(e) ?? null,
      shared_touches: v.count,
      last_ts:        v.last,
      is_self:        selfSet.has(e),
    }))
    .sort((a, b) => {
      // CH team first, then by touch count
      if (a.is_self !== b.is_self) return a.is_self ? -1 : 1;
      return b.shared_touches - a.shared_touches;
    })
    .slice(0, limit);
}

// ─── Organization network ─────────────────────────────────────────────────────

export type OrganizationEntry = {
  domain:           string;
  org_name:         string | null;
  org_notion_id:    string | null;
  is_primary:       boolean;           // from enrichment's organization_detected
  is_ch:            boolean;           // our own org
  shared_meetings:  number;            // how many meetings this contact has where someone from this domain was present
  last_ts:          string | null;
  other_contacts:   { email: string; display_name: string | null }[];
};

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "pm.me",
  "aol.com", "gmx.com",
]);

const CH_DOMAINS = new Set(["wearecommonhouse.com"]);

export async function getContactOrganizations(
  email: string,
  enrichment: EnrichmentFields | null,
): Promise<OrganizationEntry[]> {
  const sb  = getSupabaseServerClient();
  const key = email.toLowerCase();

  // Gather non-personal domains the contact has co-attended with, plus their
  // first/last dates.
  const { data: transcripts } = await sb
    .from("hall_transcript_observations")
    .select("participant_emails, meeting_at")
    .contains("participant_emails", [key])
    .order("meeting_at", { ascending: false })
    .limit(500);

  type DomainTally = { count: number; last: string; coContacts: Set<string> };
  const domainTally = new Map<string, DomainTally>();

  for (const r of (transcripts ?? []) as { participant_emails: string[] | null; meeting_at: string | null }[]) {
    const ts = r.meeting_at ?? "";
    const seenDomainsThisMeeting = new Set<string>();
    const coEmailsForThisMeeting: string[] = [];
    for (const e of (r.participant_emails ?? []).map(x => x.toLowerCase())) {
      if (!e) continue;
      if (e === key) continue;
      coEmailsForThisMeeting.push(e);
      const d = (e.split("@")[1] ?? "").toLowerCase();
      if (!d || PERSONAL_DOMAINS.has(d)) continue;
      seenDomainsThisMeeting.add(d);
    }
    for (const d of seenDomainsThisMeeting) {
      const prev = domainTally.get(d);
      if (!prev) domainTally.set(d, { count: 1, last: ts, coContacts: new Set(coEmailsForThisMeeting.filter(e => (e.split("@")[1] ?? "").toLowerCase() === d)) });
      else {
        prev.count++;
        if (ts > prev.last) prev.last = ts;
        for (const e of coEmailsForThisMeeting) {
          if ((e.split("@")[1] ?? "").toLowerCase() === d) prev.coContacts.add(e);
        }
      }
    }
  }

  // Also ensure the contact's own domain is tracked even if no transcripts
  const ownDomain = (key.split("@")[1] ?? "").toLowerCase();
  if (ownDomain && !PERSONAL_DOMAINS.has(ownDomain) && !domainTally.has(ownDomain)) {
    domainTally.set(ownDomain, { count: 0, last: "", coContacts: new Set() });
  }

  // If enrichment surfaces a detected org, make sure it's in the list as
  // primary. We don't have a domain per-se for a text org name, so we
  // stamp it under a synthetic key `__enrichment__` if no domain matches.
  const allDomains = [...domainTally.keys()];
  const { data: orgs } = await sb
    .from("hall_organizations")
    .select("domain, org_name, org_notion_id")
    .in("domain", allDomains);
  const orgByDomain = new Map<string, { org_name: string | null; org_notion_id: string | null }>();
  for (const o of (orgs ?? []) as { domain: string; org_name: string | null; org_notion_id: string | null }[]) {
    orgByDomain.set(o.domain, { org_name: o.org_name, org_notion_id: o.org_notion_id });
  }

  // Resolve other contacts' names in bulk
  const allCoEmails = new Set<string>();
  for (const t of domainTally.values()) for (const e of t.coContacts) allCoEmails.add(e);
  const { data: coPeople } = allCoEmails.size > 0
    ? await sb.from("people").select("email, display_name, full_name").in("email", [...allCoEmails])
    : { data: [] };
  const nameByEmail = new Map<string, string | null>();
  for (const p of (coPeople ?? []) as { email: string; display_name: string | null; full_name: string | null }[]) {
    nameByEmail.set(p.email, p.display_name ?? p.full_name ?? null);
  }

  // Resolve primary domain from enrichment: if organization_detected text
  // matches one of our orgs by name, promote it. Else just flag the contact's
  // own domain as primary.
  let primaryDomain: string | null = null;
  const detectedOrgLower = (enrichment?.organization_detected ?? "").toLowerCase().trim();
  if (detectedOrgLower) {
    for (const [domain, meta] of orgByDomain) {
      if ((meta.org_name ?? "").toLowerCase().trim() === detectedOrgLower) {
        primaryDomain = domain;
        break;
      }
    }
  }
  if (!primaryDomain && ownDomain && !PERSONAL_DOMAINS.has(ownDomain)) primaryDomain = ownDomain;

  const entries: OrganizationEntry[] = [];
  for (const [domain, t] of domainTally) {
    const orgMeta = orgByDomain.get(domain);
    entries.push({
      domain,
      org_name:        orgMeta?.org_name ?? null,
      org_notion_id:   orgMeta?.org_notion_id ?? null,
      is_primary:      domain === primaryDomain,
      is_ch:           CH_DOMAINS.has(domain),
      shared_meetings: t.count,
      last_ts:         t.last || null,
      other_contacts:  [...t.coContacts].map(e => ({ email: e, display_name: nameByEmail.get(e) ?? null })).slice(0, 5),
    });
  }

  // Sort: primary first, CH next, then by shared_meetings DESC
  entries.sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.is_ch      !== b.is_ch)      return a.is_ch ? -1 : 1;
    return b.shared_meetings - a.shared_meetings;
  });

  // If enrichment surfaced an org that didn't match any known domain, add a
  // synthetic entry at the top so the user still sees "🏢 UN Women · detected
  // from LinkedIn · not yet in your org list"
  if (detectedOrgLower && !primaryDomain) {
    entries.unshift({
      domain:          "",
      org_name:        enrichment?.organization_detected ?? null,
      org_notion_id:   null,
      is_primary:      true,
      is_ch:           false,
      shared_meetings: 0,
      last_ts:         null,
      other_contacts:  [],
    });
  }

  return entries;
}
