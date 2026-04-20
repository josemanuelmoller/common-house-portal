"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  email: string;
  display_name: string | null;
  relationship_class: string | null;       // legacy mirror
  relationship_classes?: string[] | null;  // canonical multi-tag
  auto_suggested: string | null;
  last_meeting_title: string | null;
  meeting_count: number;
  last_seen_at: string;
  classified_by: string | null;
  google_resource_name?: string | null;
  google_source?: string | null;
  google_last_write_at?: string | null;
  dismissed_at?: string | null;
};

const CLASSES = [
  { v: "Family",           label: "Family",           kind: "personal" as const },
  { v: "Personal Service", label: "Personal Service", kind: "personal" as const },
  { v: "Friend",           label: "Friend",           kind: "personal" as const },
  { v: "VIP",              label: "VIP",              kind: "vip"      as const },
  { v: "Team",             label: "Team",             kind: "work"     as const },
  { v: "Portfolio",        label: "Portfolio",        kind: "work"     as const },
  { v: "Investor",         label: "Investor",         kind: "work"     as const },
  { v: "Funder",           label: "Funder",           kind: "work"     as const },
  { v: "Client",           label: "Client",           kind: "work"     as const },
  { v: "Partner",          label: "Partner",          kind: "work"     as const },
  { v: "Vendor",           label: "Vendor",           kind: "work"     as const },
  { v: "External",         label: "External",         kind: "work"     as const },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

export function HallContactRow(props: Props) {
  const router = useRouter();
  const initial = props.relationship_classes && props.relationship_classes.length > 0
    ? props.relationship_classes
    : props.relationship_class ? [props.relationship_class] : [];
  const [selected, setSelected] = useState<string[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [googleSync, setGoogleSync] = useState<string | null>(null);

  async function save(next: string[]) {
    setError(null);
    setGoogleSync(null);
    const prev = selected;
    setSelected(next);
    try {
      const res = await fetch("/api/hall-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: props.email, relationship_classes: next }),
      });
      if (!res.ok) {
        setSelected(prev);
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (j.google_sync) setGoogleSync(j.google_sync);
      startTransition(() => router.refresh());
    } catch (e) {
      setSelected(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function toggle(cls: string) {
    if (selected.includes(cls)) save(selected.filter(c => c !== cls));
    else save([...selected, cls]);
  }

  async function dismiss() {
    const reason = window.prompt(
      "Dismiss this contact? They'll be hidden from the list and STB. Optional reason:",
      "",
    );
    if (reason === null) return;  // cancelled
    setError(null);
    try {
      const res = await fetch("/api/hall-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: props.email, action: "dismiss", reason: reason.trim() || null }),
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

  async function undismiss() {
    setError(null);
    try {
      const res = await fetch("/api/hall-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: props.email, action: "undismiss" }),
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

  const selectedKinds = selected.map(s => CLASSES.find(c => c.v === s)?.kind).filter(Boolean) as ("personal"|"vip"|"work")[];
  const hasPersonal = selectedKinds.includes("personal");
  const hasVip      = selectedKinds.includes("vip");
  // Visual priority when a contact carries mixed classes (e.g. Family + CH Team):
  // VIP tint wins because "high-stakes contact" is more actionable for Jose
  // than "personal". The chips themselves show the full set unambiguously.
  const bg = hasVip      ? "bg-[#B2FF59]/10"
           : hasPersonal ? "bg-[#FFF4E6]/40"
           : "";

  const isDismissed = !!props.dismissed_at;

  return (
    <div className={`group relative flex items-start gap-4 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors ${bg} ${isDismissed ? "opacity-60" : ""}`}>
      {/* X — dismiss (or ↺ undo when already dismissed). Shown on hover only
          so the row stays clean. Top-right corner. */}
      <button
        type="button"
        onClick={isDismissed ? undismiss : dismiss}
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] leading-none text-[#131218]/30 hover:text-[#131218] hover:bg-[#131218]/8 opacity-0 group-hover:opacity-100 transition-all"
        title={isDismissed ? "Restore — bring back to Untagged" : "Dismiss — hide without classifying"}
        aria-label={isDismissed ? "Undismiss contact" : "Dismiss contact"}
      >
        {isDismissed ? "↺" : "✕"}
      </button>

      <div className="flex-1 min-w-0 pr-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link
            href={`/admin/hall/contacts/${encodeURIComponent(props.email)}`}
            className="text-[12px] font-bold text-[#131218] truncate hover:underline decoration-[#131218]/30 underline-offset-2"
            title={`Open ${props.display_name || props.email} detail`}
          >
            {props.display_name || props.email.split("@")[0]}
          </Link>
          {selected.map(cls => {
            const kind = CLASSES.find(c => c.v === cls)?.kind;
            return (
              <span
                key={cls}
                className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                  kind === "personal" ? "bg-amber-100 text-amber-800"
                  : kind === "vip"    ? "bg-[#B2FF59]/40 text-green-900"
                  : "bg-[#131218]/6 text-[#131218]/60"
                }`}
              >
                {cls.toUpperCase()}
              </span>
            );
          })}
        </div>
        <p className="text-[10px] text-[#131218]/50 truncate mt-0.5">{props.email}</p>
        <p className="text-[10px] text-[#131218]/35 mt-1">
          <strong>{props.meeting_count}</strong> meeting{props.meeting_count === 1 ? "" : "s"}
          {" · last seen "}{timeAgo(props.last_seen_at)}
          {props.last_meeting_title && ` · "${props.last_meeting_title.slice(0, 60)}${props.last_meeting_title.length > 60 ? "…" : ""}"`}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {props.google_resource_name?.startsWith("otherContacts/") ? (
            <span className="text-[9px] font-semibold text-[#131218]/50">
              Auto-saved by Google — will be promoted when you tag
            </span>
          ) : props.google_resource_name ? (
            <span className="text-[9px] font-semibold text-[#131218]/50">
              ✓ in Google Contacts
              {props.google_last_write_at && <span className="text-[#131218]/30"> · synced {timeAgo(props.google_last_write_at)}</span>}
            </span>
          ) : props.google_source === "not_found" ? (
            <span className="text-[9px] font-semibold text-[#131218]/50">
              Not saved in Google yet — will be created when you tag
            </span>
          ) : null}
          {googleSync === "created" && (
            <span className="text-[9px] font-bold text-green-700">✓ Created in Google</span>
          )}
          {googleSync === "promoted" && (
            <span className="text-[9px] font-bold text-green-700">✓ Promoted to Contacts</span>
          )}
          {googleSync === "synced" && (
            <span className="text-[9px] font-bold text-green-700">✓ Google updated</span>
          )}
          {googleSync === "not_in_google" && (
            <span className="text-[9px] font-bold text-amber-700">local only</span>
          )}
          {googleSync === "failed" && (
            <span className="text-[9px] font-bold text-red-600">Google sync failed</span>
          )}
        </div>
        {props.auto_suggested && selected.length === 0 && (
          <p className="text-[9px] text-amber-700 italic mt-1">
            System proposes: {props.auto_suggested}
          </p>
        )}
        {error && <p className="text-[9px] text-red-600 mt-1" role="alert">{error}</p>}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap max-w-[360px] justify-end shrink-0">
        {CLASSES.map(c => {
          const active = selected.includes(c.v);
          const base = "text-[9px] font-bold px-2 py-1 rounded-full transition-colors";
          const activeCls = c.kind === "personal" ? "bg-amber-500 text-white"
                          : c.kind === "vip"     ? "bg-[#B2FF59] text-black"
                          : "bg-[#131218] text-white";
          const inactiveCls = "bg-[#131218]/6 text-[#131218]/55 hover:bg-[#131218]/12";
          return (
            <button
              key={c.v}
              type="button"
              disabled={pending}
              onClick={() => toggle(c.v)}
              className={`${base} ${active ? activeCls : inactiveCls} ${pending ? "opacity-60 cursor-wait" : ""}`}
              title={active ? `Click to remove ${c.label}` : `Add ${c.label}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
