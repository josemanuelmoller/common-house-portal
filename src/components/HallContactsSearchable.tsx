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
import { useMemo, useState, useEffect, useRef } from "react";
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
  // Enrichment fields (from LinkedIn agent)
  linkedin:             string | null;
  job_title:            string | null;
  role_category:        string | null;
  function_area:        string | null;
};

const ROLE_CATEGORIES = ["Founder", "Executive", "Manager", "IC", "Investor", "Advisor", "Other"] as const;
const FUNCTION_AREAS  = [
  "Marketing", "Sales", "Product", "Engineering", "Design",
  "Operations", "Finance", "People", "Legal", "Strategy",
  "Sustainability", "Data", "General", "Research", "CustomerSuccess", "Other",
] as const;

function displayFor(c: SearchableContact): string {
  return (
    c.display_name
    || c.full_name
    || (c.email ?? "").split("@")[0]
    || "(no name)"
  );
}

// Normalise: accent-strip + lowercase so Spanish/Portuguese names match.
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function warmthOf(c: SearchableContact): "hot" | "warm" | "cooling" | "cold" {
  if (!c.last_seen_at) return "cold";
  const days = (Date.now() - new Date(c.last_seen_at).getTime()) / 86400_000;
  if (days < 7)  return "hot";
  if (days < 30) return "warm";
  if (days < 90) return "cooling";
  return "cold";
}

/**
 * Filter a contact against a free-text query. Supports operators:
 *   tier:founder   — role_category exact (case-insensitive)
 *   area:marketing — function_area exact
 *   class:vip      — at least one relationship_class matches
 *   warmth:hot|warm|cooling|cold — derived from last_seen_at
 *   has:linkedin | missing:linkedin — enrichment state
 *   org:gudcompany — domain or suggested org contains
 *
 * Non-operator tokens must all appear somewhere in the name / email /
 * title / area / org haystack (accent-insensitive, AND-ed).
 */
function matches(c: SearchableContact, q: string): boolean {
  if (!q.trim()) return true;
  const operators: Record<string, string> = {};
  const freeTokens: string[] = [];

  for (const raw of q.split(/\s+/).filter(Boolean)) {
    const colon = raw.indexOf(":");
    if (colon > 0 && colon < raw.length - 1) {
      const key   = raw.slice(0, colon).toLowerCase();
      const value = raw.slice(colon + 1).toLowerCase();
      operators[key] = value;
    } else {
      freeTokens.push(raw);
    }
  }

  // Operator checks
  if (operators.tier) {
    if ((c.role_category ?? "").toLowerCase() !== operators.tier) return false;
  }
  if (operators.area) {
    if ((c.function_area ?? "").toLowerCase() !== operators.area) return false;
  }
  if (operators.class) {
    const cls = (c.relationship_classes ?? []).map(x => x.toLowerCase());
    if (!cls.includes(operators.class)) return false;
  }
  if (operators.warmth) {
    if (warmthOf(c) !== operators.warmth) return false;
  }
  if (operators.has === "linkedin")     { if (!c.linkedin) return false; }
  if (operators.missing === "linkedin") { if (c.linkedin)  return false; }
  if (operators.has === "title")        { if (!c.job_title) return false; }
  if (operators.missing === "title")    { if (c.job_title)  return false; }
  if (operators.org) {
    const dom = (c.suggestion?.domain ?? "").toLowerCase();
    const nm  = (c.suggestion?.orgName ?? "").toLowerCase();
    const email = (c.email ?? "").toLowerCase();
    if (!dom.includes(operators.org) && !nm.includes(operators.org) && !email.includes(operators.org)) return false;
  }

  // Free-text haystack
  if (freeTokens.length > 0) {
    const hay = norm([
      c.display_name ?? "",
      c.full_name    ?? "",
      c.email        ?? "",
      (c.relationship_classes ?? []).join(" "),
      c.suggestion?.domain ?? "",
      c.suggestion?.orgName ?? "",
      c.auto_suggested ?? "",
      c.job_title ?? "",
      c.role_category ?? "",
      c.function_area ?? "",
    ].join(" "));
    for (const t of freeTokens) {
      if (!hay.includes(norm(t))) return false;
    }
  }

  return true;
}

type Preset = {
  id:     string;
  label:  string;
  query:  string;
  hint?:  string;
};

const PRESETS: Preset[] = [
  { id: "vips",         label: "My VIPs",          query: "class:vip",                           hint: "Decision-makers" },
  { id: "founders",     label: "Founders",         query: "tier:founder",                        hint: "All founders/CEOs" },
  { id: "investors",    label: "Investors",        query: "tier:investor",                       hint: "Partners, GPs, LPs" },
  { id: "cold_vips",    label: "Cold VIPs",        query: "class:vip warmth:cold",               hint: "Reconnect candidates" },
  { id: "no_linkedin",  label: "Missing LinkedIn", query: "missing:linkedin",                    hint: "Need manual fill" },
  { id: "no_title",     label: "Missing title",    query: "missing:title",                       hint: "Role unknown" },
  { id: "marketing",    label: "Marketing",        query: "area:marketing",                      hint: "All marketing people" },
  { id: "hot",          label: "Hot contacts",     query: "warmth:hot",                          hint: "Talked in last 7 days" },
];

export function HallContactsSearchable({
  contacts,
}: {
  contacts: SearchableContact[];
}) {
  const [query, setQuery]               = useState("");
  const [tierFilter, setTierFilter]     = useState<string>("");
  const [areaFilter, setAreaFilter]     = useState<string>("");
  const [classFilter, setClassFilter]   = useState<string>("");
  const [density, setDensity]           = useState<"card" | "compact">("card");
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts:
  //   /         → focus the search input
  //   Escape    → clear the search + filters (when input is focused or no input)
  //   ⌘/Ctrl+K  → also focuses search (common convention)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable = !!target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
      if (e.key === "/" && !inEditable) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && target === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The filter dropdowns only offer values that actually appear in the
  // current dataset. Prevents an empty "Founder" filter if there are none yet.
  const availableTiers = useMemo(
    () => ROLE_CATEGORIES.filter(t => contacts.some(c => c.role_category === t)),
    [contacts],
  );
  const availableAreas = useMemo(
    () => FUNCTION_AREAS.filter(a => contacts.some(c => c.function_area === a)),
    [contacts],
  );
  const availableClasses = useMemo(() => {
    const s = new Set<string>();
    for (const c of contacts) for (const cls of (c.relationship_classes ?? [])) s.add(cls);
    return [...s].sort();
  }, [contacts]);

  const filtered = useMemo(
    () => contacts.filter(c => {
      if (!matches(c, query)) return false;
      if (tierFilter  && c.role_category !== tierFilter) return false;
      if (areaFilter  && c.function_area !== areaFilter) return false;
      if (classFilter && !(c.relationship_classes ?? []).includes(classFilter)) return false;
      return true;
    }),
    [contacts, query, tierFilter, areaFilter, classFilter],
  );
  const anyFilterActive = !!(query || tierFilter || areaFilter || classFilter);

  // Split into "WA-only / no email" + the rest. WA-only rows go first because
  // they're the most likely to still need classification.
  const waOnly = filtered.filter(c => !c.email);
  const withEmail = filtered.filter(c => !!c.email);

  const maxIntensity = Math.max(...contacts.map(c => c.intensity), 1);
  const hotCutoff   = maxIntensity * 0.55;
  const warmCutoff  = maxIntensity * 0.20;

  return (
    <div className="space-y-5">
      {/* Search + filter bar */}
      <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#131218]/40 shrink-0">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search… or tier:founder area:marketing warmth:cold  ( / to focus)"
            className="flex-1 text-[12px] text-[#131218] placeholder:text-[#131218]/35 bg-transparent outline-none"
            autoComplete="off"
          />
          {anyFilterActive && (
            <button
              onClick={() => { setQuery(""); setTierFilter(""); setAreaFilter(""); setClassFilter(""); }}
              className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-[#131218]"
            >
              Clear all
            </button>
          )}
          <span className="text-[10px] text-[#131218]/40 tabular-nums">
            {filtered.length}/{contacts.length}
          </span>
          <div className="flex items-center gap-0.5 ml-2 border border-[#E0E0D8] rounded-lg overflow-hidden">
            <button
              onClick={() => setDensity("card")}
              className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${density === "card" ? "bg-[#131218] text-white" : "text-[#131218]/40 hover:text-[#131218]"}`}
              title="Card view"
            >
              Cards
            </button>
            <button
              onClick={() => setDensity("compact")}
              className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${density === "compact" ? "bg-[#131218] text-white" : "text-[#131218]/40 hover:text-[#131218]"}`}
              title="Compact list view"
            >
              List
            </button>
          </div>
        </div>
        {/* Preset pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-[#EFEFEA] bg-[#FAFAF6] flex-wrap">
          <span className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 mr-1">Presets</span>
          {PRESETS.map(p => {
            const active = query === p.query;
            return (
              <button
                key={p.id}
                onClick={() => setQuery(active ? "" : p.query)}
                title={p.hint}
                className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full transition-colors ${
                  active
                    ? "bg-[#131218] text-white"
                    : "bg-white border border-[#E0E0D8] text-[#131218]/60 hover:text-[#131218] hover:border-[#131218]/30"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {/* Filter dropdowns — only shown when we have values to filter by */}
        {(availableTiers.length > 0 || availableAreas.length > 0 || availableClasses.length > 0) && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-[#EFEFEA] bg-[#FAFAF6]">
            <span className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40">Filter</span>
            {availableClasses.length > 0 && (
              <FilterSelect
                label="Class"
                value={classFilter}
                onChange={setClassFilter}
                options={availableClasses}
              />
            )}
            {availableTiers.length > 0 && (
              <FilterSelect
                label="Tier"
                value={tierFilter}
                onChange={setTierFilter}
                options={availableTiers}
              />
            )}
            {availableAreas.length > 0 && (
              <FilterSelect
                label="Area"
                value={areaFilter}
                onChange={setAreaFilter}
                options={availableAreas}
              />
            )}
          </div>
        )}
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
          {density === "card" ? (
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
          ) : (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
              {withEmail.map(c => (
                <CompactRow
                  key={c.id}
                  contact={c}
                  tier={c.intensity >= hotCutoff ? "hot" : c.intensity >= warmCutoff ? "warm" : "cool"}
                />
              ))}
            </div>
          )}
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

// ─── Filter dropdown ─────────────────────────────────────────────────────────

function FilterSelect({
  label, value, onChange, options,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  options:  readonly string[];
}) {
  const active = !!value;
  return (
    <label className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1 transition-colors ${
      active ? "bg-[#131218] text-white" : "bg-white border border-[#E0E0D8] text-[#131218]/60 hover:text-[#131218]"
    }`}>
      <span className="font-bold uppercase tracking-widest text-[9px]">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`bg-transparent outline-none text-[10.5px] ${active ? "text-white" : "text-[#131218]"}`}
      >
        <option value="">all</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {active && (
        <button
          onClick={e => { e.preventDefault(); onChange(""); }}
          className="text-[10px] opacity-70 hover:opacity-100 pl-0.5"
          aria-label="Clear filter"
        >×</button>
      )}
    </label>
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
              <p className="text-[10.5px] text-[#131218]/45 mt-0.5 truncate">
                {contact.job_title ? (
                  <>
                    <span className="text-[#131218]/70">{contact.job_title}</span>
                    <span className="text-[#131218]/30"> · {domain}</span>
                  </>
                ) : domain}
              </p>
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
            {contact.role_category && (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-[#131218] text-white px-2 py-0.5 rounded-full" title="Seniority tier">
                {contact.role_category}
              </span>
            )}
            {contact.function_area && (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-[#c8f55a]/50 text-[#131218] px-2 py-0.5 rounded-full" title="Function area">
                {contact.function_area}
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

// ─── Compact row (list view) ──────────────────────────────────────────────────

function CompactRow({
  contact, tier,
}: {
  contact: SearchableContact;
  tier:    "hot" | "warm" | "cool";
}) {
  const display = displayFor(contact);
  const domain  = (contact.email ?? "").split("@")[1] ?? "";
  const dotColor = tier === "hot" ? "bg-[#22c55e]" : tier === "warm" ? "bg-[#f59e0b]" : "bg-[#9ca3af]";
  const classes  = contact.relationship_classes ?? [];
  return (
    <Link
      href={`/admin/hall/contacts/${encodeURIComponent(contact.email ?? contact.id)}`}
      prefetch={false}
      className="flex items-center gap-3 px-4 py-2 hover:bg-[#EFEFEA]/40 transition-colors"
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} title={`Warmth: ${tier}`} />
      <span className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-[12.5px] font-semibold text-[#131218] truncate">{display}</span>
        {contact.job_title && (
          <span className="text-[10.5px] text-[#131218]/55 truncate">· {contact.job_title}</span>
        )}
        <span className="text-[10px] text-[#131218]/35 truncate">· {domain}</span>
      </span>
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest shrink-0">
        {contact.role_category && (
          <span className="bg-[#131218] text-white px-1.5 py-0.5 rounded">{contact.role_category}</span>
        )}
        {contact.function_area && (
          <span className="bg-[#c8f55a]/50 text-[#131218] px-1.5 py-0.5 rounded">{contact.function_area}</span>
        )}
        {classes.slice(0, 2).map(cls => (
          <span key={cls} className="bg-[#EFEFEA] text-[#131218]/70 px-1.5 py-0.5 rounded">{cls}</span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-[#131218]/45 tabular-nums shrink-0">
        {contact.meeting_count  > 0 && <span title="Meetings">📅 {contact.meeting_count}</span>}
        {contact.email_thread_count > 0 && <span title="Email threads">✉ {contact.email_thread_count}</span>}
        {contact.wa_count > 0 && <span title="WhatsApp" className="text-emerald-700">💬 {contact.wa_count}</span>}
      </div>
    </Link>
  );
}
