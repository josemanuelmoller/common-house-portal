"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "running" | "done" | "error";

type TriggerState = {
  status:       Status;
  summary:      string | null;
  last_run_at:  string | null;
  last_status:  "success" | "error" | "unknown" | null;
};

type TriggerDef = {
  id:       "calendar" | "gmail" | "meetings";
  label:    string;
  endpoint: string;
  summarize: (j: Record<string, unknown>) => string;
};

const TRIGGERS: readonly TriggerDef[] = [
  {
    id:       "calendar",
    label:    "Calendar",
    endpoint: "/api/cron/observe-calendar",
    summarize: (j) => {
      const n = Number(j.new_events ?? 0);
      const u = Number(j.updated_events ?? 0);
      const c = Number(j.cancelled_events ?? 0);
      if (n + u + c === 0) return "no changes";
      return `${n}n · ${u}u · ${c}x`;
    },
  },
  {
    id:       "gmail",
    label:    "Gmail",
    endpoint: "/api/ingest-gmail",
    summarize: (j) => {
      if (j.skipped) return "skipped";
      const created = Number(j.created ?? 0);
      return `${created} new`;
    },
  },
  {
    id:       "meetings",
    label:    "Meetings",
    endpoint: "/api/fireflies-sync",
    summarize: (j) => {
      const t = Number(j.transcripts_processed ?? j.transcripts ?? 0);
      return `${t} tx`;
    },
  },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function HallManualTriggers() {
  const router = useRouter();
  const [state, setState] = useState<Record<string, TriggerState>>({
    calendar: { status: "idle", summary: null, last_run_at: null, last_status: null },
    gmail:    { status: "idle", summary: null, last_run_at: null, last_status: null },
    meetings: { status: "idle", summary: null, last_run_at: null, last_status: null },
  });

  async function loadStatus() {
    try {
      const r = await fetch("/api/hall-manual-triggers-status", { credentials: "include" });
      if (!r.ok) return;
      const j = await r.json();
      setState(s => ({
        calendar: { ...s.calendar, last_run_at: j.calendar?.last_run_at ?? null, last_status: j.calendar?.last_status ?? null },
        gmail:    { ...s.gmail,    last_run_at: j.gmail?.last_run_at    ?? null, last_status: j.gmail?.last_status    ?? null },
        meetings: { ...s.meetings, last_run_at: j.meetings?.last_run_at ?? null, last_status: j.meetings?.last_status ?? null },
      }));
    } catch { /* ignore */ }
  }

  useEffect(() => { loadStatus(); }, []);

  async function run(t: TriggerDef) {
    setState(s => ({ ...s, [t.id]: { ...s[t.id], status: "running", summary: null } }));
    try {
      const res = await fetch(t.endpoint, { method: "POST", credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setState(s => ({
          ...s,
          [t.id]: { ...s[t.id], status: "error", summary: j?.reason ?? j?.error ?? `HTTP ${res.status}` },
        }));
        return;
      }
      setState(s => ({
        ...s,
        [t.id]: { ...s[t.id], status: "done", summary: t.summarize(j), last_run_at: new Date().toISOString(), last_status: "success" },
      }));
      router.refresh();
      setTimeout(() => {
        setState(s => (s[t.id].status === "done" ? { ...s, [t.id]: { ...s[t.id], status: "idle", summary: null } } : s));
      }, 6000);
    } catch (err) {
      setState(s => ({
        ...s,
        [t.id]: { ...s[t.id], status: "error", summary: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[9px] font-bold tracking-widest uppercase text-[#0a0a0a]/35 mr-1">
        Refresh
      </span>
      {TRIGGERS.map(t => {
        const s = state[t.id];
        const cls =
          s.status === "running" ? "bg-[#0a0a0a]/8 text-[#0a0a0a]/60 cursor-wait"
          : s.status === "done"  ? "bg-[#c6f24a]/30 text-green-900 border border-[#c6f24a]/60"
          : s.status === "error" ? "bg-red-50 text-red-700 border border-red-200"
          :                        "bg-[#0a0a0a] text-white hover:bg-[#0a0a0a]/85";
        const subtitle =
          s.status === "running" ? "syncing…"
          : (s.status === "done" || s.status === "error") && s.summary ? s.summary
          : timeAgo(s.last_run_at);
        return (
          <button
            key={t.id}
            type="button"
            disabled={s.status === "running"}
            onClick={() => run(t)}
            className={`rounded-full px-3 py-1 text-[10px] font-bold transition-colors leading-tight flex items-baseline gap-1.5 ${cls}`}
            title={`POST ${t.endpoint}${s.last_run_at ? ` · last run ${new Date(s.last_run_at).toLocaleString()}` : ""}`}
          >
            <span>{t.label}</span>
            <span className="text-[9px] font-semibold opacity-65">· {subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}
