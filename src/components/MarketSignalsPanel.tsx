"use client";

import { useEffect, useState } from "react"; // used by SignalList + MarketSignalsPanel
import { useRouter } from "next/navigation";

export type MarketSignalBrief = {
  id: string;
  title: string;
  sourceLink: string | null;
  notionUrl: string;
  theme: string[];
};

interface Props {
  text: string | null;
  date: string | null;          // ISO date string of the briefing the signals came from
  generatedAt: string | null;   // ISO datetime the record was last written
  briefs?: MarketSignalBrief[]; // Insight Briefs fed into the signal — linked at the bottom
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

export function MarketSignalsPanel({ text, date, generatedAt, briefs = [] }: Props) {
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
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {state === "just-updated" ? (
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              Updated · refreshed
            </span>
          ) : (() => {
            // E6 — "Fresh" pill when <1h old (lime), otherwise quiet timestamp.
            const isFresh = generatedAt && (Date.now() - new Date(generatedAt).getTime() < 3600_000);
            if (isFresh) {
              return (
                <span
                  className="text-[9px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded-full"
                  style={{
                    color: "var(--hall-ink-0)",
                    background: "var(--hall-lime-soft)",
                    border: "1px solid var(--hall-lime)",
                  }}
                  title={stamp}
                >
                  Fresh · {age}
                </span>
              );
            }
            return (
              <span
                className="text-[9px] font-semibold whitespace-nowrap"
                style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                title={stamp}
              >
                {age ?? stamp}
              </span>
            );
          })()}
        </div>
        <button
          onClick={refresh}
          disabled={state === "running"}
          className="text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 shrink-0"
          style={{ color: "var(--hall-muted-2)" }}
        >
          {state === "running"
            ? "Running…"
            : state === "error"
              ? "Retry"
              : "Refresh"}
        </button>
      </div>
      <div>
        {text ? <SignalList raw={text} /> : (
          <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
            No market signals captured yet. Press Refresh to run the briefing.
          </p>
        )}
      </div>

      {briefs.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
          <p
            className="text-[8.5px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
          >
            Sources · {briefs.length}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {briefs.slice(0, 12).map(b => {
              const href = b.sourceLink ?? b.notionUrl;
              const isOriginal = !!b.sourceLink;
              return (
                <li key={b.id}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={isOriginal ? "Open original source" : "Open in Notion"}
                    className="inline-flex items-center gap-1 text-[9.5px] font-semibold transition-colors px-2 py-0.5 rounded-full max-w-[220px]"
                    style={{
                      color: "var(--hall-muted-2)",
                      background: "var(--hall-paper-0)",
                      border: "1px solid var(--hall-line)",
                    }}
                  >
                    <span className="truncate">{b.title}</span>
                    <span className="text-[8px] opacity-60 shrink-0">{isOriginal ? "↗" : "N↗"}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Signal parsing + rendering ──────────────────────────────────────────────

const TAG_COLOR: Record<string, string> = {
  "Policy":       "bg-purple-50 text-purple-700 border-purple-200",
  "Funding":      "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Market Move":  "bg-blue-50 text-blue-700 border-blue-200",
  "Sector Trend": "bg-amber-50 text-amber-700 border-amber-200",
  "Competitor":   "bg-red-50 text-red-700 border-red-200",
  "Ecosystem":    "bg-sky-50 text-sky-700 border-sky-200",
  "Portfolio":    "bg-[#c8f55a]/25 text-[#131218]/80 border-[#c8f55a]",
};

type Signal = { tag: string | null; headline: string; relevance: string | null };

// Known tag whitelist prevents false positives when the headline itself
// contains a pipe (e.g. "UK | £1.1B funding" being parsed as tag "UK").
const KNOWN_TAGS = new Set([
  "Policy", "Funding", "Market Move", "Sector Trend",
  "Competitor", "Ecosystem", "Portfolio",
]);

function parseFirstLine(line: string): { tag: string | null; headline: string } {
  // Preferred format: [Tag] Headline
  const bracket = line.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (bracket) return { tag: bracket[1].trim(), headline: bracket[2].trim() };
  // Haiku often drifts to: Tag | Headline — accept only known tags.
  const pipe = line.match(/^([^|]+?)\s*[|│]\s*(.+)$/);
  if (pipe) {
    const candidate = pipe[1].trim();
    if (KNOWN_TAGS.has(candidate)) {
      return { tag: candidate, headline: pipe[2].trim() };
    }
  }
  return { tag: null, headline: line };
}

function parseSignals(raw: string): Signal[] {
  // Split on blank lines; within each block, first line carries the tag,
  // subsequent lines starting with '·' or '-' are relevance lines merged.
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const signals: Signal[] = [];
  for (const block of blocks) {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const { tag, headline } = parseFirstLine(lines[0]);
    const relevance = lines.slice(1)
      .map(l => l.replace(/^[·•\-]\s*/, "").trim())
      .filter(Boolean)
      .join(" ");
    signals.push({ tag, headline, relevance: relevance || null });
  }
  return signals;
}

function SignalList({ raw }: { raw: string }) {
  const signals = parseSignals(raw);
  const structured = signals.some(s => s.tag);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Plain fallback: if nothing parsed with a tag, render as readable paragraph(s)
  if (!structured) {
    return (
      <div className="text-[11px] text-[#131218]/65 leading-[1.65] whitespace-pre-wrap">
        {raw}
      </div>
    );
  }

  const toggle = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <ul className="flex flex-col gap-2">
      {signals.map((s, i) => {
        const color = s.tag && TAG_COLOR[s.tag]
          ? TAG_COLOR[s.tag]
          : "bg-[#EFEFEA] text-[#131218]/55 border-[#E0E0D8]";
        const isOpen = expanded.has(i);
        const hasRelevance = !!s.relevance;
        return (
          <li key={i} className="flex gap-3">
            <span
              className={`shrink-0 w-[96px] text-[8.5px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border text-center ${
                s.tag ? color : "bg-[#EFEFEA] text-[#131218]/30 border-[#E0E0D8]"
              } self-start mt-0.5`}
            >
              {s.tag ?? "—"}
            </span>
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => hasRelevance && toggle(i)}
                className={`text-left w-full ${hasRelevance ? "cursor-pointer" : "cursor-default"} group`}
                disabled={!hasRelevance}
              >
                <p className="text-[11.5px] font-semibold text-[#131218] leading-snug group-hover:text-[#131218]/70 transition-colors">
                  {s.headline}
                  {hasRelevance && (
                    <span className="ml-1 text-[9px] font-normal text-[#131218]/30">
                      {isOpen ? "▾" : "▸"}
                    </span>
                  )}
                </p>
              </button>
              {hasRelevance && isOpen && (
                <p className="text-[10px] text-[#131218]/55 leading-snug mt-1">
                  {s.relevance}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
