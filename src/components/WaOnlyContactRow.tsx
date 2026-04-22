"use client";

/**
 * WaOnlyContactRow — interactive accordion for a WhatsApp-only contact
 * (a `people` row with email IS NULL, usually created by the WA clipper
 * when the sender name didn't resolve to an existing contact).
 *
 * The row is collapsed by default. Clicking the chevron expands it into
 * three action panels:
 *
 *   1. "Is this…?" — top suggestions from /api/hall-contacts/suggest-match,
 *      each with a one-click Merge button.
 *   2. "Search manually" — client-side typeahead across every other contact
 *      in the filtered list (name/email/alias match).
 *   3. "Or tag as new" — class buttons that classify the WA-only row in
 *      place via POST /api/hall-contacts with person_id (no email needed).
 *
 * Merge → re-points their WA messages onto the target and absorbs the
 * sender name as an alias, so the resolver will match them automatically
 * on future clips.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SearchableContact } from "./HallContactsSearchable";

const CLASSES = [
  { v: "VIP",              label: "VIP",              kind: "vip" },
  { v: "Friend",           label: "Friend",           kind: "personal" },
  { v: "Family",           label: "Family",           kind: "personal" },
  { v: "Personal Service", label: "Personal Service", kind: "personal" },
  { v: "Team",             label: "Team",             kind: "work" },
  { v: "Portfolio",        label: "Portfolio",        kind: "work" },
  { v: "Investor",         label: "Investor",         kind: "work" },
  { v: "Funder",           label: "Funder",           kind: "work" },
  { v: "Client",           label: "Client",           kind: "work" },
  { v: "Partner",          label: "Partner",          kind: "work" },
  { v: "Vendor",           label: "Vendor",           kind: "work" },
  { v: "External",         label: "External",         kind: "work" },
] as const;

type Suggestion = {
  person_id:     string;
  full_name:     string;
  display_name:  string | null;
  email:         string;
  confidence:    number;
  reason:        string;
  wa_count:      number;
  meeting_count: number;
};

function displayFor(c: SearchableContact): string {
  return c.display_name || c.full_name || (c.email ?? "").split("@")[0] || "(no name)";
}

export function WaOnlyContactRow({
  contact,
  allContacts,
}: {
  contact:     SearchableContact;
  /** The whole filtered list so the manual search can typeahead across any other contact. */
  allContacts: SearchableContact[];
}) {
  const router = useRouter();
  const [expanded, setExpanded]       = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [classes, setClasses]         = useState<string[]>(contact.relationship_classes ?? []);
  const [pending, startTransition]    = useTransition();

  // Profile form (4th panel — "make this a full contact").
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profile, setProfile] = useState({
    email:        "",
    full_name:    contact.full_name ?? contact.display_name ?? "",
    display_name: contact.display_name ?? "",
    linkedin:     "",
    job_title:    "",
    phone:        "",
    notes:        "",
  });
  const [profileConflict, setProfileConflict] = useState<{ full_name: string | null; display_name: string | null; email: string } | null>(null);

  const display = displayFor(contact);
  const initial = display.slice(0, 1).toUpperCase();

  async function openAndLoad() {
    setExpanded(true);
    if (loaded) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hall-contacts/suggest-match?person_id=${encodeURIComponent(contact.id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "suggest-match failed");
      setSuggestions((json.suggestions ?? []) as Suggestion[]);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doMerge(targetId: string, targetLabel: string) {
    if (!confirm(`Merge "${display}" into "${targetLabel}"? All ${contact.wa_count} WhatsApp messages will move and "${display}" will become an alias of the target. This is reversible via undo in the audit log.`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hall-contacts/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_id: contact.id, target_id: targetId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "merge failed");
      // Hide locally + ask server to refresh (the Browse list is server-rendered).
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileConflict(null);
    setError(null);
    try {
      // Only send fields the user actually filled in. An empty string means
      // "don't touch this field" (except for email, which we want to clear if
      // left empty — but we won't clear email here, we only set it from null).
      const payload: Record<string, string | null> = { person_id: contact.id };
      if (profile.email.trim())        payload.email        = profile.email.trim();
      if (profile.full_name.trim())    payload.full_name    = profile.full_name.trim();
      if (profile.display_name.trim()) payload.display_name = profile.display_name.trim();
      if (profile.linkedin.trim())     payload.linkedin     = profile.linkedin.trim();
      if (profile.job_title.trim())    payload.job_title    = profile.job_title.trim();
      if (profile.phone.trim())        payload.phone        = profile.phone.trim();
      if (profile.notes.trim())        payload.notes        = profile.notes.trim();
      if (Object.keys(payload).length <= 1) {
        throw new Error("Add at least one field before saving");
      }

      const res = await fetch(`/api/hall-contacts/profile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.status === 409 && json.conflict_with) {
        setProfileConflict(json.conflict_with);
        throw new Error("That email already belongs to another contact. Merge instead?");
      }
      if (!res.ok) throw new Error(json.error ?? "profile update failed");

      // Success: tell the server to re-render the page. If an email was added,
      // the row graduates from WA-only → All contacts on refresh.
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileSaving(false);
    }
  }

  async function toggleClass(cls: string) {
    const next = classes.includes(cls) ? classes.filter(c => c !== cls) : [...classes, cls];
    // Optimistic update
    setClasses(next);
    try {
      const res = await fetch(`/api/hall-contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ person_id: contact.id, relationship_classes: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "tag failed");
      startTransition(() => router.refresh());
    } catch (e) {
      // Roll back
      setClasses(classes);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Manual typeahead — scan allContacts that (a) aren't the source itself,
  // (b) have an email (otherwise merging makes no sense), and (c) match q.
  const manualHits = (() => {
    if (manualQuery.trim().length < 2) return [];
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const nq = norm(manualQuery);
    const seen = new Set<string>();
    const out: SearchableContact[] = [];
    for (const c of allContacts) {
      if (c.id === contact.id) continue;
      if (!c.email) continue;
      if (seen.has(c.id)) continue;
      const hay = norm([c.display_name ?? "", c.full_name ?? "", c.email].join(" "));
      if (hay.includes(nq)) {
        out.push(c);
        seen.add(c.id);
      }
      if (out.length >= 8) break;
    }
    return out;
  })();

  return (
    <div className={`bg-white rounded-2xl border border-[#E0E0D8] transition-all ${expanded ? "ring-1 ring-[#131218]/10" : ""} ${pending ? "opacity-50" : ""}`}>
      <button
        onClick={() => expanded ? setExpanded(false) : openAndLoad()}
        className="w-full px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#131218] text-white flex items-center justify-center font-bold text-[12px] shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-[#131218] truncate">{display}</p>
            <p className="text-[10px] text-[#131218]/45 mt-0.5">
              <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest mr-2">
                WA
              </span>
              {contact.wa_count} messages ·{" "}
              {classes.length > 0
                ? <span className="text-[#131218]/70">{classes.join(", ")}</span>
                : <span className="text-amber-700">untagged</span>}
              {contact.auto_suggested && (
                <span className="ml-2 text-[#131218]/35">· {contact.auto_suggested}</span>
              )}
            </p>
          </div>
          <span className={`text-[9px] opacity-40 transition-transform shrink-0 ${expanded ? "" : "-rotate-90"}`}>▾</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#EFEFEA] px-5 py-4 space-y-5">
          {error && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* ─── Is this…? ─── */}
          <section>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/60 mb-2">
              🤝 Is this the same person as…?
            </h3>
            {loading && <p className="text-[11px] text-[#131218]/40">Checking possible matches…</p>}
            {!loading && loaded && suggestions.length === 0 && (
              <p className="text-[11px] text-[#131218]/40">
                No structural matches. Try the manual search below, or just tag them as a new person.
              </p>
            )}
            {!loading && suggestions.length > 0 && (
              <ul className="space-y-1.5">
                {suggestions.map(s => (
                  <li key={s.person_id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#F7F7F3] border border-[#EFEFEA]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[#131218] truncate">{s.full_name}</p>
                      <p className="text-[10px] text-[#131218]/45 truncate">
                        {s.email} · {pctBadge(s.confidence)} via {s.reason}
                        {s.meeting_count > 0 && ` · 📅 ${s.meeting_count}`}
                        {s.wa_count > 0 && ` · 💬 ${s.wa_count}`}
                      </p>
                    </div>
                    <button
                      onClick={() => doMerge(s.person_id, s.full_name)}
                      disabled={loading}
                      className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-3 py-1.5 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40"
                    >
                      ✓ Merge
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ─── Search manually ─── */}
          <section>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/60 mb-2">
              🔍 Not them? Search manually
            </h3>
            <input
              type="search"
              value={manualQuery}
              onChange={e => setManualQuery(e.target.value)}
              placeholder="Type a name or email to find the match…"
              className="w-full text-[12px] px-3 py-2 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
            />
            {manualHits.length > 0 && (
              <ul className="mt-2 space-y-1">
                {manualHits.map(c => (
                  <li key={c.id}
                      className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-[#F7F7F3]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11.5px] font-semibold text-[#131218] truncate">{displayFor(c)}</p>
                      <p className="text-[10px] text-[#131218]/45 truncate">{c.email}</p>
                    </div>
                    <button
                      onClick={() => doMerge(c.id, displayFor(c))}
                      disabled={loading}
                      className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/70 hover:text-[#131218] border border-[#131218]/20 hover:border-[#131218]/50 px-2.5 py-1 rounded-lg disabled:opacity-40"
                    >
                      Merge
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ─── Or tag as new ─── */}
          <section>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/60 mb-2">
              🏷️ Or they&apos;re someone new — tag them
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {CLASSES.map(c => {
                const active = classes.includes(c.v);
                return (
                  <button
                    key={c.v}
                    onClick={() => toggleClass(c.v)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? c.kind === "vip"      ? "bg-[#c8f55a]/40 border-[#131218]/30 text-[#131218]"
                        : c.kind === "personal" ? "bg-amber-50    border-amber-200     text-amber-700"
                        :                         "bg-[#EFEFEA]    border-[#131218]/20  text-[#131218]"
                        : "bg-white border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/30"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#131218]/35 mt-2 leading-snug">
              Tagging a WA-only contact is fine — Google Contacts sync is skipped until you add an email.
            </p>
          </section>

          {/* ─── Make it a full contact ─── */}
          <section>
            <button
              onClick={() => setProfileOpen(v => !v)}
              className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/60 hover:text-[#131218] flex items-center gap-2"
            >
              ✨ Make them a full contact
              <span className={`text-[8px] opacity-40 transition-transform ${profileOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {profileOpen && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Input label="Email"        value={profile.email}        onChange={v => setProfile(p => ({ ...p, email: v }))}        placeholder="nacho@rivera.com"  type="email" />
                <Input label="Full name"    value={profile.full_name}    onChange={v => setProfile(p => ({ ...p, full_name: v }))}    placeholder="Nacho Rivera" />
                <Input label="LinkedIn"     value={profile.linkedin}     onChange={v => setProfile(p => ({ ...p, linkedin: v }))}     placeholder="linkedin.com/in/…" />
                <Input label="Job title"    value={profile.job_title}    onChange={v => setProfile(p => ({ ...p, job_title: v }))}    placeholder="CEO at …" />
                <Input label="Phone"        value={profile.phone}        onChange={v => setProfile(p => ({ ...p, phone: v }))}        placeholder="+56 9 …" />
                <Input label="Display name" value={profile.display_name} onChange={v => setProfile(p => ({ ...p, display_name: v }))} placeholder="(how it appears)" />
                <div className="col-span-2">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">Notes</label>
                  <textarea
                    value={profile.notes}
                    onChange={e => setProfile(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Context, how you met, shared projects, etc."
                    rows={3}
                    className="w-full text-[12px] px-3 py-2 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30 resize-y"
                  />
                </div>
                {profileConflict && (
                  <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[11px] text-amber-800">
                      Email collision — <strong>{profileConflict.full_name ?? profileConflict.display_name ?? profileConflict.email}</strong> already uses this email.
                    </p>
                    <button
                      onClick={() => { setProfileConflict(null); scrollToMerge(); }}
                      className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-800 hover:underline"
                    >
                      Scroll up to merge instead →
                    </button>
                  </div>
                )}
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <button
                    onClick={saveProfile}
                    disabled={profileSaving}
                    className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-4 py-2 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40"
                  >
                    {profileSaving ? "Saving…" : "✓ Create contact"}
                  </button>
                  <button
                    onClick={() => setProfileOpen(false)}
                    disabled={profileSaving}
                    className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/50 hover:text-[#131218] px-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Input({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[12px] px-3 py-1.5 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
      />
    </div>
  );
}

function scrollToMerge() {
  // Best-effort: return user to the top of the accordion where merge suggestions live.
  if (typeof window !== "undefined") window.scrollBy({ top: -300, behavior: "smooth" });
}

function pctBadge(conf: number): string {
  const pct = Math.round(conf * 100);
  return `${pct}%`;
}
