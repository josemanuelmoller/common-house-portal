"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  text: string | null;
  date: string | null;          // ISO date string of the briefing the signals came from
  generatedAt: string | null;   // ISO datetime the record was generated
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function MarketSignalsPanel({ text, date, generatedAt }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");

  async function refresh() {
    setState("running");
    try {
      const res = await fetch("/api/generate-daily-briefing", { method: "POST" });
      if (res.ok) {
        setState("idle");
        router.refresh();
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  const stamp = formatTime(generatedAt);
  const label = date
    ? `${formatDate(date)}${stamp ? ` · ${stamp}` : ""}`
    : "No run yet";

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#EFEFEA] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs font-bold text-[#131218]">Market signals</p>
          <span className="text-[9px] font-semibold text-[#131218]/35 whitespace-nowrap">
            {label}
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={state === "running"}
          className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/35 hover:text-[#131218] transition-colors disabled:opacity-50 shrink-0"
        >
          {state === "running" ? "Running…" : state === "error" ? "Retry" : "Refresh"}
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
