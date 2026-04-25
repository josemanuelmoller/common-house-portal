"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

export type CompetitiveIntelRow = {
  id: string;
  notionUrl: string;
  title: string;
  summary: string;
  signalType: string | null;
  relevance: string | null;       // Alta | Media | Baja
  status: string | null;
  sourceUrl: string | null;
  dateCaptured: string | null;
  entityName: string | null;
  entityType: string | null;      // Competitor | Sector | Partner | Referente | Cliente potencial
};

interface Props {
  rows: CompetitiveIntelRow[];
  lastScanAt: string | null;      // ISO — most recent Date Captured across rows
}

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const d = Math.round(ms / 86400_000);
  if (d < 1)  return "today";
  if (d === 1) return "1d ago";
  if (d < 7)  return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w === 1) return "1w ago";
  return `${w}w ago`;
}

const RELEVANCE_ORDER: Record<string, number> = { Alta: 0, Media: 1, Baja: 2 };

function RelevancePill({ r }: { r: string | null }) {
  if (!r) return null;
  const map: Record<string, { bg: string; fg: string }> = {
    Alta:  { bg: "var(--hall-danger-soft)", fg: "var(--hall-danger)" },
    Media: { bg: "var(--hall-warn-soft)",   fg: "var(--hall-warn)"   },
    Baja:  { bg: "var(--hall-fill-soft)",   fg: "var(--hall-muted-3)" },
  };
  const s = map[r] ?? map.Baja;
  return (
    <span
      className="px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: s.fg,
        background: s.bg,
      }}
    >
      {r.toUpperCase()}
    </span>
  );
}

function SignalTypePill({ t }: { t: string | null }) {
  if (!t) return null;
  return (
    <span
      className="px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: "var(--hall-muted-2)",
        border: "1px solid var(--hall-line)",
      }}
    >
      {t.toUpperCase()}
    </span>
  );
}

function domainHint(urlStr: string | null): string | null {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function CompetitiveIntelPanel({ rows, lastScanAt }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<CompetitiveIntelRow | null>(null);

  // Group by entityType: Competitor Pulse vs Sector Signal vs Other
  const buckets = {
    Competitor: [] as CompetitiveIntelRow[],
    Sector:     [] as CompetitiveIntelRow[],
    Other:      [] as CompetitiveIntelRow[],
  };
  for (const r of rows) {
    if (r.entityType === "Competitor") buckets.Competitor.push(r);
    else if (r.entityType === "Sector") buckets.Sector.push(r);
    else buckets.Other.push(r);
  }
  const sortBucket = (b: CompetitiveIntelRow[]) =>
    b.sort((a, b) =>
      (RELEVANCE_ORDER[a.relevance ?? "Baja"] - RELEVANCE_ORDER[b.relevance ?? "Baja"]) ||
      ((b.dateCaptured ?? "").localeCompare(a.dateCaptured ?? ""))
    );
  sortBucket(buckets.Competitor);
  sortBucket(buckets.Sector);
  sortBucket(buckets.Other);

  const runMonitor = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/competitive-monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "execute", lookback_days: 7 }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        const created = body.created ?? body.records_written ?? body.count ?? 0;
        setMsg(`Scanned · ${created} new signal${created === 1 ? "" : "s"}`);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const age = relativeAge(lastScanAt);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span
          className="text-[9px] font-semibold whitespace-nowrap"
          style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
        >
          {age ? `Last scan · ${age}` : "No scans yet"}
          {msg ? ` · ${msg}` : ""}
        </span>
        <button
          onClick={runMonitor}
          disabled={pending}
          className="text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 shrink-0"
          style={{ color: "var(--hall-muted-2)" }}
        >
          {pending ? "Scanning…" : "Run scan"}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
          No competitive signals captured yet. Press <b>Run scan</b> to trigger
          the competitive-monitor against CH Watchlist.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {buckets.Competitor.length > 0 && (
            <Bucket label="Competitor pulse" rows={buckets.Competitor} onSelect={setSelected} />
          )}
          {buckets.Sector.length > 0 && (
            <Bucket label="Sector signal" rows={buckets.Sector} onSelect={setSelected} />
          )}
          {buckets.Other.length > 0 && (
            <Bucket label="Other watchlist" rows={buckets.Other} onSelect={setSelected} />
          )}
        </div>
      )}
      {selected && (
        <SignalSlidePanel signal={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Signal detail slide panel ────────────────────────────────────────────────

function SignalSlidePanel({ signal, onClose }: { signal: CompetitiveIntelRow; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const age = relativeAge(signal.dateCaptured);
  const dom = domainHint(signal.sourceUrl);

  const RELEVANCE_BG: Record<string, string> = {
    Alta: "var(--hall-danger-soft)", Media: "var(--hall-warn-soft)", Baja: "var(--hall-fill-soft)",
  };
  const RELEVANCE_FG: Record<string, string> = {
    Alta: "var(--hall-danger)", Media: "var(--hall-warn)", Baja: "var(--hall-muted-3)",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: "min(380px, 90vw)",
          background: "var(--hall-paper-0)",
          borderLeft: "1px solid var(--hall-stroke-0)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--hall-stroke-0)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {signal.relevance && (
              <span
                className="px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: RELEVANCE_FG[signal.relevance] ?? "var(--hall-muted-3)",
                  background: RELEVANCE_BG[signal.relevance] ?? "var(--hall-fill-soft)",
                }}
              >
                {signal.relevance.toUpperCase()}
              </span>
            )}
            {signal.signalType && (
              <span
                className="px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--hall-muted-2)",
                  border: "1px solid var(--hall-line)",
                }}
              >
                {signal.signalType.toUpperCase()}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[13px] w-7 h-7 flex items-center justify-center rounded-full shrink-0 hover:bg-black/5 transition-colors"
            style={{ color: "var(--hall-muted-2)" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Entity */}
          {signal.entityName && (
            <div>
              <p
                className="text-[8px] font-bold uppercase tracking-widest mb-0.5"
                style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
              >
                {signal.entityType ?? "Entity"}
              </p>
              <p
                className="text-[13px] font-bold"
                style={{ color: "var(--hall-ink-0)" }}
              >
                {signal.entityName}
              </p>
            </div>
          )}

          {/* Title */}
          <div>
            <p
              className="text-[8px] font-bold uppercase tracking-widest mb-1"
              style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
            >
              Signal
            </p>
            <p
              className="text-[14px] font-semibold leading-snug"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {signal.title}
            </p>
          </div>

          {/* Summary */}
          {signal.summary?.trim() && (
            <div>
              <p
                className="text-[8px] font-bold uppercase tracking-widest mb-1"
                style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
              >
                Summary
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--hall-ink-0)", opacity: 0.7 }}
              >
                {signal.summary}
              </p>
            </div>
          )}

          {/* Meta strip */}
          <div
            className="rounded-xl px-3 py-2.5 flex flex-col gap-1.5"
            style={{ background: "var(--hall-fill-soft)", border: "1px solid var(--hall-line-soft)" }}
          >
            {age && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>Captured</span>
                <span className="text-[10px] font-semibold" style={{ color: "var(--hall-muted-2)" }}>{age}</span>
              </div>
            )}
            {signal.status && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>Status</span>
                <span className="text-[10px] font-semibold" style={{ color: "var(--hall-muted-2)" }}>{signal.status}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer links */}
        <div
          className="px-5 py-3 flex items-center gap-3 shrink-0"
          style={{ borderTop: "1px solid var(--hall-stroke-0)" }}
        >
          {signal.sourceUrl && (
            <a
              href={signal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-70"
              style={{
                background: "var(--hall-ink-0)",
                color: "var(--hall-paper-0)",
              }}
            >
              {dom ?? "Source"} ↗
            </a>
          )}
          <a
            href={signal.notionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-70"
            style={{
              background: "var(--hall-fill-soft)",
              color: "var(--hall-muted-2)",
              border: "1px solid var(--hall-line)",
            }}
          >
            Notion ↗
          </a>
        </div>
      </div>
    </>
  );
}

// ── Bucket list ───────────────────────────────────────────────────────────────

function Bucket({
  label,
  rows,
  onSelect,
}: {
  label: string;
  rows: CompetitiveIntelRow[];
  onSelect: (r: CompetitiveIntelRow) => void;
}) {
  return (
    <div>
      <p
        className="text-[8.5px] font-bold uppercase tracking-widest mb-2"
        style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
      >
        {label} · {rows.length}
      </p>
      <ul className="flex flex-col">
        {rows.slice(0, 10).map((r) => {
          const age = relativeAge(r.dateCaptured);
          return (
            <li
              key={r.id}
              className="py-2 cursor-pointer group"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
              onClick={() => onSelect(r)}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <RelevancePill r={r.relevance} />
                <SignalTypePill t={r.signalType} />
                {r.entityName && (
                  <span
                    className="text-[10px] font-semibold truncate"
                    style={{ color: "var(--hall-ink-0)" }}
                  >
                    {r.entityName}
                  </span>
                )}
                <span
                  className="text-[9px] ml-auto shrink-0"
                  style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                >
                  {age ?? "—"}
                </span>
              </div>
              <p
                className="text-[11.5px] font-semibold leading-snug group-hover:opacity-70 transition-opacity"
                style={{ color: "var(--hall-ink-0)" }}
              >
                {r.title}
                <span className="ml-1 text-[9px] font-normal" style={{ color: "var(--hall-muted-3)", opacity: 0 }} aria-hidden>▸</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
