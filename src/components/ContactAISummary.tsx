"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CorrectionButton } from "./CorrectionButton";

type Correction = {
  id: string;
  scope: "summary" | "open_loops" | "topics" | "news" | "enrichment" | "general";
  what_is_wrong: string;
  what_is_correct: string;
  created_at: string;
  created_by: string | null;
};

/**
 * AI-generated operating brief that sits at the top of the contact profile.
 * Shows either the cached text or a "Generate" CTA when empty.
 */
export function ContactAISummary({
  personId,
  summary,
  updatedAt,
  corrections,
}: {
  personId:    string;
  summary:     string | null;
  updatedAt:   string | null;
  corrections: Correction[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [, startTransition]   = useTransition();

  async function run(force: boolean) {
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch("/api/contact-intelligence/summarize", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ person_id: personId, force }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "summarize failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!summary) {
    return (
      <div className="bg-[#F7F7F3] border border-[#E0E0D8] rounded-2xl px-5 py-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[11px] text-[#131218]/60 leading-snug">
            <strong className="text-[#131218]">Operating brief</strong>{" "}
            — a 1-paragraph synthesis of who this person is and what&apos;s in play with them, written by Claude from everything we have on file.
          </p>
        </div>
        <button
          onClick={() => run(false)}
          disabled={running}
          className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-4 py-2 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40 shrink-0"
        >
          {running ? "Thinking…" : "✨ Generate"}
        </button>
        {err && <span className="text-[10px] text-red-600">{err}</span>}
      </div>
    );
  }

  return (
    <div className="bg-[#F7F7F3] border border-[#E0E0D8] rounded-2xl px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/45 mb-1.5">
            Operating brief
            {updatedAt && <span className="text-[#131218]/30"> · {timeAgoShort(updatedAt)}</span>}
          </p>
          <p className="text-[13px] text-[#131218] leading-relaxed">{summary}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 mt-1">
          <CorrectionButton
            personId={personId}
            defaultScope="summary"
            knownCorrections={corrections}
            regenerateUrl="/api/contact-intelligence/summarize"
            compact
          />
          <button
            onClick={() => run(true)}
            disabled={running}
            className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-[#131218] underline decoration-dotted"
          >
            {running ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-[10px] text-red-600">{err}</p>}
    </div>
  );
}

function timeAgoShort(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}
