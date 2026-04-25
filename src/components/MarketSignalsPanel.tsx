"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type MarketSignalBrief = {
  id: string;
  title: string;
  sourceLink: string | null;
  notionUrl: string;
  theme: string[];
  sourceType?: string | null;
};

// Short, readable label for Source Type (defaults to the raw string).
function sourceTypeShort(t: string | null | undefined): string | null {
  if (!t) return null;
  const map: Record<string, string> = {
    "Policy Doc": "POL",
    "Sector Report": "REP",
    "Report": "REP",
    "Article": "ART",
    "Playbook": "PLAY",
    "Guide": "GUIDE",
    "Deck": "DECK",
    "PDF": "PDF",
  };
  return map[t] ?? t.slice(0, 4).toUpperCase();
}

// Extract a compact domain hint from a URL — used as fallback label when a
// brief has no human Title. Strips www. and returns at most the registrable
// domain + path hint (e.g. "gov.uk/epr").
function domainHint(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

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
        {text ? <SignalList raw={text} briefs={briefs} /> : (
          <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
            No market signals captured yet. Press Refresh to run the briefing.
          </p>
        )}
      </div>

      {(() => {
        // Drop chips with no useful label: Untitled AND no source URL →
        // dead weight, doesn't even give the user a place to land.
        const usable = briefs.filter(b => b.title !== "Untitled" || !!b.sourceLink);
        if (usable.length === 0) return null;
        return (
          <div className="mt-3 pt-2.5" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <span
                className="text-[8px] font-bold uppercase tracking-widest shrink-0"
                style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
              >
                {usable.length} src
              </span>
              {usable.slice(0, 12).map(b => {
                const href = b.sourceLink ?? b.notionUrl;
                const isOriginal = !!b.sourceLink;
                const domain = b.sourceLink ? domainHint(b.sourceLink) : null;
                const typeTag = sourceTypeShort(b.sourceType);
                return (
                  <a
                    key={b.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={(b.title !== "Untitled" ? b.title : domain ?? "Notion brief") + (isOriginal ? " ↗" : "")}
                    className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded transition-opacity hover:opacity-70"
                    style={{
                      color: "var(--hall-muted-2)",
                      background: "var(--hall-fill-soft)",
                      border: "1px solid var(--hall-line)",
                      fontSize: 8.5,
                      fontWeight: 600,
                    }}
                  >
                    {typeTag && (
                      <span style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)", fontSize: 7.5, fontWeight: 700 }}>
                        {typeTag}
                      </span>
                    )}
                    <span className="max-w-[90px] truncate">{domain ?? (b.title !== "Untitled" ? b.title : "Notion")}</span>
                    <span style={{ fontSize: 7, opacity: 0.5 }}>{isOriginal ? "↗" : "N"}</span>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })()}
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
  "Portfolio":    "bg-[#c6f24a]/25 text-[#0a0a0a]/80 border-[#c6f24a]",
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

// ── Signal slide panel ───────────────────────────────────────────────────────

function MarketSignalPanel({
  signal,
  color,
  briefs,
  onClose,
}: {
  signal: Signal;
  color: string;
  briefs: MarketSignalBrief[];
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: "min(380px, 90vw)",
          background: "#fff",
          borderLeft: "1px solid var(--hall-stroke-0)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--hall-stroke-0)" }}>
          <span className={`text-[8.5px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${color}`}>
            {signal.tag ?? "—"}
          </span>
          <button
            onClick={onClose}
            className="text-[13px] w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
            style={{ color: "var(--hall-muted-2)" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Headline */}
          <div>
            <p className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>
              Signal
            </p>
            <p className="text-[15px] font-semibold leading-snug" style={{ color: "#0a0a0a" }}>
              {signal.headline}
            </p>
          </div>

          {/* Relevance / why it matters */}
          {signal.relevance && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>
                Why it matters
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "#0a0a0a", opacity: 0.65 }}>
                {signal.relevance}
              </p>
            </div>
          )}

          {/* Sources */}
          {briefs.length > 0 && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>
                Sources · {briefs.length}
              </p>
              <div className="flex flex-col gap-1.5">
                {briefs.filter(b => b.title !== "Untitled" || !!b.sourceLink).map(b => {
                  const href = b.sourceLink ?? b.notionUrl;
                  const dom = b.sourceLink ? domainHint(b.sourceLink) : null;
                  const label = b.title !== "Untitled" ? b.title : dom ?? "Notion brief";
                  return (
                    <a
                      key={b.id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg transition-opacity hover:opacity-70"
                      style={{ background: "var(--hall-fill-soft)", border: "1px solid var(--hall-line)" }}
                    >
                      {b.sourceType && (
                        <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 8, fontWeight: 700, color: "var(--hall-muted-3)" }}>
                          {sourceTypeShort(b.sourceType)}
                        </span>
                      )}
                      <span className="flex-1 text-[10.5px] font-medium truncate" style={{ color: "var(--hall-muted-2)" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--hall-muted-3)" }}>{b.sourceLink ? "↗" : "N"}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Signal list ──────────────────────────────────────────────────────────────

function SignalList({ raw, briefs }: { raw: string; briefs: MarketSignalBrief[] }) {
  const signals = parseSignals(raw);
  const structured = signals.some(s => s.tag);
  const [selected, setSelected] = useState<{ signal: Signal; color: string } | null>(null);

  // Plain fallback: if nothing parsed with a tag, render as readable paragraph(s)
  if (!structured) {
    return (
      <div className="text-[11px] text-[#0a0a0a]/65 leading-[1.65] whitespace-pre-wrap">
        {raw}
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {signals.map((s, i) => {
          const color = s.tag && TAG_COLOR[s.tag]
            ? TAG_COLOR[s.tag]
            : "bg-[#f4f4ef] text-[#0a0a0a]/55 border-[#e4e4dd]";
          return (
            <li
              key={i}
              className="flex gap-3 cursor-pointer group"
              onClick={() => setSelected({ signal: s, color })}
            >
              <span
                className={`shrink-0 w-[96px] text-[8.5px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border text-center ${
                  s.tag ? color : "bg-[#f4f4ef] text-[#0a0a0a]/30 border-[#e4e4dd]"
                } self-start mt-0.5`}
              >
                {s.tag ?? "—"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] font-semibold text-[#0a0a0a] leading-snug group-hover:text-[#0a0a0a]/70 transition-colors">
                  {s.headline}
                </p>
                {s.relevance && (
                  <p className="text-[10px] text-[#0a0a0a]/50 leading-snug mt-0.5">
                    {s.relevance}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {selected && (
        <MarketSignalPanel
          signal={selected.signal}
          color={selected.color}
          briefs={briefs}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
