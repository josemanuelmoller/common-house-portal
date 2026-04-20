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

  return (
    <div className={`bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden ${org.vip_count > 0 ? "ring-1 ring-[#B2FF59]/50" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-[#EFEFEA]/40 transition-colors text-left"
      >
        <span className="text-[10px] text-[#131218]/30">{open ? "▾" : "▸"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-[#131218] truncate">
            {org.domain}
            {org.is_personal_domain && <span className="ml-2 text-[9px] font-semibold text-[#131218]/30">(personal provider)</span>}
          </p>
          <p className="text-[10px] text-[#131218]/50 mt-0.5">
            <strong>{org.contact_count}</strong> contact{org.contact_count === 1 ? "" : "s"}
            {" · "}{touches} total touches
            {org.vip_count > 0 && <> · <strong className="text-green-700">{org.vip_count} VIP</strong></>}
            {" · "}last {timeAgo(org.last_interaction_at)}
          </p>
          {org.shared_classes.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              {org.shared_classes.map(c => (
                <span key={c} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#131218]/6 text-[#131218]/60">{c.toUpperCase()}</span>
              ))}
            </div>
          )}
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
          {/* Bulk-tag bar */}
          <div className="px-5 py-3 flex items-center gap-2 flex-wrap bg-[#EFEFEA]/30">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40">Bulk tag all {org.contact_count}:</span>
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
                title={`Apply ${t.v} to every contact @${org.domain} (keeps existing classes)`}
              >
                + {t.v}
              </button>
            ))}
            {status && <span className="text-[10px] font-semibold text-green-700 ml-2">{status}</span>}
            {error  && <span className="text-[10px] font-semibold text-red-700 ml-2">{error}</span>}
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
