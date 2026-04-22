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
};

async function getContacts(): Promise<ContactRow[]> {
  const sb = getSupabaseServerClient();
  // Contacts can originate from 4 channels now (Calendar, Gmail, Fireflies,
  // WhatsApp). WA-first contacts have no email and aren't observed via
  // calendar, so the last_seen_at window is widened and the email-is-null
  // rows are allowed through.
  const { data } = await sb
    .from("people")
    .select("id, email, full_name, display_name, relationship_class, relationship_classes, auto_suggested, last_meeting_title, meeting_count, email_thread_count, transcript_count, last_seen_at, first_seen_at, classified_at, classified_by, google_resource_name, google_source, google_labels, google_synced_at, google_last_write_at, dismissed_at, dismissed_reason, linkedin, job_title, role_category, function_area")
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
  const mode: "browse" | "classify" | "orphans" | "linkedin" =
      modeParam === "classify"  ? "classify"
    : modeParam === "orphans"   ? "orphans"
    : modeParam === "linkedin"  ? "linkedin"
    :                              "browse";

  // Counts for tab badges — orphans pending + linkedin needs_review
  const sb = getSupabaseServerClient();
  const [orphanCountRes, linkedinCountRes] = await Promise.all([
    sb.from("orphan_match_candidates").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("people").select("id", { count: "exact", head: true }).eq("linkedin_needs_review", true),
  ]);
  const orphanPending   = orphanCountRes.count ?? 0;
  const linkedinPending = linkedinCountRes.count ?? 0;

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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Hall · Intelligence
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                <em className="font-black italic text-[#c8f55a]">Contacts</em>
              </h1>
              <p className="text-sm text-white/40 mt-3 max-w-2xl">
                {mode === "browse"
                  ? "People who appear across your calendar, email, meeting transcripts and WhatsApp — ranked by relationship intensity. Click a name to dive in."
                  : mode === "classify"
                  ? "Classify attendees so Suggested Time Blocks treats them correctly: personal meetings skip prep, VIP meetings get urgency boost."
                  : mode === "orphans"
                  ? "WhatsApp and Fireflies senders the clipper flagged as medium-confidence matches to existing contacts. Approve to backfill + teach the resolver."
                  : "Candidates from the LinkedIn enrichment agent with confidence between 0.4 and 0.8 — one click to approve, override, or reject."
                }
              </p>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Observed" value={contacts.length} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Untagged" value={unclassified.length} color={unclassified.length > 0 ? "text-amber-400" : "text-white/30"} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Personal" value={personal.length} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="VIP" value={vip.length} color="text-[#c8f55a]" />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-8">
          {/* Tab navigation */}
          <div className="flex items-center gap-1 border-b border-[#E0E0D8]">
            <Link
              href="?mode=browse"
              prefetch={false}
              className={`px-4 py-2.5 text-[11px] font-bold tracking-widest uppercase border-b-2 transition-colors ${
                mode === "browse"
                  ? "border-[#131218] text-[#131218]"
                  : "border-transparent text-[#131218]/40 hover:text-[#131218]/70"
              }`}
            >
              Browse
            </Link>
            <Link
              href="?mode=classify"
              prefetch={false}
              className={`px-4 py-2.5 text-[11px] font-bold tracking-widest uppercase border-b-2 transition-colors ${
                mode === "classify"
                  ? "border-[#131218] text-[#131218]"
                  : "border-transparent text-[#131218]/40 hover:text-[#131218]/70"
              }`}
            >
              Classify
              {unclassified.length > 0 && (
                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                  {unclassified.length}
                </span>
              )}
            </Link>
            <Link
              href="?mode=orphans"
              prefetch={false}
              className={`px-4 py-2.5 text-[11px] font-bold tracking-widest uppercase border-b-2 transition-colors ${
                mode === "orphans"
                  ? "border-[#131218] text-[#131218]"
                  : "border-transparent text-[#131218]/40 hover:text-[#131218]/70"
              }`}
            >
              Orphans
              {orphanPending > 0 && (
                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                  {orphanPending}
                </span>
              )}
            </Link>
            <Link
              href="?mode=linkedin"
              prefetch={false}
              className={`px-4 py-2.5 text-[11px] font-bold tracking-widest uppercase border-b-2 transition-colors ${
                mode === "linkedin"
                  ? "border-[#131218] text-[#131218]"
                  : "border-transparent text-[#131218]/40 hover:text-[#131218]/70"
              }`}
            >
              LinkedIn
              {linkedinPending > 0 && (
                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                  {linkedinPending}
                </span>
              )}
            </Link>
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
              }))}
            />
          )}

          {mode === "classify" && <>

          {/* Activation rule */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-3.5">
            <p className="text-[11px] text-[#131218]/60 leading-snug">
              <strong className="text-[#131218]">How it works.</strong>{" "}
              When all non-you attendees are classified Family / Personal Service / Friend,
              the meeting stays on your calendar for slot planning but no prep / follow-up
              task is emitted. Only the <strong>VIP</strong> tag boosts prep urgency —
              add it on top of any role (Client, Investor, Partner, …) to mark a decision-maker.
              Unclassified attendees default to "unknown" — prep still emitted (fail-open).
            </p>
          </div>

          {/* Untagged queue */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Untagged — needs review</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              {unclassified.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {unclassified.length}
                </span>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
              {unclassified.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-[#131218]/25">Nothing to tag. Every observed attendee has a class.</p>
                </div>
              ) : unclassified.map(c => (
                <HallContactRow key={c.email} {...c} />
              ))}
            </div>
          </section>

          {/* By organization — bulk tag + rollup */}
          <HallContactsByOrg orgs={orgsForClient} />

          {/* Classified */}
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Classified</h2>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              <span className="text-[10px] font-semibold text-[#131218]/30">{classified.length}</span>
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

          {mode === "orphans"  && <OrphansReviewSection />}
          {mode === "linkedin" && <LinkedInReviewSection />}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-right">
      <p className={`text-[2rem] font-black tracking-tight leading-none ${color}`}>{value}</p>
      <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">{label}</p>
    </div>
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
      <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-10 text-center">
        <p className="text-sm text-[#131218]/40">No contacts observed yet.</p>
      </div>
    );
  }

  // Three tiers by intensity, inspired by the warmth palette in PLATFORM-DESIGN.
  const maxIntensity = Math.max(...contacts.map(c => c.intensity), 1);
  const hotCutoff  = maxIntensity * 0.55;
  const warmCutoff = maxIntensity * 0.20;

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/40">
        Ranked by relationship intensity · {contacts.length} people
      </p>
      <div className="grid gap-3">
        {contacts.map(c => (
          <ContactCard
            key={c.email}
            contact={c}
            maxIntensity={maxIntensity}
            tier={c.intensity >= hotCutoff ? "hot" : c.intensity >= warmCutoff ? "warm" : "cool"}
          />
        ))}
      </div>
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
  const barColor = tier === "hot" ? "bg-[#22c55e]" : tier === "warm" ? "bg-[#f59e0b]" : "bg-[#9ca3af]";
  const display = contact.display_name || (contact.email ?? "").split("@")[0] || "(no name)";
  const domain  = (contact.email ?? "").split("@")[1] ?? "";
  const initial = display.slice(0, 1).toUpperCase();
  const classes = contact.relationship_classes ?? [];

  return (
    <Link
      href={`/admin/hall/contacts/${encodeURIComponent(contact.email ?? contact.id)}`}
      prefetch={false}
      className="group bg-white rounded-2xl border border-[#E0E0D8] hover:border-[#131218]/30 hover:shadow-sm transition-all px-5 py-4"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#131218] text-white flex items-center justify-center flex-shrink-0 font-bold text-sm">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[#131218] truncate group-hover:underline decoration-[#131218]/30 underline-offset-2">
                {display}
              </p>
              <p className="text-[10px] text-[#131218]/45 truncate">
                {domain || contact.email}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#131218]/55 font-medium flex-shrink-0">
              {contact.meeting_count > 0 && (
                <span title={contact.meeting_count > contact.transcript_count ? `${contact.meeting_count} invited · ${contact.transcript_count} confirmed in Fireflies` : `${contact.meeting_count} meetings`}>
                  📅 {contact.meeting_count > contact.transcript_count
                    ? `${contact.meeting_count}/${contact.transcript_count}`
                    : contact.meeting_count}
                </span>
              )}
              {contact.email_thread_count > 0 && <span>📧 {contact.email_thread_count}</span>}
              {contact.transcript_count   > 0 && <span>🎙️ {contact.transcript_count}</span>}
              {contact.wa_count           > 0 && <span>💬 {contact.wa_count}</span>}
            </div>
          </div>

          {/* Intensity bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full bg-[#EFEFEA] overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">
              {Math.round(contact.intensity)}
            </span>
          </div>

          {/* Classes + org suggestion */}
          {(classes.length > 0 || contact.suggestion) && (
            <div className="mt-2 flex flex-wrap gap-1 items-center">
              {classes.map(cls => (
                <span
                  key={cls}
                  className="text-[8px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-[#131218]/5 text-[#131218]/55"
                >
                  {cls}
                </span>
              ))}
              {contact.suggestion && (
                <span
                  title={`${contact.suggestion.matches}/${contact.suggestion.totalEvidence} transcripts match ${contact.suggestion.domain}`}
                  className="text-[8px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-[#c8f55a]/25 text-[#131218]/75 border border-[#c8f55a]/60"
                >
                  🔗 likely at {contact.suggestion.orgName ?? contact.suggestion.domain}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
