"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HallContactRow } from "./HallContactRow";

type ContactRowProps = React.ComponentProps<typeof HallContactRow>;

type Org = {
  domain:              string;
  contact_count:       number;
  meeting_sum:         number;
  email_sum:           number;
  transcript_sum:      number;
  vip_count:           number;
  tagged_count:        number;
  untagged_count:      number;
  shared_classes:      string[];
  last_interaction_at: string | null;
  is_personal_domain:  boolean;
  contacts:            ContactRowProps[];
  // Registered org (nullable — proposed orgs have no row yet)
  org_registered:      boolean;
  org_name:            string | null;
  org_classes:         string[];
  org_notion_id:       string | null;
};

type Props = { orgs: Org[] };

const TAG_OPTIONS = [
  { v: "Team",      kind: "work" as const },
  { v: "Portfolio", kind: "work" as const },
  { v: "Client",    kind: "work" as const },
  { v: "Partner",   kind: "work" as const },
  { v: "Investor",  kind: "work" as const },
  { v: "Funder",    kind: "work" as const },
  { v: "VIP",       kind: "vip"  as const },
  { v: "Vendor",    kind: "work" as const },
  { v: "External",  kind: "work" as const },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30)  return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12)  return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

export function HallContactsByOrg({ orgs }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(o => o.domain.includes(q));
  }, [orgs, query]);

  if (orgs.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">By organization</h2>
        <div className="flex-1 h-px bg-[#E0E0D8]" />
        <span className="text-[10px] font-semibold text-[#131218]/30">{orgs.length} orgs</span>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="Filter domain…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full max-w-xs text-[11px] px-3 py-1.5 rounded-full bg-white border border-[#E0E0D8] focus:outline-none focus:border-[#131218]/30"
        />
      </div>

      <div className="space-y-2">
        {filtered.map(org => <OrgRow key={org.domain} org={org} />)}
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-6 text-center">
            <p className="text-[11px] text-[#131218]/30">No domains match.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function OrgRow({ org }: { org: Org }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cascadeEnabled, setCascadeEnabled] = useState(true);
  const [orgName, setOrgName] = useState(org.org_name ?? "");

  const touches = org.meeting_sum + org.email_sum + org.transcript_sum;
  const fullyTagged = org.untagged_count === 0;

  async function bulkTag(cls: string) {
    setError(null);
    setStatus("Applying…");
    try {
      const res = await fetch("/api/hall-contacts/bulk-tag", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          domain:                org.domain,
          relationship_classes:  [cls],
          overwrite:             false,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setStatus(null);
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      const s = j.google_sync ?? {};
      const bits: string[] = [];
      if (s.created)       bits.push(`${s.created} created`);
      if (s.promoted)      bits.push(`${s.promoted} promoted`);
      if (s.synced)        bits.push(`${s.synced} synced`);
      if (s.read_only)     bits.push(`${s.read_only} read-only`);
      if (s.not_in_google) bits.push(`${s.not_in_google} local-only`);
      if (s.failed)        bits.push(`${s.failed} failed`);
      setStatus(`${j.matched} tagged as ${cls} · ${bits.join(" · ") || "done"}`);
      startTransition(() => router.refresh());
      setTimeout(() => setStatus(null), 7000);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleOrgClass(cls: string) {
    setError(null);
    setStatus(org.org_registered ? "Updating org…" : "Registering org…");
    const nextClasses = org.org_classes.includes(cls)
      ? org.org_classes.filter(x => x !== cls)
      : [...org.org_classes, cls];
    try {
      const res = await fetch("/api/hall-organizations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          domain:                 org.domain,
          name:                   orgName.trim() || org.org_name || undefined,
          relationship_classes:   nextClasses,
          cascade:                cascadeEnabled && nextClasses.length > 0,
          cascade_overwrite:      false,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setStatus(null);
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      const casc = j.cascade as { matched: number; created: number; promoted: number; synced: number } | null;
      const parts = [`Org set to [${nextClasses.join(", ") || "—"}]`];
      if (casc) {
        const bits: string[] = [];
        if (casc.created)  bits.push(`${casc.created} created`);
        if (casc.promoted) bits.push(`${casc.promoted} promoted`);
        if (casc.synced)   bits.push(`${casc.synced} synced`);
        parts.push(`cascade: ${casc.matched} contacts · ${bits.join(" · ") || "done"}`);
      }
      setStatus(parts.join(" · "));
      startTransition(() => router.refresh());
      setTimeout(() => setStatus(null), 8000);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function renameOrg() {
    const next = orgName.trim();
    if (!next || next === org.org_name) return;
    try {
      await fetch("/api/hall-organizations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ domain: org.domain, name: next, relationship_classes: org.org_classes }),
      });
      startTransition(() => router.refresh());
    } catch { /* ignore — keep local typed value */ }
  }

  async function syncToNotion() {
    setError(null);
    setStatus("Syncing to Notion…");
    try {
      const res = await fetch("/api/hall-organizations/sync-notion", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ domain: org.domain }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setStatus(null);
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      const verb = j.action === "created" ? "Created" : j.action === "linked_existing" ? "Linked to existing" : "Already linked";
      setStatus(`${verb} in CH Organizations [OS v2] ✓`);
      startTransition(() => router.refresh());
      setTimeout(() => setStatus(null), 7000);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className={`bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden ${org.vip_count > 0 ? "ring-1 ring-[#B2FF59]/50" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-[#EFEFEA]/40 transition-colors text-left"
      >
        <span className="text-[10px] text-[#131218]/30">{open ? "▾" : "▸"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-bold text-[#131218] truncate">
              {org.org_registered ? (org.org_name || org.domain) : org.domain}
            </p>
            {org.org_registered && org.org_name && org.org_name !== org.domain && (
              <span className="text-[10px] text-[#131218]/35">{org.domain}</span>
            )}
            {org.is_personal_domain && <span className="text-[9px] font-semibold text-[#131218]/30">(personal provider)</span>}
            {!org.org_registered && !org.is_personal_domain && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">PROPOSED</span>
            )}
            {org.org_classes.map(c => (
              <span
                key={c}
                className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                  c === "VIP" ? "bg-[#B2FF59]/40 text-green-900" : "bg-[#131218] text-white"
                }`}
              >
                {c.toUpperCase()}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-[#131218]/50 mt-0.5">
            <strong>{org.contact_count}</strong> contact{org.contact_count === 1 ? "" : "s"}
            {" · "}{touches} total touches
            {org.vip_count > 0 && <> · <strong className="text-green-700">{org.vip_count} VIP</strong></>}
            {" · "}last {timeAgo(org.last_interaction_at)}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {fullyTagged ? (
            <span className="text-[9px] font-bold text-green-700">✓ all tagged</span>
          ) : (
            <span className="text-[9px] font-bold text-amber-700">{org.untagged_count} untagged</span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#EFEFEA]">
          {/* Organisation-level editor — tag the org itself + optional cascade */}
          {!org.is_personal_domain && (
            <div className="px-5 py-3 bg-[#131218]/5 border-b border-[#EFEFEA] space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40">
                  Organisation · @{org.domain}
                </span>
                <input
                  type="text"
                  value={orgName}
                  placeholder={org.domain.split(".")[0]}
                  onChange={e => setOrgName(e.target.value)}
                  onBlur={renameOrg}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-[#E0E0D8] focus:outline-none focus:border-[#131218]/40 min-w-[160px]"
                />
                {org.org_registered && (
                  org.org_notion_id ? (
                    <span className="text-[9px] font-bold text-green-700 ml-auto">✓ in CH Orgs [OS v2]</span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={syncToNotion}
                      className="ml-auto text-[9px] font-bold px-2 py-1 rounded-full bg-[#131218] text-white hover:bg-[#131218]/85 transition-colors"
                      title="Create or link this org in CH Organizations [OS v2]"
                    >
                      Sync to Notion →
                    </button>
                  )
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {TAG_OPTIONS.map(t => {
                  const active = org.org_classes.includes(t.v);
                  const activeCls = t.kind === "vip" ? "bg-[#B2FF59] text-black" : "bg-[#131218] text-white";
                  const inactiveCls = "bg-[#131218]/6 text-[#131218]/55 hover:bg-[#131218]/16";
                  return (
                    <button
                      key={t.v}
                      type="button"
                      disabled={pending}
                      onClick={() => toggleOrgClass(t.v)}
                      className={`text-[9px] font-bold px-2 py-1 rounded-full transition-colors ${active ? activeCls : inactiveCls} ${pending ? "opacity-50 cursor-wait" : ""}`}
                      title={active ? `Remove ${t.v} from the org` : `Tag org as ${t.v}${cascadeEnabled ? " (will cascade to all contacts)" : ""}`}
                    >
                      {active ? "✓ " : "+ "}{t.v}
                    </button>
                  );
                })}
                <label className="ml-2 flex items-center gap-1 text-[9px] text-[#131218]/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-3 h-3"
                    checked={cascadeEnabled}
                    onChange={e => setCascadeEnabled(e.target.checked)}
                  />
                  cascade to contacts
                </label>
              </div>
              {status && <p className="text-[10px] font-semibold text-green-700">{status}</p>}
              {error  && <p className="text-[10px] font-semibold text-red-700">{error}</p>}
            </div>
          )}

          {/* Bulk-tag bar for contacts (independent of org class) */}
          <div className="px-5 py-3 flex items-center gap-2 flex-wrap bg-[#EFEFEA]/30">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40">Contacts only:</span>
            {TAG_OPTIONS.map(t => (
              <button
                key={t.v}
                type="button"
                disabled={pending}
                onClick={() => bulkTag(t.v)}
                className={`text-[9px] font-bold px-2 py-1 rounded-full transition-colors ${
                  t.kind === "vip"
                    ? "bg-[#B2FF59]/70 text-black hover:bg-[#B2FF59]"
                    : "bg-[#131218]/8 text-[#131218]/70 hover:bg-[#131218]/16"
                } ${pending ? "opacity-50 cursor-wait" : ""}`}
                title={`Apply ${t.v} to every contact @${org.domain} (keeps existing classes) — does NOT touch the organisation tag`}
              >
                + {t.v}
              </button>
            ))}
          </div>

          {/* Contacts inside this org */}
          <div className="divide-y divide-[#EFEFEA]">
            {org.contacts.map(c => (
              <HallContactRow key={c.email} {...c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
