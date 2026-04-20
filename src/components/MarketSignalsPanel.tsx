"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  text: string | null;
  date: string | null;          // ISO date string of the briefing the signals came from
  generatedAt: string | null;   // ISO datetime the record was last written
}

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function formatStamp(iso: string | null): string {
  if (!iso) return "No run yet";
  const d = new Date(iso);
  const day  = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function MarketSignalsPanel({ text, date, generatedAt }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "just-updated" | "error">("idle");

  // Clear the "just-updated" flash after 4s so the badge returns to the real stamp.
  useEffect(() => {
    if (state !== "just-updated") return;
    const id = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(id);
  }, [state]);

  async function refresh() {
    setState("running");
    try {
      const res = await fetch("/api/generate-daily-briefing", { method: "POST" });
      if (res.ok) {
        setState("just-updated");
        router.refresh();
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  const age   = relativeAge(generatedAt);
  const stamp = formatStamp(generatedAt ?? date);

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#EFEFEA] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs font-bold text-[#131218]">Market signals</p>
          {state === "just-updated" ? (
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              Updated · refreshed
            </span>
          ) : (
            <span className="text-[9px] font-semibold text-[#131218]/35 whitespace-nowrap" title={stamp}>
              {age ?? stamp}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={state === "running"}
          className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/35 hover:text-[#131218] transition-colors disabled:opacity-50 shrink-0"
        >
          {state === "running"
            ? "Running…"
            : state === "error"
              ? "Retry"
              : "Refresh"}
        </button>
      </div>
      <div className="px-5 py-4">
        {text ? (
          <pre className="text-[11px] text-[#131218]/65 leading-[1.65] whitespace-pre-wrap font-sans">
            {text.slice(0, 500)}
          </pre>
        ) : (
          <p className="text-[11px] text-[#131218]/30">
            No market signals captured yet. Press Refresh to run the briefing.
          </p>
        )}
      </div>
    </div>
  );
}
