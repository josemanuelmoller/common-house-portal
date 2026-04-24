"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  domain:         string;
  currentClasses: string[];
  currentName:    string | null;
  notion_id:      string | null;
  contactCount:   number;
  dismissed?:     boolean;
  compact?:       boolean;  // Proposed view uses a compact horizontal layout
};

const TAG_OPTIONS = [
  { v: "Client",    kind: "work" as const },
  { v: "Partner",   kind: "work" as const },
  { v: "Portfolio", kind: "work" as const },
  { v: "Investor",  kind: "work" as const },
  { v: "Funder",    kind: "work" as const },
  { v: "Team",      kind: "work" as const },
  { v: "VIP",       kind: "vip"  as const },
  { v: "Vendor",    kind: "work" as const },
  { v: "External",  kind: "work" as const },
];

export function HallOrganizationTagEditor(props: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(props.currentClasses);
  const [cascade,  setCascade]  = useState(true);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  async function toggle(cls: string) {
    setError(null);
    setStatus(props.currentClasses.length === 0 ? "Registering org…" : "Updating org…");
    const next = selected.includes(cls) ? selected.filter(x => x !== cls) : [...selected, cls];
    const prev = selected;
    setSelected(next);
    try {
      const res = await fetch("/api/hall-organizations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          domain:               props.domain,
          name:                 props.currentName ?? undefined,
          relationship_classes: next,
          cascade:              cascade && next.length > 0,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setSelected(prev);
        setStatus(null);
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      const casc = j.cascade as { matched: number; created: number; promoted: number; synced: number } | null;
      const bits: string[] = [];
      if (casc?.created)  bits.push(`${casc.created} created`);
      if (casc?.promoted) bits.push(`${casc.promoted} promoted`);
      if (casc?.synced)   bits.push(`${casc.synced} synced`);
      setStatus(
        next.length === 0
          ? "All classes removed"
          : casc
            ? `[${next.join(", ")}] · ${casc.matched} contacts · ${bits.join(" · ") || "done"}`
            : `[${next.join(", ")}]`,
      );
      startTransition(() => router.refresh());
      setTimeout(() => setStatus(null), 6000);
    } catch (e) {
      setSelected(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function syncToNotion() {
    setError(null);
    setStatus("Syncing to Notion…");
    try {
      const res = await fetch("/api/hall-organizations/sync-notion", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ domain: props.domain }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setStatus(null);
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      const verb = j.action === "created" ? "Created in Notion"
                : j.action === "linked_existing" ? "Linked to existing Notion record"
                : "Already linked";
      setStatus(`✓ ${verb}`);
      startTransition(() => router.refresh());
      setTimeout(() => setStatus(null), 6000);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function dismissOrUndismiss() {
    const action = props.dismissed ? "undismiss" : "dismiss";
    const reason = props.dismissed ? undefined : (window.prompt("Dismiss this org? Optional reason:", "") ?? undefined);
    if (reason === undefined && !props.dismissed) return;
    try {
      const res = await fetch("/api/hall-organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: props.domain, action, reason: reason?.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const classChips = (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {TAG_OPTIONS.map(t => {
        const active = selected.includes(t.v);
        const activeCls = t.kind === "vip" ? "bg-[#c6f24a] text-black" : "bg-[#0a0a0a] text-white";
        const inactive  = "bg-[#0a0a0a]/6 text-[#0a0a0a]/55 hover:bg-[#0a0a0a]/12";
        return (
          <button
            key={t.v}
            type="button"
            disabled={pending}
            onClick={() => toggle(t.v)}
            className={`text-[9px] font-bold px-2 py-1 rounded-full transition-colors ${active ? activeCls : inactive} ${pending ? "opacity-50 cursor-wait" : ""}`}
            title={active ? `Remove ${t.v} from org` : `Tag org as ${t.v}${cascade ? " (cascade to contacts)" : ""}`}
          >
            {active ? "✓ " : "+ "}{t.v}
          </button>
        );
      })}
    </div>
  );

  if (props.compact) {
    return (
      <div className="flex flex-col gap-1 items-end shrink-0">
        {classChips}
        {status && <span className="text-[9px] font-bold text-green-700">{status}</span>}
        {error  && <span className="text-[9px] font-bold text-red-700">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-end shrink-0">
      {classChips}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-[9px] text-[#0a0a0a]/55 cursor-pointer select-none">
          <input type="checkbox" className="w-3 h-3" checked={cascade} onChange={e => setCascade(e.target.checked)} />
          cascade to {props.contactCount}
        </label>
        {!props.notion_id && selected.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={syncToNotion}
            className="text-[9px] font-bold px-2 py-1 rounded-full bg-[#0a0a0a]/6 text-[#0a0a0a]/70 hover:bg-[#0a0a0a]/16 transition-colors"
          >
            Sync to Notion →
          </button>
        )}
        <button
          type="button"
          onClick={dismissOrUndismiss}
          className="text-[9px] font-bold px-2 py-1 rounded-full text-[#0a0a0a]/40 hover:text-[#0a0a0a]/80 hover:bg-[#0a0a0a]/6 transition-colors"
          title={props.dismissed ? "Restore org" : "Dismiss org"}
        >
          {props.dismissed ? "↺ restore" : "✕ dismiss"}
        </button>
      </div>
      {status && <span className="text-[9px] font-bold text-green-700">{status}</span>}
      {error  && <span className="text-[9px] font-bold text-red-700">{error}</span>}
    </div>
  );
}
