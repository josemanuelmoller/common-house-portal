"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "running" | "done" | "error";

type TriggerResult = {
  status: Status;
  summary: string | null;
};

const TRIGGERS = [
  {
    id:       "calendar",
    label:    "Read Calendar",
    endpoint: "/api/cron/observe-calendar",
    summarize: (j: Record<string, unknown>) => {
      const n = Number(j.new_events      ?? 0);
      const u = Number(j.updated_events  ?? 0);
      const c = Number(j.cancelled_events ?? 0);
      if (n + u + c === 0) return "No calendar changes";
      return `${n} new · ${u} updated · ${c} cancelled`;
    },
  },
  {
    id:       "gmail",
    label:    "Read Gmail",
    endpoint: "/api/ingest-gmail",
    summarize: (j: Record<string, unknown>) => {
      if (j.skipped) return String(j.reason ?? "Skipped");
      const created = Number(j.created ?? 0);
      const seen    = Number(j.seen ?? 0);
      return `${created} new thread${created === 1 ? "" : "s"}${seen ? ` · ${seen} seen` : ""}`;
    },
  },
  {
    id:       "meetings",
    label:    "Read Meetings",
    endpoint: "/api/fireflies-sync",
    summarize: (j: Record<string, unknown>) => {
      const t = Number(j.transcripts_processed ?? j.transcripts ?? 0);
      const s = Number(j.sources_created       ?? 0);
      return `${t} transcript${t === 1 ? "" : "s"}${s ? ` · ${s} new source${s === 1 ? "" : "s"}` : ""}`;
    },
  },
] as const;

export function HallManualTriggers() {
  const router = useRouter();
  const [state, setState] = useState<Record<string, TriggerResult>>({});

  async function run(id: string, endpoint: string, summarize: (j: Record<string, unknown>) => string) {
    setState(s => ({ ...s, [id]: { status: "running", summary: null } }));
    try {
      const res = await fetch(endpoint, { method: "POST", credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setState(s => ({
          ...s,
          [id]: { status: "error", summary: j?.reason ?? j?.error ?? `HTTP ${res.status}` },
        }));
        return;
      }
      setState(s => ({ ...s, [id]: { status: "done", summary: summarize(j) } }));
      router.refresh();
      // Auto-clear the "done" chip after a few seconds so the UI does not look stale.
      setTimeout(() => {
        setState(s => (s[id]?.status === "done" ? { ...s, [id]: { status: "idle", summary: null } } : s));
      }, 6000);
    } catch (err) {
      setState(s => ({
        ...s,
        [id]: { status: "error", summary: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/40">
          Manual refresh
        </p>
        <p className="text-[9px] text-[#131218]/35">
          On-demand · cron runs once per day
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {TRIGGERS.map(t => {
          const s = state[t.id]?.status ?? "idle";
          const summary = state[t.id]?.summary;
          const base = "w-full text-left rounded-xl px-3.5 py-2.5 text-[11px] font-bold transition-colors";
          const cls =
            s === "running" ? `${base} bg-[#131218]/8 text-[#131218]/60 cursor-wait`
            : s === "done"  ? `${base} bg-[#B2FF59]/25 text-green-900 border border-[#B2FF59]/60`
            : s === "error" ? `${base} bg-red-50 text-red-700 border border-red-200`
            :                 `${base} bg-[#131218] text-white hover:bg-[#131218]/85`;
          return (
            <button
              key={t.id}
              type="button"
              disabled={s === "running"}
              onClick={() => run(t.id, t.endpoint, t.summarize)}
              className={cls}
              title={`Trigger ${t.endpoint}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span>{t.label}</span>
                {s === "running" && <span className="text-[9px] opacity-60">syncing…</span>}
                {s === "done"    && <span className="text-[9px]">✓</span>}
                {s === "error"   && <span className="text-[9px]">!</span>}
              </span>
              {summary && (s === "done" || s === "error") && (
                <span className="block mt-1 text-[9.5px] font-semibold opacity-75 truncate">
                  {summary}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
