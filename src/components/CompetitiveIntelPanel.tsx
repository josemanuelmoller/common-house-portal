"use client";

import { useState, useTransition } from "react";
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
            <Bucket label="Competitor pulse" rows={buckets.Competitor} />
          )}
          {buckets.Sector.length > 0 && (
            <Bucket label="Sector signal" rows={buckets.Sector} />
          )}
          {buckets.Other.length > 0 && (
            <Bucket label="Other watchlist" rows={buckets.Other} />
          )}
        </div>
      )}
    </div>
  );
}

function Bucket({ label, rows }: { label: string; rows: CompetitiveIntelRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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
          const isOpen = expanded.has(r.id);
          const hasSummary = !!r.summary?.trim();
          const href = r.sourceUrl ?? r.notionUrl;
          const age = relativeAge(r.dateCaptured);
          const dom = domainHint(r.sourceUrl);
          return (
            <li
              key={r.id}
              className="py-2"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
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
              <button
                type="button"
                onClick={() => hasSummary && toggle(r.id)}
                className={`text-left w-full ${hasSummary ? "cursor-pointer" : "cursor-default"}`}
                disabled={!hasSummary}
              >
                <p className="text-[11.5px] font-semibold leading-snug" style={{ color: "var(--hall-ink-0)" }}>
                  {r.title}
                  {hasSummary && (
                    <span className="ml-1 text-[9px] font-normal" style={{ color: "var(--hall-muted-3)" }}>
                      {isOpen ? "▾" : "▸"}
                    </span>
                  )}
                </p>
              </button>
              {hasSummary && isOpen && (
                <p className="text-[10px] leading-snug mt-1" style={{ color: "var(--hall-muted-2)" }}>
                  {r.summary}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                {r.sourceUrl && (
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9.5px] font-semibold"
                    style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
                  >
                    {dom ?? "source"} ↗
                  </a>
                )}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9.5px] font-semibold"
                  style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                  title="Open in Notion"
                >
                  {r.sourceUrl ? "Notion ↗N" : "Open ↗N"}
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
