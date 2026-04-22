"use client";

/**
 * HallContactsSearchable — unified browse+search view for /admin/hall/contacts.
 *
 * Wraps the existing ContactCard layout with:
 *   - a search input that filters client-side by name / email / classes /
 *     organisation domain
 *   - a dedicated "WhatsApp-only" section that surfaces contacts with no
 *     email (email-is-null rows created by the WA clipper or by the
 *     whatsapp_clipper_backfill pass). These do not belong to a domain
 *     rollup and would otherwise disappear from the page.
 *
 * All filtering is local to the already-hydrated list — no network fetch.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { WaOnlyContactRow } from "./WaOnlyContactRow";

export type SearchableContact = {
  id:                   string;
  email:                string | null;
  full_name:            string | null;
  display_name:         string | null;
  relationship_classes: string[] | null;
  auto_suggested:       string | null;
  meeting_count:        number;
  email_thread_count:   number;
  transcript_count:     number;
  wa_count:             number;
  total_touches:        number;
  intensity:            number;
  last_seen_at:         string | null;
  last_meeting_title:   string | null;
  suggestion:           { domain: string; orgName: string | null } | null;
};

function displayFor(c: SearchableContact): string {
  return (
    c.display_name
    || c.full_name
    || (c.email ?? "").split("@")[0]
    || "(no name)"
  );
}

function matches(c: SearchableContact, q: string): boolean {
  if (!q) return true;
  const hay = [
    c.display_name ?? "",
    c.full_name    ?? "",
    c.email        ?? "",
    (c.relationship_classes ?? []).join(" "),
    c.suggestion?.domain ?? "",
    c.suggestion?.orgName ?? "",
    c.auto_suggested ?? "",
  ].join(" ").toLowerCase();
  // Every whitespace-separated token in the query must appear in the haystack.
  // Accent-insensitive via NFD + combining-mark strip.
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nq = norm(q.toLowerCase());
  const nh = norm(hay);
  return nq.split(/\s+/).filter(Boolean).every(t => nh.includes(t));
}

export function HallContactsSearchable({
  contacts,
}: {
  contacts: SearchableContact[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => contacts.filter(c => matches(c, query)),
    [contacts, query],
  );

  // Split into "WA-only / no email" + the rest. WA-only rows go first because
  // they're the most likely to still need classification.
  const waOnly = filtered.filter(c => !c.email);
  const withEmail = filtered.filter(c => !!c.email);

  const maxIntensity = Math.max(...contacts.map(c => c.intensity), 1);
  const hotCutoff   = maxIntensity * 0.55;
  const warmCutoff  = maxIntensity * 0.20;

  return (
    <div className="space-y-5">
      {/* Search input */}
      <div className="bg-white rounded-2xl border border-[#E0E0D8] px-4 py-3 flex items-center gap-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#131218]/40 shrink-0">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, email, class, or organisation…"
          className="flex-1 text-[12px] text-[#131218] placeholder:text-[#131218]/35 bg-transparent outline-none"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-[#131218]"
          >
            Clear
          </button>
        )}
        <span className="text-[10px] text-[#131218]/40 tabular-nums">
          {filtered.length}/{contacts.length}
        </span>
      </div>

      {/* WhatsApp-only — contacts with no email (and therefore no domain) */}
      {waOnly.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">
              WhatsApp-only — no email yet
            </h2>
            <div className="flex-1 h-px bg-[#E0E0D8]" />
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
              {waOnly.length}
            </span>
          </div>
          <p className="text-[10.5px] text-[#131218]/50 mb-2 leading-snug">
            These were auto-created from WhatsApp clips. Tag them so they count
            for prep-brief and warmth scoring. Google Contacts sync is skipped
            until you add an email manually.
          </p>
          <div className="grid gap-2">
            {waOnly.map(c => (
              <WaOnlyContactRow
                key={c.id}
                contact={c}
                allContacts={withEmail}
              />
            ))}
          </div>
        </section>
      )}

      {/* Regular list — ranked by intensity */}
      {withEmail.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">
              {query ? "Matching contacts" : "All contacts"}
            </h2>
            <div className="flex-1 h-px bg-[#E0E0D8]" />
            <span className="text-[10px] text-[#131218]/40 tabular-nums">
              {withEmail.length}
            </span>
          </div>
          <div className="grid gap-3">
            {withEmail.map(c => (
              <WithEmailCard
                key={c.id}
                contact={c}
                maxIntensity={maxIntensity}
                tier={c.intensity >= hotCutoff ? "hot" : c.intensity >= warmCutoff ? "warm" : "cool"}
              />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-10 text-center">
          <p className="text-sm text-[#131218]/40">
            {query ? `No contacts match "${query}".` : "No contacts observed yet."}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Regular contact card ─────────────────────────────────────────────────────

function WithEmailCard({
  contact, maxIntensity, tier,
}: {
  contact:       SearchableContact;
  maxIntensity:  number;
  tier:          "hot" | "warm" | "cool";
}) {
  const barPct   = Math.max(4, Math.round((contact.intensity / maxIntensity) * 100));
  const barColor = tier === "hot" ? "bg-[#22c55e]" : tier === "warm" ? "bg-[#f59e0b]" : "bg-[#9ca3af]";
  const display  = displayFor(contact);
  const domain   = (contact.email ?? "").split("@")[1] ?? "";
  const initial  = display.slice(0, 1).toUpperCase();
  const classes  = contact.relationship_classes ?? [];

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
              <p className="text-[13px] font-semibold text-[#131218] truncate">{display}</p>
              <p className="text-[10.5px] text-[#131218]/45 mt-0.5 truncate">{domain}</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#131218]/50 shrink-0 tabular-nums">
              {contact.meeting_count  > 0 && <span title="Meetings">📅 {contact.meeting_count}</span>}
              {contact.email_thread_count > 0 && <span title="Email threads">✉ {contact.email_thread_count}</span>}
              {contact.transcript_count > 0 && <span title="Transcripts">🎙 {contact.transcript_count}</span>}
              {contact.wa_count > 0 && <span title="WhatsApp msgs" className="text-emerald-700">💬 {contact.wa_count}</span>}
            </div>
          </div>
          <div className="relative mt-2.5 h-1.5 w-full bg-[#EFEFEA] rounded-full overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${barPct}%` }} />
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {classes.map(cls => (
              <span key={cls} className="text-[9px] font-bold uppercase tracking-widest bg-[#EFEFEA] text-[#131218]/70 px-2 py-0.5 rounded-full">
                {cls}
              </span>
            ))}
            {classes.length === 0 && (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                Untagged
              </span>
            )}
            {contact.suggestion && (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-[#c8f55a]/30 text-[#131218]/80 px-2 py-0.5 rounded-full" title={`Inferred from ${contact.suggestion.domain}`}>
                Likely at {contact.suggestion.orgName ?? contact.suggestion.domain}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
