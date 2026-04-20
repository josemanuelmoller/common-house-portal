"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  email: string;
  display_name: string | null;
  relationship_class: string | null;
  auto_suggested: string | null;
  last_meeting_title: string | null;
  meeting_count: number;
  last_seen_at: string;
  classified_by: string | null;
};

const CLASSES = [
  { v: "Family",           label: "Family",           kind: "personal" as const },
  { v: "Personal Service", label: "Personal Service", kind: "personal" as const },
  { v: "Friend",           label: "Friend",           kind: "personal" as const },
  { v: "Team",             label: "Team",             kind: "work"     as const },
  { v: "Portfolio",        label: "Portfolio",        kind: "vip"      as const },
  { v: "Investor",         label: "Investor",         kind: "vip"      as const },
  { v: "Funder",           label: "Funder",           kind: "vip"      as const },
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
  const [cls, setCls] = useState<string | null>(props.relationship_class);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    setError(null);
    const prev = cls;
    setCls(next);
    try {
      const res = await fetch("/api/hall-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: props.email, relationship_class: next }),
      });
      if (!res.ok) {
        setCls(prev);
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setCls(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const kind = CLASSES.find(c => c.v === cls)?.kind;
  const bg = kind === "personal" ? "bg-[#FFF4E6]/40"
           : kind === "vip"      ? "bg-[#B2FF59]/10"
           : "";

  return (
    <div className={`flex items-start gap-4 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors ${bg}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-bold text-[#131218] truncate">
            {props.display_name || props.email.split("@")[0]}
          </p>
          {cls && (
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
              kind === "personal" ? "bg-amber-100 text-amber-800"
              : kind === "vip"    ? "bg-[#B2FF59]/40 text-green-900"
              : "bg-[#131218]/6 text-[#131218]/60"
            }`}>
              {cls.toUpperCase()}
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#131218]/50 truncate mt-0.5">{props.email}</p>
        <p className="text-[10px] text-[#131218]/35 mt-1">
          <strong>{props.meeting_count}</strong> meeting{props.meeting_count === 1 ? "" : "s"}
          {" · last seen "}{timeAgo(props.last_seen_at)}
          {props.last_meeting_title && ` · "${props.last_meeting_title.slice(0, 60)}${props.last_meeting_title.length > 60 ? "…" : ""}"`}
        </p>
        {props.auto_suggested && !cls && (
          <p className="text-[9px] text-amber-700 italic mt-1">
            System proposes: {props.auto_suggested}
          </p>
        )}
        {error && <p className="text-[9px] text-red-600 mt-1" role="alert">{error}</p>}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap max-w-[360px] justify-end shrink-0">
        {CLASSES.map(c => {
          const active = cls === c.v;
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
              onClick={() => save(active ? null : c.v)}
              className={`${base} ${active ? activeCls : inactiveCls} ${pending ? "opacity-60 cursor-wait" : ""}`}
              title={active ? `Click to untag ${c.label}` : `Tag as ${c.label}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
