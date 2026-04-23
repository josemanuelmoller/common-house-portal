"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CorrectionButton } from "./CorrectionButton";

type Loop = {
  direction:  "promised_by_you" | "awaiting_from_them";
  text:       string;
  source:     "transcript" | "whatsapp" | "email" | "meeting";
  source_ref: string | null;
  ts:         string | null;
  resolved:   boolean;
};

type Correction = {
  id: string;
  scope: "summary" | "open_loops" | "topics" | "news" | "enrichment" | "general";
  what_is_wrong: string;
  what_is_correct: string;
  created_at: string;
  created_by: string | null;
};

/**
 * Lists open commitments extracted from recent conversations. Two buckets:
 * things the user owes the contact, and things the contact owes the user.
 *
 * Empty-state button triggers Claude extraction. A "Refresh" affordance
 * recomputes on demand (cache is 14 days otherwise).
 */
export function ContactOpenLoops({
  personId,
  loops,
  updatedAt,
  corrections,
}: {
  personId:    string;
  loops:       Loop[] | null;
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
      const res = await fetch("/api/contact-intelligence/open-loops", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ person_id: personId, force }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "extract failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  // loops=null → never run.  loops=[] → ran but nothing found.
  if (loops == null) {
    return (
      <div className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[11px] text-[#131218]/60 leading-snug">
            <strong className="text-[#131218]">Open loops</strong>{" "}
            — promises you made or things you&apos;re waiting on, pulled from the last 6 weeks of transcripts, meetings and WhatsApp.
          </p>
        </div>
        <button
          onClick={() => run(false)}
          disabled={running}
          className="text-[10px] font-bold uppercase tracking-widest border border-[#131218]/20 text-[#131218] hover:border-[#131218]/50 px-3 py-2 rounded-lg disabled:opacity-40 shrink-0"
        >
          {running ? "Scanning…" : "🔍 Scan"}
        </button>
        {err && <span className="text-[10px] text-red-600">{err}</span>}
      </div>
    );
  }

  const promised  = loops.filter(l => l.direction === "promised_by_you");
  const awaiting  = loops.filter(l => l.direction === "awaiting_from_them");

  return (
    <div className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4 space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/45">
          Open loops
          {updatedAt && <span className="text-[#131218]/30"> · {timeAgoShort(updatedAt)}</span>}
        </p>
        <div className="flex-1 h-px bg-[#EFEFEA]" />
        <CorrectionButton
          personId={personId}
          defaultScope="open_loops"
          knownCorrections={corrections}
          regenerateUrl="/api/contact-intelligence/open-loops"
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

      {loops.length === 0 && (
        <p className="text-[11.5px] text-[#131218]/40 italic">
          No open commitments detected. Recent conversations look clean.
        </p>
      )}

      {promised.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 mb-1.5">
            You promised · {promised.length}
          </p>
          <ul className="space-y-1.5">
            {promised.map((l, i) => <LoopRow key={`p:${i}`} loop={l} tone="you" />)}
          </ul>
        </div>
      )}

      {awaiting.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 mb-1.5">
            Awaiting from them · {awaiting.length}
          </p>
          <ul className="space-y-1.5">
            {awaiting.map((l, i) => <LoopRow key={`a:${i}`} loop={l} tone="them" />)}
          </ul>
        </div>
      )}

      {err && <p className="text-[10px] text-red-600">{err}</p>}
    </div>
  );
}

function LoopRow({ loop, tone }: { loop: Loop; tone: "you" | "them" }) {
  const bg = tone === "you"
    ? "bg-amber-50  border-amber-200  text-amber-900"
    : "bg-[#c8f55a]/20 border-[#c8f55a]/50 text-[#131218]";
  const glyph = loop.source === "whatsapp" ? "💬"
              : loop.source === "email"    ? "✉"
              : loop.source === "transcript" ? "🎙️"
              :                                "📅";
  return (
    <li className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${bg}`}>
      <span className="text-[13px] leading-none mt-0.5">{glyph}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] leading-snug">{loop.text}</p>
        {(loop.source_ref || loop.ts) && (
          <p className="text-[10px] opacity-60 mt-0.5">
            {loop.source_ref}
            {loop.source_ref && loop.ts && " · "}
            {loop.ts && timeAgoShort(loop.ts)}
          </p>
        )}
      </div>
    </li>
  );
}

function timeAgoShort(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}
