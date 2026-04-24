import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import { getOrganizationRollup, isPersonalDomain } from "@/lib/contacts";
import { HallContactRow } from "@/components/HallContactRow";
import { HallContactsAutoRefresh } from "@/components/HallContactsAutoRefresh";
import { HallContactsCollapsibleList } from "@/components/HallContactsCollapsibleList";
import { HallContactsDismissedToggle } from "@/components/HallContactsDismissedToggle";
import { HallContactsByOrg } from "@/components/HallContactsByOrg";
import { HallContactsSearchable, type SearchableContact } from "@/components/HallContactsSearchable";
import { OrphansReviewSection } from "@/components/OrphansReviewSection";
import { LinkedInReviewSection } from "@/components/LinkedInReviewSection";
import { NeedsAttentionSection } from "@/components/NeedsAttentionSection";

export const dynamic = "force-dynamic";

type ContactRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  relationship_class:   string | null;
  relationship_classes: string[] | null;
  auto_suggested: string | null;
  last_meeting_title: string | null;
  meeting_count: number;
  email_thread_count: number;
  transcript_count: number;
  last_seen_at: string;
  first_seen_at: string;
  classified_at: string | null;
  classified_by: string | null;
  google_resource_name: string | null;
  google_source: string | null;
  google_labels: string[] | null;
  google_synced_at: string | null;
  google_last_write_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  linkedin: string | null;
  job_title: string | null;
  role_category: string | null;
  function_area: string | null;
  photo_url: string | null;
};

async function getContacts(): Promise<ContactRow[]> {
  const sb = getSupabaseServerClient();
  // Contacts can originate from 4 channels now (Calendar, Gmail, Fireflies,
  // WhatsApp). WA-first contacts have no email and aren't observed via
  // calendar, so the last_seen_at window is widened and the email-is-null
  // rows are allowed through.
  const { data } = await sb
    .from("people")
    .select("id, email, full_name, display_name, relationship_class, relationship_classes, auto_suggested, last_meeting_title, meeting_count, email_thread_count, transcript_count, last_seen_at, first_seen_at, classified_at, classified_by, google_resource_name, google_source, google_labels, google_synced_at, google_last_write_at, dismissed_at, dismissed_reason, linkedin, job_title, role_category, function_area, photo_url")
    .gte("last_seen_at", new Date(Date.now() - 180 * 86400_000).toISOString())
    .order("meeting_count", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(800);
  const rows = (data ?? []) as ContactRow[];
  const self = await getSelfEmails();
  return rows.filter(r => !(r.email && self.has(r.email)));
}

// Aggregate WhatsApp message counts by sender_name (lowercased).
// Used to feed the relationship-intensity score in Browse mode.
async function getWhatsappCountsBySender(): Promise<Map<string, number>> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("conversation_messages")
    .select("sender_name")
    .eq("platform", "whatsapp")
    .eq("sender_is_self", false);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { sender_name: string | null }[]) {
    const n = (r.sender_name ?? "").toLowerCase().trim();
    if (!n) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}

function waCountFor(displayName: string | null, waCounts: Map<string, number>): number {
  const n = (displayName ?? "").toLowerCase().trim();
  if (!n || n.length < 3) return 0;
  const token = n.split(/\s+/)[0];
  let total = 0;
  for (const [k, v] of waCounts) {
    if (k === n || k.startsWith(token + " ") || k.startsWith(token)) total += v;
  }
  return total;
}

function recencyBoost(lastSeen: string | null): number {
  if (!lastSeen) return 0;
  const days = (Date.now() - new Date(lastSeen).getTime()) / 86400_000;
  if (days < 7)  return 5;
  if (days < 30) return 2;
  return 0;
}

// Attendance ratio — transcripts are a proxy for actually showing up to a
// Fireflies-recorded meeting. Floor at 0.3 so contacts in chats that never
// have a bot (lots of advisor 1:1s) don't collapse to zero.
function attendanceRatio(c: ContactRow): number {
  const mt = c.meeting_count ?? 0;
  const tx = c.transcript_count ?? 0;
  if (mt === 0) return 1;
  return Math.max(0.3, Math.min(1, tx / mt));
}

function intensityOf(c: ContactRow, waCount: number): number {
  const ratio = attendanceRatio(c);
  return (c.meeting_count ?? 0) * 3 * ratio
       + (c.transcript_count ?? 0) * 2
       + (c.email_thread_count ?? 0)
       + waCount * 0.05
       + recencyBoost(c.last_seen_at);
}

// Domains treated as "personal inbox" — users on these need an explicit
// org assignment, their domain alone says nothing about affiliation.
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "pm.me",
  "aol.com", "gmx.com",
]);

function domainOf(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase();
}

type OrgSuggestion = {
  domain: string;            // the non-personal domain we matched
  orgName: string | null;    // pretty name if the hall_organizations row exists
  orgNotionId: string | null;
  matches: number;           // count of transcripts/meetings where this domain was present
  totalEvidence: number;     // total transcripts/meetings for the user
};

// For each personal-domain contact, look at every Fireflies transcript they
// appear in and tally the non-personal domains of their co-participants.
// If one domain dominates (>= 2 matches AND >= 50% of their transcripts),
// we surface it as "likely at X".
async function getOrgSuggestions(): Promise<Map<string, OrgSuggestion>> {
  const sb = getSupabaseServerClient();

  // Pull all transcripts with their participant_emails. Cheap at this scale.
  const { data: transcripts } = await sb
    .from("hall_transcript_observations")
    .select("participant_emails");

  // Tally: personalEmail → { coDomain → count, totalTranscripts }
  type Tally = { coDomains: Map<string, number>; total: number };
  const perUser = new Map<string, Tally>();

  for (const r of (transcripts ?? []) as { participant_emails: string[] | null }[]) {
    const emails = (r.participant_emails ?? []).map(e => e.toLowerCase());
    if (emails.length === 0) continue;
    const byDomain = new Map<string, Set<string>>();
    for (const e of emails) {
      const d = domainOf(e);
      if (!byDomain.has(d)) byDomain.set(d, new Set());
      byDomain.get(d)!.add(e);
    }

    for (const email of emails) {
      const d = domainOf(email);
      if (!PERSONAL_DOMAINS.has(d)) continue;

      let entry = perUser.get(email);
      if (!entry) {
        entry = { coDomains: new Map(), total: 0 };
        perUser.set(email, entry);
      }
      entry.total++;
      for (const [coDomain, coEmails] of byDomain) {
        if (coDomain === d) continue;
        if (PERSONAL_DOMAINS.has(coDomain)) continue;
        // Only count this domain once per transcript even if multiple attendees share it
        if (coEmails.size > 0) {
          entry.coDomains.set(coDomain, (entry.coDomains.get(coDomain) ?? 0) + 1);
        }
      }
    }
  }

  // Resolve top co-domain per user + look up org metadata in bulk
  const suggestions = new Map<string, OrgSuggestion>();
  const domainsNeeded = new Set<string>();
  for (const [email, tally] of perUser) {
    if (tally.total < 2) continue;
    let bestDomain: string | null = null;
    let bestCount = 0;
    for (const [d, n] of tally.coDomains) {
      if (n > bestCount) { bestDomain = d; bestCount = n; }
    }
    if (!bestDomain || bestCount < 2) continue;
    if (bestCount / tally.total < 0.5) continue;
    suggestions.set(email, {
      domain: bestDomain,
      orgName: null,
      orgNotionId: null,
      matches: bestCount,
      totalEvidence: tally.total,
    });
    domainsNeeded.add(bestDomain);
  }

  if (domainsNeeded.size > 0) {
    const { data: orgs } = await sb
      .from("hall_organizations")
      .select("domain, org_name, org_notion_id")
      .in("domain", [...domainsNeeded])
      .is("dismissed_at", null);
    const orgByDomain = new Map<string, { org_name: string | null; org_notion_id: string | null }>();
    for (const o of (orgs ?? []) as { domain: string; org_name: string | null; org_notion_id: string | null }[]) {
      orgByDomain.set(o.domain, { org_name: o.org_name, org_notion_id: o.org_notion_id });
    }
    for (const [email, s] of suggestions) {
      const hit = orgByDomain.get(s.domain);
      if (hit) {
        s.orgName     = hit.org_name;
        s.orgNotionId = hit.org_notion_id;
        suggestions.set(email, s);
      }
    }
  }

  return suggestions;
}

type PageProps = { searchParams: Promise<{ mode?: string }> };

export default async function HallContactsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { mode: modeParam } = await searchParams;
  const mode: "attention" | "browse" | "classify" | "orphans" | "linkedin" =
      modeParam === "attention" ? "attention"
    : modeParam === "classify"  ? "classify"
    : modeParam === "orphans"   ? "orphans"
    : modeParam === "linkedin"  ? "linkedin"
    :                              "browse";

  // Counts for tab badges — orphans pending + linkedin needs_review + attention total
  const sb = getSupabaseServerClient();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString();
  const [orphanCountRes, linkedinCountRes, untaggedCountRes, coldVipCountRes] = await Promise.all([
    sb.from("orphan_match_candidates").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("people").select("id", { count: "exact", head: true }).eq("linkedin_needs_review", true),
    sb.from("people").select("id", { count: "exact", head: true })
      .not("email", "is", null).is("dismissed_at", null)
      .or("relationship_classes.is.null,relationship_classes.eq.{}")
      .gt("meeting_count", 0),
    sb.from("people").select("id", { count: "exact", head: true })
      .not("email", "is", null).is("dismissed_at", null)
      .contains("relationship_classes", ["VIP"])
      .lt("last_seen_at", sixtyDaysAgo),
  ]);
  const orphanPending   = orphanCountRes.count ?? 0;
  const linkedinPending = linkedinCountRes.count ?? 0;
  const attentionCount  = (untaggedCountRes.count ?? 0) + orphanPending + linkedinPending + (coldVipCountRes.count ?? 0);

  const [contacts, rollup, waCounts, orgSuggestions] = await Promise.all([
    getContacts(),
    getOrganizationRollup(2),
    getWhatsappCountsBySender(),
    getOrgSuggestions(),
  ]);

  // Enrich every contact with their WhatsApp count + intensity score + org suggestion
  const enriched = contacts.map(c => {
    const wa_count  = waCountFor(c.display_name, waCounts);
    const intensity = intensityOf(c, wa_count);
    const total_touches = (c.meeting_count ?? 0) + (c.email_thread_count ?? 0) + (c.transcript_count ?? 0);
    const suggestion = c.email ? (orgSuggestions.get(c.email) ?? null) : null;
    return { ...c, wa_count, intensity, total_touches, suggestion };
  });

  const browse = [...enriched].filter(c => !c.dismissed_at).sort((a, b) => b.intensity - a.intensity);

  // Classify mode surfaces render HallContactRow, which requires email: string.
  // WA-only contacts (email is null) are intentionally excluded here — they
  // show up in Browse mode's dedicated "WhatsApp-only" section instead.
  type ContactRowWithEmail = ContactRow & { email: string };
  const hasEmail = (c: ContactRow): c is ContactRowWithEmail => !!c.email;
  const active: ContactRowWithEmail[]    = contacts.filter((c): c is ContactRowWithEmail => !c.dismissed_at && hasEmail(c));
  const dismissed: ContactRowWithEmail[] = contacts.filter((c): c is ContactRowWithEmail =>  !!c.dismissed_at && hasEmail(c));

  // Shape the rollup for the client component. Each org's contacts are
  // converted to the HallContactRow props shape so the existing editor
  // works inline inside each group.
  const orgsForClient = rollup.orgs.map(o => ({
    domain:              o.domain,
    contact_count:       o.contact_count,
    meeting_sum:         o.meeting_sum,
    email_sum:           o.email_sum,
    transcript_sum:      o.transcript_sum,
    vip_count:           o.vip_count,
    tagged_count:        o.tagged_count,
    untagged_count:      o.untagged_count,
    shared_classes:      o.shared_classes,
    last_interaction_at: o.last_interaction_at,
    is_personal_domain:  isPersonalDomain(o.domain),
    org_registered:      o.org_registered,
    org_name:            o.org_name,
    org_classes:         o.org_classes,
    org_notion_id:       o.org_notion_id,
    contacts: o.contacts.map(c => ({
      email:                 c.email,
      display_name:          c.display_name,
      relationship_class:    c.relationship_classes?.[0] ?? null,
      relationship_classes:  c.relationship_classes,
      auto_suggested:        c.auto_suggested,
      last_meeting_title:    c.last_meeting_title,
      meeting_count:         c.meeting_count,
      last_seen_at:          c.last_seen_at ?? c.first_seen_at,
      classified_by:         c.classified_by,
      google_resource_name:  c.google_resource_name,
      google_source:         c.google_source,
      google_last_write_at:  null,
      dismissed_at:          null,
    })),
  }));
  const hasClasses = (c: ContactRow) => (c.relationship_classes ?? []).length > 0;
  const unclassified = active.filter(c => !hasClasses(c));
  const classified = active
    .filter(hasClasses)
    .sort((a, b) => {
      const at = a.classified_at ? new Date(a.classified_at).getTime() : 0;
      const bt = b.classified_at ? new Date(b.classified_at).getTime() : 0;
      if (at !== bt) return bt - at;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });
  const PERSONAL = new Set(["Family", "Personal Service", "Friend"]);
  // VIP boost is explicit-only: only the 'VIP' tag activates the boost.
  const VIP      = new Set(["VIP"]);
  const personal = classified.filter(c => (c.relationship_classes ?? []).some(x => PERSONAL.has(x)));
  const vip      = classified.filter(c => (c.relationship_classes ?? []).some(x => VIP.has(x)));

  return (
    <div className="flex min-h-screen bg-[#f4f4ef]">
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              HALL · <b style={{ color: "var(--hall-ink-0)" }}>INTELLIGENCE</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                Contacts
              </em>
              .
            </h1>
          </div>
          <div
            className="flex items-center gap-4 text-[10px] whitespace-nowrap"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            <Stat label="OBSERVED" value={contacts.length} />
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <Stat label="UNTAGGED" value={unclassified.length} color={unclassified.length > 0 ? "var(--hall-warn)" : "var(--hall-muted-3)"} />
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <Stat label="PERSONAL" value={personal.length} />
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <Stat label="VIP" value={vip.length} color="var(--hall-lime-ink)" />
          </div>
        </header>

        <p
          className="px-9 pt-4 pb-2 text-[11.5px] max-w-3xl leading-relaxed"
          style={{ color: "var(--hall-muted-2)" }}
        >
          {mode === "attention"
            ? "Everything in your contact base that needs a decision — untagged people, matches to approve, VIPs gone cold. Aggregated from all the other tabs so you have one ritual to keep the base clean."
            : mode === "browse"
            ? "People who appear across your calendar, email, meeting transcripts and WhatsApp — ranked by relationship intensity. Click a name to dive in."
            : mode === "classify"
            ? "Classify attendees so Suggested Time Blocks treats them correctly: personal meetings skip prep, VIP meetings get urgency boost."
            : mode === "orphans"
            ? "WhatsApp and Fireflies senders the clipper flagged as medium-confidence matches to existing contacts. Approve to backfill + teach the resolver."
            : "Candidates from the LinkedIn enrichment agent with confidence between 0.4 and 0.8 — one click to approve, override, or reject."
          }
        </p>

        <div className="px-9 py-6 max-w-5xl space-y-8">
          {/* Tab navigation */}
          <div className="hall-scroll-x flex items-center gap-1 flex-nowrap" style={{ borderBottom: "1px solid var(--hall-line)" }}>
            {([
              { mode: "attention", label: "Attention", count: attentionCount, alert: true },
              { mode: "browse",    label: "Browse",    count: 0,               alert: false },
              { mode: "classify",  label: "Classify",  count: unclassified.length, alert: false },
              { mode: "orphans",   label: "Orphans",   count: orphanPending,   alert: false },
              { mode: "linkedin",  label: "LinkedIn",  count: linkedinPending, alert: false },
            ] as const).map((t) => {
              const isActive = mode === t.mode;
              return (
                <Link
                  key={t.mode}
                  href={`?mode=${t.mode}`}
                  prefetch={false}
                  className="px-4 py-2.5 text-[11.5px] font-semibold tracking-[0.01em] transition-colors flex items-baseline gap-1.5"
                  style={{
                    color: isActive ? "var(--hall-ink-0)" : "var(--hall-muted-2)",
                    borderBottom: isActive ? "2px solid var(--hall-ink-0)" : "2px solid transparent",
                    marginBottom: "-1px",
                  }}
                >
                  <span>{t.label}</span>
                  {t.count > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-hall-mono)",
                        fontSize: 10,
                        fontWeight: isActive ? 600 : 400,
                        color: t.alert ? "var(--hall-danger)" : isActive ? "var(--hall-ink-0)" : "var(--hall-muted-3)",
                      }}
                    >
                      {t.count}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="flex-1" />
            <HallContactsAutoRefresh />
          </div>

          {mode === "browse" && (
            <HallContactsSearchable
              contacts={browse.map<SearchableContact>(c => ({
                id:                   c.id,
                email:                c.email,
                full_name:            c.full_name,
                display_name:         c.display_name,
                relationship_classes: c.relationship_classes,
                auto_suggested:       c.auto_suggested,
                meeting_count:        c.meeting_count,
                email_thread_count:   c.email_thread_count,
                transcript_count:     c.transcript_count,
                wa_count:             c.wa_count,
                total_touches:        c.total_touches,
                intensity:            c.intensity,
                last_seen_at:         c.last_seen_at,
                last_meeting_title:   c.last_meeting_title,
                suggestion:           c.suggestion
                  ? { domain: c.suggestion.domain, orgName: c.suggestion.orgName ?? null }
                  : null,
                linkedin:             c.linkedin,
                job_title:            c.job_title,
                role_category:        c.role_category,
                function_area:        c.function_area,
                photo_url:            c.photo_url,
              }))}
            />
          )}

          {mode === "classify" && <>

          {/* Activation rule */}
          <div
            className="px-3.5 py-3 rounded-[3px]"
            style={{ border: "1px solid var(--hall-line-soft)", background: "var(--hall-paper-1)" }}
          >
            <p className="text-[11.5px] leading-snug" style={{ color: "var(--hall-muted-2)" }}>
              <strong style={{ color: "var(--hall-ink-0)" }}>How it works.</strong>{" "}
              When all non-you attendees are classified Family / Personal Service / Friend,
              the meeting stays on your calendar for slot planning but no prep / follow-up
              task is emitted. Only the <strong>VIP</strong> tag boosts prep urgency —
              add it on top of any role (Client, Investor, Partner, …) to mark a decision-maker.
              Unclassified attendees default to &quot;unknown&quot; — prep still emitted (fail-open).
            </p>
          </div>

          {/* Untagged queue */}
          <section>
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
            >
              <h2
                className="text-[19px] font-bold leading-none flex items-baseline gap-2"
                style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
              >
                <span>
                  Untagged ·{" "}
                  <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                    needs review
                  </em>
                </span>
                {unclassified.length > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--hall-warn)",
                    }}
                  >
                    {unclassified.length}
                  </span>
                )}
              </h2>
            </div>
            <ul className="flex flex-col">
              {unclassified.length === 0 ? (
                <li className="py-6 text-center" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                  <p className="text-[12px]" style={{ color: "var(--hall-muted-3)" }}>
                    Nothing to tag. Every observed attendee has a class.
                  </p>
                </li>
              ) : unclassified.map(c => (
                <li key={c.email} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                  <HallContactRow {...c} />
                </li>
              ))}
            </ul>
          </section>

          {/* By organization — bulk tag + rollup */}
          <HallContactsByOrg orgs={orgsForClient} />

          {/* Classified */}
          <section>
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
              >
                Classified
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  color: "var(--hall-muted-2)",
                  letterSpacing: "0.06em",
                }}
              >
                {classified.length} CONTACTS
              </span>
            </div>
            <HallContactsCollapsibleList
              rows={classified}
              initialVisible={5}
              emptyText="No contacts classified yet."
            />
          </section>

          {/* Dismissed (collapsed by default) */}
          <HallContactsDismissedToggle rows={dismissed} />
          </>}

          {mode === "attention" && <NeedsAttentionSection />}
          {mode === "orphans"   && <OrphansReviewSection />}
          {mode === "linkedin"  && <LinkedInReviewSection />}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: color ?? "var(--hall-ink-0)",
        }}
      >
        {value}
      </span>
      <span
        className="uppercase tracking-[0.08em]"
        style={{ fontSize: 9.5, color: "var(--hall-muted-2)" }}
      >
        {label}
      </span>
    </span>
  );
}

// ─── Browse view ─────────────────────────────────────────────────────────────

type EnrichedContact = ContactRow & {
  wa_count: number;
  intensity: number;
  total_touches: number;
  suggestion: OrgSuggestion | null;
};

function BrowseView({ contacts }: { contacts: EnrichedContact[] }) {
  if (contacts.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No contacts observed yet.</p>
      </div>
    );
  }

  // Three tiers by intensity, inspired by the warmth palette in PLATFORM-DESIGN.
  const maxIntensity = Math.max(...contacts.map(c => c.intensity), 1);
  const hotCutoff  = maxIntensity * 0.55;
  const warmCutoff = maxIntensity * 0.20;

  return (
    <div className="space-y-4">
      <p
        className="text-[10px] tracking-[0.08em] uppercase"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        Ranked by relationship intensity · {contacts.length} people
      </p>
      <ul className="flex flex-col">
        {contacts.map(c => (
          <ContactCard
            key={c.email}
            contact={c}
            maxIntensity={maxIntensity}
            tier={c.intensity >= hotCutoff ? "hot" : c.intensity >= warmCutoff ? "warm" : "cool"}
          />
        ))}
      </ul>
    </div>
  );
}

function ContactCard({
  contact,
  maxIntensity,
  tier,
}: {
  contact: EnrichedContact;
  maxIntensity: number;
  tier: "hot" | "warm" | "cool";
}) {
  const barPct = Math.max(4, Math.round((contact.intensity / maxIntensity) * 100));
  const barColor = tier === "hot" ? "var(--hall-ok)" : tier === "warm" ? "var(--hall-warn)" : "var(--hall-muted-3)";
  const display = contact.display_name || (contact.email ?? "").split("@")[0] || "(no name)";
  const domain  = (contact.email ?? "").split("@")[1] ?? "";
  const initial = display.slice(0, 1).toUpperCase();
  const classes = contact.relationship_classes ?? [];

  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <Link
        href={`/admin/hall/contacts/${encodeURIComponent(contact.email ?? contact.id)}`}
        prefetch={false}
        className="group block transition-colors hover:bg-[var(--hall-fill-soft)] px-1 py-3"
      >
        <div className="flex items-start gap-4">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
            style={{ background: "var(--hall-ink-0)", color: "var(--hall-paper-0)" }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p
                  className="text-[13px] font-semibold truncate group-hover:underline underline-offset-2"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {display}
                </p>
                <p
                  className="text-[10px] truncate"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  {domain || contact.email}
                </p>
              </div>
              <div
                className="flex items-center gap-3 text-[10px] flex-shrink-0"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                {contact.meeting_count > 0 && (
                  <span title={contact.meeting_count > contact.transcript_count ? `${contact.meeting_count} invited · ${contact.transcript_count} confirmed in Fireflies` : `${contact.meeting_count} meetings`}>
                    {contact.meeting_count > contact.transcript_count
                      ? `${contact.meeting_count}/${contact.transcript_count}`
                      : contact.meeting_count} mtg
                  </span>
                )}
                {contact.email_thread_count > 0 && <span>{contact.email_thread_count} mail</span>}
                {contact.transcript_count   > 0 && <span>{contact.transcript_count} tx</span>}
                {contact.wa_count           > 0 && <span>{contact.wa_count} wa</span>}
              </div>
            </div>

            {/* Intensity bar */}
            <div className="mt-3 flex items-center gap-3">
              <div
                className="flex-1 h-1 overflow-hidden"
                style={{ background: "var(--hall-line-soft)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{ width: `${barPct}%`, background: barColor }}
                />
              </div>
              <span
                className="text-[9px] tracking-[0.08em] uppercase"
                style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-muted-3)" }}
              >
                {Math.round(contact.intensity)}
              </span>
            </div>

            {/* Classes + org suggestion */}
            {(classes.length > 0 || contact.suggestion) && (
              <div className="mt-2 flex flex-wrap gap-1 items-center">
                {classes.map(cls => (
                  <span
                    key={cls}
                    className="text-[9px] px-1.5 py-0.5 uppercase"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      background: "var(--hall-fill-soft)",
                      color: "var(--hall-muted-2)",
                    }}
                  >
                    {cls}
                  </span>
                ))}
                {contact.suggestion && (
                  <span
                    title={`${contact.suggestion.matches}/${contact.suggestion.totalEvidence} transcripts match ${contact.suggestion.domain}`}
                    className="text-[9px] px-1.5 py-0.5 uppercase"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      border: "1px solid var(--hall-ink-0)",
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    likely at {contact.suggestion.orgName ?? contact.suggestion.domain}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
