"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CompetitiveIntelRow, WatchlistEntity } from "@/lib/notion/competitive";

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityStat = WatchlistEntity & {
  totalSignals: number;
  newSignals: number;
  latestSignal: CompetitiveIntelRow | null;
  weekBuckets: number[];
  signals: CompetitiveIntelRow[];
};

type Props = {
  signals: CompetitiveIntelRow[];
  entityStats: EntityStat[];
  entityCount: number;
  newCount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  "Grant":       "bg-rose-50 text-rose-700 border border-rose-200",
  "Partnership": "bg-blue-50 text-blue-700 border border-blue-200",
  "Hiring":      "bg-green-50 text-green-700 border border-green-200",
  "Funding":     "bg-purple-50 text-purple-700 border border-purple-200",
  "Media / PR":  "bg-gray-100 text-gray-600 border border-gray-200",
  "Evento":      "bg-amber-50 text-amber-700 border border-amber-200",
  "Producto":    "bg-orange-50 text-orange-700 border border-orange-200",
  "Campana":     "bg-sky-50 text-sky-700 border border-sky-200",
  "Contenido":   "bg-indigo-50 text-indigo-700 border border-indigo-200",
  "Pricing":     "bg-teal-50 text-teal-700 border border-teal-200",
};

const REL_COLORS: Record<string, string> = {
  "Alta":  "bg-red-50 text-red-700 border border-red-200",
  "Media": "bg-amber-50 text-amber-700 border border-amber-200",
  "Baja":  "bg-gray-100 text-gray-500 border border-gray-200",
};

const ENTITY_TYPE_BADGE: Record<string, string> = {
  "Competitor":         "bg-red-50 text-red-700 border border-red-200",
  "Partner":            "bg-blue-50 text-blue-700 border border-blue-200",
  "Referente":          "bg-gray-100 text-gray-600 border border-gray-200",
  "Sector":             "bg-green-50 text-green-700 border border-green-200",
  "Cliente potencial":  "bg-amber-50 text-amber-700 border border-amber-200",
};

function pill(cls: string, label: string) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide leading-none ${cls}`}>
      {label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysAgo(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ─── Waveform SVG ─────────────────────────────────────────────────────────────

function WaveformSVG({ buckets, accent = false, h = 44 }: { buckets: number[]; accent?: boolean; h?: number }) {
  const n = buckets.length;
  const barW = 7;
  const gap = 4;
  const totalW = n * barW + (n - 1) * gap;
  const centerY = h / 2;
  const maxVal = Math.max(...buckets, 1);

  return (
    <svg viewBox={`0 0 ${totalW} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
      <line x1={0} y1={centerY} x2={totalW} y2={centerY} stroke="#e2e2da" strokeWidth={1} />
      {buckets.map((v, i) => {
        const bh = v === 0 ? 3 : Math.max(4, (v / maxVal) * (centerY - 2));
        const x = i * (barW + gap);
        const isLatest = i === n - 1;
        const fill = v === 0
          ? "#e8e8e2"
          : isLatest && accent
          ? "#c8f55a"
          : "var(--hall-ink-0, #131218)";
        return (
          <rect
            key={i}
            x={x} y={centerY - bh}
            width={barW} height={bh * 2}
            rx={2} fill={fill}
          />
        );
      })}
    </svg>
  );
}

// ─── Sparkline (key relationships) ────────────────────────────────────────────

function Sparkline({ buckets }: { buckets: number[] }) {
  const maxVal = Math.max(...buckets, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 32 }}>
      {buckets.map((v, i) => {
        const pct = v === 0 ? 8 : Math.max(20, (v / maxVal) * 100);
        const bg = v === 0
          ? "#e2e2da"
          : v < maxVal * 0.5
          ? "#b8e68a"
          : v < maxVal * 0.8
          ? "#8ed640"
          : "#c8f55a";
        return (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${pct}%`, background: bg, minWidth: 4 }}
          />
        );
      })}
    </div>
  );
}

// ─── Slide panel ──────────────────────────────────────────────────────────────

function SlidePanel({ entity, onClose }: { entity: EntityStat | null; onClose: () => void }) {
  const open = entity !== null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: "rgba(0,0,0,0.15)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
        }}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col overflow-hidden"
        style={{
          width: 420,
          background: "var(--hall-paper-0, #fff)",
          borderLeft: "1.5px solid var(--hall-ink-0, #131218)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {entity && (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-0 flex-shrink-0">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="text-[17px] font-extrabold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>
                    {entity.name}
                  </div>
                  <div className="text-[9px] font-bold tracking-[1.2px] uppercase mt-0.5" style={{ color: "var(--hall-muted-2)" }}>
                    {entity.type ?? "Sin tipo"}{entity.scanFrequency ? ` · ${entity.scanFrequency}` : ""}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
                  style={{ background: "var(--hall-paper-1, #f5f5ef)", color: "var(--hall-muted-2)" }}
                >
                  ×
                </button>
              </div>

              {/* Mini waveform */}
              <div className="mt-4 mb-0">
                <WaveformSVG buckets={entity.weekBuckets} accent h={40} />
              </div>

              {/* Stats strip */}
              <div
                className="flex mt-0 -mx-6"
                style={{ borderTop: "1.5px solid var(--hall-ink-0)", borderBottom: "1.5px solid var(--hall-ink-0)" }}
              >
                {[
                  { val: entity.totalSignals, lbl: "Signals (84d)" },
                  { val: entity.newSignals,   lbl: "Sin revisar" },
                  { val: entity.signals.filter(s => s.relevance === "Alta").length, lbl: "Alta rel." },
                ].map(({ val, lbl }, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center py-3"
                    style={{ borderRight: i < 2 ? "1px solid var(--hall-paper-2, #e2e2da)" : undefined }}
                  >
                    <div className="text-[20px] font-black tracking-tighter" style={{ color: "var(--hall-ink-0)" }}>{val}</div>
                    <div className="text-[8px] font-bold tracking-[1px] uppercase mt-0.5" style={{ color: "var(--hall-muted-2)" }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signals list */}
            <div className="flex-1 overflow-y-auto">
              {entity.signals.length === 0 ? (
                <p className="px-6 py-10 text-center text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
                  Sin señales en los últimos 84 días
                </p>
              ) : (
                <>
                  <div className="px-6 pt-4 pb-2 text-[8px] font-bold tracking-[1.8px] uppercase" style={{ color: "var(--hall-muted-2)" }}>
                    Señales recientes
                  </div>
                  {entity.signals.map((s) => (
                    <div
                      key={s.id}
                      className="px-6 py-3.5 border-b"
                      style={{ borderColor: "var(--hall-paper-2, #e2e2da)" }}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        {s.signalType && pill(TYPE_COLORS[s.signalType] ?? "bg-gray-100 text-gray-600", s.signalType)}
                        {s.relevance && pill(REL_COLORS[s.relevance] ?? "bg-gray-100 text-gray-500", `${s.relevance} rel.`)}
                      </div>
                      <div className="text-[12.5px] font-bold leading-snug mb-1" style={{ color: "var(--hall-ink-0)" }}>
                        {s.title}
                      </div>
                      {s.summary && (
                        <div className="text-[11px] leading-relaxed mb-2" style={{ color: "#444" }}>
                          {s.summary}
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="text-[9.5px]" style={{ color: "var(--hall-muted-2)" }}>{fmtDate(s.dateCaptured)}</span>
                        {s.sourceUrl && (
                          <a
                            href={s.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-medium underline underline-offset-2"
                            style={{ color: "var(--hall-muted-2)" }}
                          >
                            Ver fuente ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Tab: Actividad (waveform grid) ───────────────────────────────────────────

function TabActividad({ entityStats, onSelectEntity }: { entityStats: EntityStat[]; onSelectEntity: (e: EntityStat) => void }) {
  if (entityStats.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--hall-paper-2, #e2e2da)" }}>
        <p className="text-[13px] font-bold mb-2" style={{ color: "var(--hall-muted-2)" }}>Watchlist vacía</p>
        <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
          Agrega entidades al Watchlist en Notion y lanza el primer scan para ver actividad aquí.
        </p>
      </div>
    );
  }

  const weekLabels = (() => {
    const labels: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.now() - i * 7 * 86_400_000);
      labels.push(d.toLocaleDateString("es-GB", { day: "numeric", month: "short" }));
    }
    return labels;
  })();

  // Group by priority: Competitor → Partner → everything else, sorted by activity within each group
  const GROUP_ORDER = ["Competitor", "Partner", "Referente", "Sector", "Cliente potencial"];
  const groups = GROUP_ORDER.map((groupType) => ({
    type: groupType,
    items: entityStats
      .filter((e) => (e.type ?? "Sector") === groupType)
      .sort((a, b) => b.totalSignals - a.totalSignals),
  })).filter((g) => g.items.length > 0);

  // Also catch any types not in GROUP_ORDER
  const knownTypes = new Set(GROUP_ORDER);
  const overflow = entityStats.filter((e) => !knownTypes.has(e.type ?? "")).sort((a, b) => b.totalSignals - a.totalSignals);
  if (overflow.length > 0) groups.push({ type: "Otros", items: overflow });

  const GROUP_LABEL: Record<string, string> = {
    Competitor:          "Competidores directos",
    Partner:             "Partners",
    Referente:           "Referentes",
    Sector:              "Sector",
    "Cliente potencial": "Clientes potenciales",
    Otros:               "Otros",
  };

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.type}>
          {/* Section header */}
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-[9px] font-bold tracking-[1.8px] uppercase"
              style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
            >
              {GROUP_LABEL[group.type] ?? group.type}
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--hall-paper-2, #e2e2da)" }} />
            <span className="text-[9px] font-mono" style={{ color: "var(--hall-muted-2)" }}>
              {group.items.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {group.items.map((e) => (
        <button
          key={e.id}
          onClick={() => onSelectEntity(e)}
          className="text-left rounded-2xl p-5 transition-all hover:-translate-y-0.5 focus:outline-none"
          style={{
            background: "var(--hall-paper-0, #fff)",
            border: `1.5px solid ${e.type === "Competitor" ? "#fca5a5" : "var(--hall-paper-2, #e2e2da)"}`,
          }}
        >
          {/* Header row */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[13px] font-extrabold tracking-tight leading-tight" style={{ color: "var(--hall-ink-0)" }}>
                {e.name}
              </div>
              <div className="text-[9px] font-bold tracking-[1px] uppercase mt-0.5" style={{ color: "var(--hall-muted-2)" }}>
                {e.type ?? "—"}
              </div>
            </div>
            {e.newSignals > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                {e.newSignals} new
              </span>
            )}
          </div>

          {/* Waveform */}
          <WaveformSVG buckets={e.weekBuckets} accent h={44} />

          {/* Week labels */}
          <div className="flex justify-between mt-1 mb-3">
            <span className="text-[8px] font-semibold" style={{ color: "var(--hall-muted-2)" }}>{weekLabels[0]}</span>
            <span className="text-[8px] font-semibold" style={{ color: "var(--hall-muted-2)" }}>Hoy</span>
          </div>

          {/* Footer */}
          <div className="flex items-end justify-between">
            <div className="flex-1 pr-3 min-w-0">
              {e.latestSignal ? (
                <>
                  <div className="text-[11px] font-medium leading-snug truncate" style={{ color: "var(--hall-ink-0)" }}>
                    {e.latestSignal.title}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: "var(--hall-muted-2)" }}>
                    {e.latestSignal.signalType ?? "Señal"} · {fmtDate(e.latestSignal.dateCaptured)}
                  </div>
                </>
              ) : (
                <div className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>Sin señales recientes</div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[22px] font-black tracking-tighter leading-none" style={{ color: "var(--hall-ink-0)" }}>
                {e.totalSignals}
              </div>
              <div className="text-[8px] font-bold tracking-[1px] uppercase" style={{ color: "var(--hall-muted-2)" }}>
                signals
              </div>
            </div>
          </div>
        </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Señales ─────────────────────────────────────────────────────────────

function TabSenales({ signals }: { signals: CompetitiveIntelRow[] }) {
  const [filterEntity, setFilterEntity] = useState("");
  const [filterType,   setFilterType]   = useState("");
  const [filterRel,    setFilterRel]    = useState("");
  const [hoveredId,    setHoveredId]    = useState<string | null>(null);

  const entities = [...new Set(signals.map((s) => s.entityName).filter(Boolean))] as string[];
  const types    = [...new Set(signals.map((s) => s.signalType).filter(Boolean))] as string[];

  const filtered = signals.filter((s) => {
    if (filterEntity && s.entityName !== filterEntity) return false;
    if (filterType   && s.signalType  !== filterType)   return false;
    if (filterRel    && s.relevance   !== filterRel)     return false;
    return true;
  });

  if (signals.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--hall-paper-2, #e2e2da)" }}>
        <p className="text-[13px] font-bold mb-2" style={{ color: "var(--hall-muted-2)" }}>Sin señales todavía</p>
        <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
          Configura el Watchlist y lanza el primer scan para ver señales aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}
          className="h-8 px-2.5 rounded-lg text-[11px] font-medium border outline-none"
          style={{ borderColor: "var(--hall-paper-2)", background: "var(--hall-paper-0)", color: "var(--hall-ink-0)" }}
        >
          <option value="">Todas las entidades</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select
          value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="h-8 px-2.5 rounded-lg text-[11px] font-medium border outline-none"
          style={{ borderColor: "var(--hall-paper-2)", background: "var(--hall-paper-0)", color: "var(--hall-ink-0)" }}
        >
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterRel} onChange={(e) => setFilterRel(e.target.value)}
          className="h-8 px-2.5 rounded-lg text-[11px] font-medium border outline-none"
          style={{ borderColor: "var(--hall-paper-2)", background: "var(--hall-paper-0)", color: "var(--hall-ink-0)" }}
        >
          <option value="">Toda relevancia</option>
          {["Alta", "Media", "Baja"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="ml-auto text-[10px] font-mono" style={{ color: "var(--hall-muted-2)" }}>
          {filtered.length} / {signals.length}
        </span>
      </div>

      {/* Signal list */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--hall-paper-2, #e2e2da)" }}>
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-[11px]" style={{ color: "var(--hall-muted-2)" }}>Sin resultados con estos filtros</p>
        ) : (
          filtered.map((s, i) => {
            const days = daysAgo(s.dateCaptured);
            const agingPct = Math.min(100, days * 4);
            const agingColor = days < 7 ? "#4ade80" : days < 14 ? "#fbbf24" : "#f87171";
            const isNew = s.status === "New";

            return (
              <div
                key={s.id}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative flex items-start gap-4 px-5 py-4 transition-colors"
                style={{
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--hall-paper-2, #e2e2da)" : undefined,
                  background: hoveredId === s.id ? "rgba(0,0,0,0.018)" : undefined,
                  overflow: "hidden",
                }}
              >
                {/* Aging bar (bottom edge, only for New signals) */}
                {isNew && (
                  <div
                    className="absolute bottom-0 left-0 h-[2px] rounded-r transition-all duration-700"
                    style={{ width: `${agingPct}%`, background: agingColor }}
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    {s.entityName && (
                      <span className="text-[9.5px] font-bold" style={{ color: "var(--hall-muted-2)" }}>{s.entityName}</span>
                    )}
                    {s.signalType && pill(TYPE_COLORS[s.signalType] ?? "bg-gray-100 text-gray-600", s.signalType)}
                    {s.relevance  && pill(REL_COLORS[s.relevance] ?? "bg-gray-100 text-gray-500", s.relevance)}
                  </div>
                  <div className="text-[12.5px] font-bold leading-snug mb-1" style={{ color: "var(--hall-ink-0)" }}>
                    {s.title}
                  </div>
                  {s.summary && (
                    <div className="text-[11px] leading-relaxed" style={{ color: "#555" }}>
                      {s.summary}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[9.5px]" style={{ color: "var(--hall-muted-2)" }}>{fmtDate(s.dateCaptured)}</span>
                    {s.sourceUrl && (
                      <a
                        href={s.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-medium underline underline-offset-2"
                        style={{ color: "var(--hall-muted-2)" }}
                      >
                        Ver fuente ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Quick actions — visible on hover */}
                <div
                  className="flex flex-col gap-1.5 flex-shrink-0 transition-opacity duration-150"
                  style={{ opacity: hoveredId === s.id ? 1 : 0 }}
                >
                  <span
                    className="inline-flex items-center px-2 py-1 rounded text-[9px] font-bold"
                    style={{
                      background: isNew ? "var(--hall-paper-1, #f5f5ef)" : "#dcfce7",
                      color: isNew ? "var(--hall-muted-2)" : "#15803d",
                    }}
                  >
                    {isNew ? "New" : s.status}
                  </span>
                  {s.notionUrl && (
                    <a
                      href={s.notionUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-2 py-1 rounded text-[9px] font-medium border transition-colors"
                      style={{
                        borderColor: "var(--hall-paper-2)",
                        color: "var(--hall-muted-2)",
                        background: "var(--hall-paper-0)",
                      }}
                    >
                      Notion ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Tab: Relaciones ──────────────────────────────────────────────────────────

function TabRelaciones({ entityStats }: { entityStats: EntityStat[] }) {
  if (entityStats.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--hall-paper-2, #e2e2da)" }}>
        <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>Sin entidades en el Watchlist todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[11px] rounded-xl px-4 py-3" style={{ background: "rgba(200,245,90,0.08)", border: "1px solid rgba(200,245,90,0.3)", color: "#3a6600" }}>
        Frecuencia de señales detectadas por entidad en las últimas 12 semanas. Mayor actividad = más visible en el mercado.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {entityStats.map((e) => {
          const maxWeek = Math.max(...e.weekBuckets);
          const warmth = maxWeek === 0 ? "fría" : maxWeek >= 3 ? "alta" : "media";
          const warmthColor = maxWeek === 0 ? "#94a3b8" : maxWeek >= 3 ? "#22c55e" : "#f59e0b";

          return (
            <div
              key={e.id}
              className="rounded-2xl p-5"
              style={{
                background: "var(--hall-paper-0, #fff)",
                border: "1.5px solid var(--hall-paper-2, #e2e2da)",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[13px] font-extrabold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{e.name}</div>
                  <div className="text-[9px] font-bold tracking-[1px] uppercase mt-0.5" style={{ color: "var(--hall-muted-2)" }}>{e.type ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-black tracking-tighter" style={{ color: warmthColor }}>{warmth}</div>
                  <div className="text-[8px] font-bold tracking-[1px] uppercase mt-0.5" style={{ color: "var(--hall-muted-2)" }}>actividad</div>
                </div>
              </div>

              <Sparkline buckets={e.weekBuckets} />

              <div className="flex justify-between mt-1.5 mb-4">
                <span className="text-[8px] font-semibold" style={{ color: "var(--hall-muted-2)" }}>12 semanas</span>
                <span className="text-[8px] font-semibold" style={{ color: "var(--hall-muted-2)" }}>Hoy</span>
              </div>

              <div className="text-[10px] font-medium" style={{ color: "var(--hall-ink-0)" }}>
                {e.totalSignals} señal{e.totalSignals !== 1 ? "es" : ""} detectadas
              </div>
              {e.latestSignal && (
                <div className="text-[9.5px] mt-0.5" style={{ color: "var(--hall-muted-2)" }}>
                  Última: {fmtDate(e.latestSignal.dateCaptured)}
                </div>
              )}
              {e.website && (
                <a
                  href={e.website} target="_blank" rel="noopener noreferrer"
                  className="text-[9px] mt-2 inline-block underline underline-offset-2 font-medium"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  {new URL(e.website).hostname} ↗
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ entityCount, totalSignals, newCount }: { entityCount: number; totalSignals: number; newCount: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { val: entityCount,   lbl: "Entidades",    sub: "en watchlist" },
        { val: totalSignals,  lbl: "Signals",      sub: "últimas 12 sem." },
        { val: newCount,      lbl: "Sin revisar",  sub: "requieren acción" },
        { val: Math.max(...[0]), lbl: "Último scan", sub: "por agente" },
      ].map(({ val, lbl, sub }, i) => (
        <div
          key={i}
          className="rounded-xl px-4 py-3"
          style={{ background: "var(--hall-paper-0, #fff)", border: "1.5px solid var(--hall-paper-2, #e2e2da)" }}
        >
          <div
            className="text-[22px] font-black tracking-tighter leading-none"
            style={{ color: i === 2 && newCount > 0 ? "#dc2626" : "var(--hall-ink-0)" }}
          >
            {i === 3 ? "—" : val}
          </div>
          <div className="text-[10px] font-bold mt-1" style={{ color: "var(--hall-ink-0)" }}>{lbl}</div>
          <div className="text-[9px] mt-0.5" style={{ color: "var(--hall-muted-2)" }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Root client component ────────────────────────────────────────────────────

export function CompetitiveIntelClient({ signals, entityStats, entityCount, newCount }: Props) {
  const [activeTab, setActiveTab]       = useState<"actividad" | "senales" | "relaciones">("actividad");
  const [selectedEntity, setSelectedEntity] = useState<EntityStat | null>(null);
  const [scanning, setScanning]         = useState(false);
  const [scanMsg, setScanMsg]           = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch("/api/competitive-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "execute" }),
      });
      const data = await res.json();
      setScanMsg(res.ok ? `Scan completado · ${data.signalsCreated ?? "?"} señales nuevas` : data.error ?? "Error en scan");
    } catch {
      setScanMsg("Error de red — intenta de nuevo");
    } finally {
      setScanning(false);
    }
  }, []);

  const TABS = [
    { id: "actividad"  as const, label: "Actividad" },
    { id: "senales"    as const, label: `Señales${newCount > 0 ? ` · ${newCount}` : ""}` },
    { id: "relaciones" as const, label: "Relaciones" },
  ];

  return (
    <>
      {/* Tab bar */}
      <div
        className="-mx-4 sm:-mx-9 px-4 sm:px-9 flex items-center gap-1 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--hall-paper-2, #e2e2da)", marginTop: -4 }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px"
            style={{
              borderBottomColor: activeTab === t.id ? "var(--hall-ink-0)" : "transparent",
              color: activeTab === t.id ? "var(--hall-ink-0)" : "var(--hall-muted-2)",
            }}
          >
            {t.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 py-1.5">
          {scanMsg && (
            <span className="text-[9.5px] font-medium" style={{ color: "var(--hall-muted-2)" }}>{scanMsg}</span>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="h-7 px-3 rounded-lg text-[10px] font-bold tracking-wide transition-opacity disabled:opacity-50"
            style={{ background: "var(--hall-ink-0)", color: "#fff" }}
          >
            {scanning ? "Escaneando…" : "▶ Scan ahora"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsBar entityCount={entityCount} totalSignals={signals.length} newCount={newCount} />

      {/* Tab content */}
      {activeTab === "actividad" && (
        <TabActividad entityStats={entityStats} onSelectEntity={setSelectedEntity} />
      )}
      {activeTab === "senales" && (
        <TabSenales signals={signals} />
      )}
      {activeTab === "relaciones" && (
        <TabRelaciones entityStats={entityStats} />
      )}

      {/* Slide panel */}
      <SlidePanel entity={selectedEntity} onClose={() => setSelectedEntity(null)} />
    </>
  );
}
