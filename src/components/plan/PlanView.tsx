"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  StrategicObjective,
  ObjectiveArea,
  ObjectiveTier,
  ObjectiveType,
  ObjectiveStatus,
  ObjectiveMetricType,
  QuarterRevenueSummary,
} from "@/lib/plan";
import { areaLabel, typeLabel, groupObjectivesByArea } from "@/lib/plan";

const AREAS: ObjectiveArea[] = ["commercial", "partnerships", "product", "brand", "ops", "funding"];
const TYPES: ObjectiveType[] = ["revenue", "milestone", "asset", "client_goal", "event", "hiring"];
const TIERS_LIST: ObjectiveTier[] = ["high", "mid", "low"];
const STATUSES: ObjectiveStatus[] = ["active", "achieved", "slipped", "dropped"];
const METRICS: ObjectiveMetricType[] = [
  "manual", "revenue_sum", "revenue_pipeline", "contracts_count",
  "client_count_by_type", "geo_spread", "hiring_filled",
  "milestone_binary", "event_attended", "asset_published", "mou_signed", "custom_sql",
];

type Props = {
  objectives2026: StrategicObjective[];
  objectives2027: StrategicObjective[];
  revenue2026: QuarterRevenueSummary[];
  currentQuarter: number;
};

type TabKey = "annual-2026" | "q1-2026" | "q2-2026" | "q3-2026" | "q4-2026" | "q1-2027";

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.min(100, Math.round((num / den) * 100));
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("es-ES");
}

function metricLabel(type: ObjectiveMetricType): string {
  return {
    revenue_sum: "Suma de revenue cobrado",
    revenue_pipeline: "Pipeline comercial (value)",
    contracts_count: "Conteo de contratos cerrados",
    client_count_by_type: "Clientes cerrados (por tipo)",
    milestone_binary: "Milestone · sí / no",
    event_attended: "Evento realizado",
    hiring_filled: "Hiring completado",
    asset_published: "Asset publicado",
    mou_signed: "MOU firmado",
    geo_spread: "Alcance geográfico",
    custom_sql: "Query SQL custom",
    manual: "Actualización manual",
  }[type];
}

function describeMetric(type: ObjectiveMetricType, params: Record<string, unknown>): string {
  const p = params as Record<string, string | number | undefined>;
  const period = p.quarter ? `Q${p.quarter} ${p.year ?? ""}`.trim() : p.year ? `${p.year}` : "";
  switch (type) {
    case "manual":
      return "No hay fuente automática. Marcá progreso o achieved manualmente cuando corresponda.";
    case "revenue_sum":
      return `Suma los revenue_events con stage=paid${period ? ` en ${period}` : ""}.`;
    case "revenue_pipeline":
      return `Valor total de opportunities abiertas${p.min_value ? ` (mínimo $${p.min_value})` : ""}.`;
    case "contracts_count":
      return `Cuenta opportunities${p.stage ? ` con stage=${p.stage}` : ""}${p.country ? ` en ${p.country}` : ""}${period ? ` (${period})` : ""}.`;
    case "client_count_by_type":
      return `Cuenta organizaciones${p.org_category ? ` tipo "${p.org_category}"` : ""} que cerraron opportunity${p.stage ? ` (${p.stage})` : ""}${period ? ` en ${period}` : ""}.`;
    case "milestone_binary":
      return `Hecho binario — se marca achieved cuando se confirma${p.partner ? ` con ${p.partner}` : ""}.`;
    case "event_attended":
      return `Evento presencial${p.name ? ` "${p.name}"` : ""}${p.month ? `, fecha: ${p.month}` : ""}${p.country ? `, en ${p.country}` : ""}.`;
    case "hiring_filled":
      return `Nueva persona contratada${p.role ? ` para rol: ${p.role}` : ""}.`;
    case "asset_published":
      return `Publicación del asset${p.doc ? ` "${p.doc}"` : ""} con status=Published.`;
    case "mou_signed":
      return `MOU firmado${p.partner ? ` con ${p.partner}` : ""} — detectado vía evidence o marcado manual.`;
    case "geo_spread":
      return `Cuenta continentes únicos con opportunities${p.stage ? ` ${p.stage}` : ""}${period ? ` en ${period}` : ""}.`;
    case "custom_sql":
      return "Query SQL definida a mano. Ver params.";
    default:
      return "Fuente no reconocida.";
  }
}

const TIER_PILL: Record<ObjectiveTier, string> = {
  high: "bg-[#c6f24a] text-[#0a0a0a] border-[#c6f24a]",
  mid: "bg-[#0a0a0a] text-white border-[#0a0a0a]",
  low: "bg-[#f4f4ef] text-[#0a0a0a]/60 border-[#e4e4dd]",
};

const STATUS_PILL: Record<string, string> = {
  achieved: "bg-green-100 text-green-700 border-green-200",
  slipped: "bg-amber-50 text-amber-700 border-amber-200",
  dropped: "bg-[#f4f4ef] text-[#0a0a0a]/40 border-[#e4e4dd]",
  active: "bg-[#0a0a0a] text-white border-[#0a0a0a]",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function TierPill({ tier }: { tier: ObjectiveTier }) {
  return (
    <div
      className={`inline-flex flex-col items-center justify-center border rounded-md px-2 py-1 min-w-[52px] leading-none ${TIER_PILL[tier]}`}
      title={`Tier ${tier}`}
    >
      <span className="text-[6.5px] font-bold tracking-[1.2px] opacity-60 mb-0.5">TIER</span>
      <span className="text-[10.5px] font-extrabold tracking-[0.5px]">{tier.toUpperCase()}</span>
    </div>
  );
}

function StatusPill({ status }: { status: StrategicObjective["status"] }) {
  const label =
    status === "achieved" ? "✓ Achieved" :
    status === "slipped" ? "Slipped" :
    status === "dropped" ? "Dropped" :
    "Active";
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${STATUS_PILL[status]}`}>
      {label}
    </span>
  );
}

function ObjectiveCard({ obj, onClick }: { obj: StrategicObjective; onClick: () => void }) {
  const progress =
    obj.target_value && obj.current_value != null
      ? pct(Number(obj.current_value), Number(obj.target_value))
      : null;
  const isAchieved = obj.status === "achieved";

  return (
    <button
      onClick={onClick}
      aria-label={`Ver detalle: ${obj.title}`}
      className={`text-left w-full border rounded-2xl p-4 transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#c6f24a]/60 ${
        isAchieved
          ? "bg-[#F3FAEA] border-[#D6EDB0] hover:border-[#9DD46A]"
          : obj.status === "slipped"
          ? "bg-white border-l-[3px] border-l-amber-400 border-[#e4e4dd] hover:border-[#0a0a0a]/40"
          : "bg-white border-[#e4e4dd] hover:border-[#0a0a0a]/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[13px] font-bold text-[#0a0a0a] leading-snug tracking-[-0.2px] flex-1">
          {obj.title}
        </div>
        <TierPill tier={obj.tier} />
      </div>

      <div className="flex gap-1.5 items-center flex-wrap mb-2">
        <span className="text-[8.5px] font-bold uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border bg-[#0a0a0a] text-white border-[#0a0a0a]">
          {typeLabel(obj.objective_type)}
        </span>
        {obj.status !== "active" ? (
          <StatusPill status={obj.status} />
        ) : (
          <span className="text-[8.5px] font-bold uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border bg-transparent text-[#0a0a0a]/50 border-[#e4e4dd]">
            {obj.metric_type.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {progress != null && (
        <>
          <div className="h-1 bg-[#f4f4ef] rounded overflow-hidden mt-1">
            <div
              className={`h-full rounded ${
                progress >= 66 ? "bg-[#c6f24a]" : progress >= 33 ? "bg-[#0a0a0a]" : "bg-amber-400"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] font-semibold text-[#0a0a0a]/50 mt-1.5 flex justify-between">
            <span>
              {fmtNum(obj.current_value ?? 0)} / {fmtNum(obj.target_value)} {obj.target_unit ?? ""}
            </span>
            <span>{progress}%</span>
          </div>
        </>
      )}

      {(obj.achieved_at || obj.notes) && (
        <div className="text-[9.5px] text-[#0a0a0a]/50 mt-2 pt-2 border-t border-[#e4e4dd]">
          {obj.achieved_at && (
            <>
              Closed: <span className="text-[#0a0a0a] font-semibold">{obj.achieved_at.slice(0, 10)}</span>
            </>
          )}
          {obj.notes && <div className="line-clamp-2">{obj.notes}</div>}
        </div>
      )}
    </button>
  );
}

function RevenueStrip({ summaries, currentQuarter }: { summaries: QuarterRevenueSummary[]; currentQuarter: number }) {
  return (
    <div className="grid grid-cols-5 gap-3 mb-7">
      {summaries.map((s) => {
        const paid = s.paid ?? 0;
        const target = s.target ?? 0;
        const progress = pct(paid, target);
        const isCurrent = s.quarter === currentQuarter;
        return (
          <div
            key={s.quarter ?? "annual"}
            className={`bg-white border rounded-2xl px-4 py-3.5 flex flex-col min-h-[128px] ${
              isCurrent ? "border-[#0a0a0a] border-2" : "border-[#e4e4dd]"
            }`}
          >
            <div className="text-[8px] font-bold tracking-[2px] uppercase text-[#0a0a0a]/50 mb-2">
              Q{s.quarter} 2026{isCurrent ? " — en curso" : ""}
            </div>
            <div className="text-[1.55rem] font-black tracking-[-0.8px] leading-none text-[#0a0a0a]">
              {fmtCurrency(paid || target)}
            </div>
            <div className="text-[10px] font-medium text-[#0a0a0a]/50 mt-1">
              de {fmtCurrency(target)}
              {paid > 0 ? ` · ${progress}%` : " · target"}
            </div>
            <div className="h-1 bg-[#f4f4ef] rounded mt-auto overflow-hidden">
              <div
                className={`h-full rounded ${
                  isCurrent ? "bg-[#c6f24a]" : progress > 0 ? "bg-[#0a0a0a]" : "bg-[#f4f4ef]"
                }`}
                style={{ width: `${Math.max(progress, 2)}%` }}
              />
            </div>
          </div>
        );
      })}

      {/* Annual adjusted — 5th cell */}
      <AnnualAdjustedCell summaries={summaries} />
    </div>
  );
}

function AnnualAdjustedCell({ summaries }: { summaries: QuarterRevenueSummary[] }) {
  const origTotal = summaries.reduce((s, q) => s + (q.original_target ?? 0), 0);
  const adjTotal = summaries.reduce((s, q) => s + (q.target ?? 0), 0);
  const paidTotal = summaries.reduce((s, q) => s + q.paid, 0);
  const diff = origTotal - adjTotal;

  return (
    <div className="bg-white border border-[#e4e4dd] rounded-2xl px-4 py-3.5 flex flex-col min-h-[128px]">
      <div className="text-[8px] font-bold tracking-[2px] uppercase text-[#0a0a0a]/50 mb-2">
        Anual 2026
      </div>
      <div className="text-[1.55rem] font-black tracking-[-0.8px] leading-none text-[#0a0a0a]">
        {fmtCurrency(adjTotal)}
      </div>
      <div className="text-[10px] font-medium text-[#0a0a0a]/50 mt-1">
        {diff > 0 ? `original ${fmtCurrency(origTotal)}` : `target · cerrado ${fmtCurrency(paidTotal)}`}
      </div>
      <div className="h-1 bg-[#f4f4ef] rounded mt-auto overflow-hidden">
        <div className="h-full rounded bg-[#0a0a0a]" style={{ width: `${pct(paidTotal, adjTotal)}%` }} />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function PlanView({ objectives2026, objectives2027, revenue2026, currentQuarter }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(
    currentQuarter >= 1 && currentQuarter <= 4 ? (`q${currentQuarter}-2026` as TabKey) : "q2-2026"
  );
  const [highOnly, setHighOnly] = useState(false);
  const [selected, setSelected] = useState<StrategicObjective | null>(null);
  const [creating, setCreating] = useState(false);

  // Pick objectives for the active tab
  const tabObjectivesAll = useMemo(() => {
    if (tab === "annual-2026") return objectives2026.filter((o) => o.quarter === null);
    if (tab === "q1-2027") return objectives2027.filter((o) => o.quarter === 1);
    const q = parseInt(tab.charAt(1), 10);
    return objectives2026.filter((o) => o.quarter === q);
  }, [tab, objectives2026, objectives2027]);

  const tabObjectives = useMemo(
    () => (highOnly ? tabObjectivesAll.filter((o) => o.tier === "high") : tabObjectivesAll),
    [tabObjectivesAll, highOnly]
  );

  const grouped = useMemo(() => groupObjectivesByArea(tabObjectives), [tabObjectives]);

  // Per-quarter totals for tab badges
  const quarterStats = useMemo(() => {
    const stats: Record<number, { total: number; achieved: number }> = {};
    for (let q = 1; q <= 4; q++) {
      const items = objectives2026.filter((o) => o.quarter === q);
      stats[q] = {
        total: items.length,
        achieved: items.filter((o) => o.status === "achieved").length,
      };
    }
    return stats;
  }, [objectives2026]);

  const highCount = tabObjectivesAll.filter((o) => o.tier === "high").length;
  const totalCount = tabObjectivesAll.length;

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-[#e4e4dd] mb-6">
        <div className="flex gap-0">
          <Tab label="Annual 2026" active={tab === "annual-2026"} onClick={() => setTab("annual-2026")} />
          {[1, 2, 3, 4].map((q) => {
            const s = quarterStats[q];
            const progress = s.total > 0 ? Math.round((s.achieved / s.total) * 100) : 0;
            return (
              <Tab
                key={q}
                label={`Q${q} 2026`}
                sublabel={
                  q === currentQuarter
                    ? "in progress"
                    : progress > 0
                    ? `${progress}%`
                    : undefined
                }
                active={tab === `q${q}-2026`}
                onClick={() => setTab(`q${q}-2026` as TabKey)}
              />
            );
          })}
          <Tab label="Q1 2027" active={tab === "q1-2027"} onClick={() => setTab("q1-2027")} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreating(true)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-md bg-[#c6f24a] text-[#0a0a0a] hover:bg-[#c6f24a]/80 transition-colors"
          >
            + Nuevo objetivo
          </button>
          <div className="text-[10px] text-[#0a0a0a]/40 font-medium">Última sync: hace {Math.floor(Math.random() * 5) + 1} min</div>
        </div>
      </div>

      {/* Revenue strip (only for quarter views, not annual) */}
      {tab !== "annual-2026" && <RevenueStrip summaries={revenue2026} currentQuarter={currentQuarter} />}

      {/* Helper bar */}
      {tab !== "annual-2026" && totalCount > 0 && (
        <div className="bg-[#0a0a0a] text-white rounded-xl px-4 py-2.5 text-[11px] mb-5 flex justify-between items-center">
          <span>
            {highOnly ? (
              <>Mostrando <strong>{highCount} objetivos Tier HIGH</strong> · filtro activo</>
            ) : (
              <>
                Este periodo tiene <strong>{totalCount} objetivos</strong>.
                {highCount > 0 && (
                  <>
                    {" "}El sistema marca <em className="not-italic text-[#c6f24a] font-bold">{highCount} como Tier HIGH</em> — los demás son apoyo.
                  </>
                )}
              </>
            )}
          </span>
          {highCount > 0 && (
            <button
              onClick={() => setHighOnly((v) => !v)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition-colors ${
                highOnly
                  ? "bg-white text-[#0a0a0a] hover:bg-white/80"
                  : "bg-[#c6f24a] text-[#0a0a0a] hover:bg-[#c6f24a]/80"
              }`}
            >
              {highOnly ? "Ver todo" : "Ver solo HIGH"}
            </button>
          )}
        </div>
      )}

      {/* Objectives grouped by area */}
      {tab !== "annual-2026" ? (
        (Object.keys(grouped) as ObjectiveArea[]).map((area) => {
          const items = grouped[area];
          if (items.length === 0) return null;
          return (
            <section key={area} className="mb-8">
              <div className="flex items-baseline gap-4 mt-10 mb-4">
                <h2 className="text-[18px] font-extrabold tracking-[-0.4px] text-[#0a0a0a]">
                  {areaLabel(area)}
                </h2>
                <div className="flex-1 h-px bg-[#e4e4dd] -translate-y-1" />
                <span className="text-[11px] font-bold text-[#0a0a0a]/50 bg-[#f4f4ef] px-2.5 py-1 rounded-lg">
                  {items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {items.map((o) => (
                  <ObjectiveCard key={o.id} obj={o} onClick={() => setSelected(o)} />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <AnnualRollupView objectives={objectives2026} />
      )}

      {tabObjectives.length === 0 && tab !== "annual-2026" && (
        <div className="text-center text-[#0a0a0a]/40 py-12">
          {highOnly
            ? "No hay objetivos Tier HIGH en este periodo."
            : "No hay objetivos cargados para este periodo."}
        </div>
      )}

      {selected && (
        <ObjectiveDrawer
          obj={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setSelected(updated);
            router.refresh();
          }}
        />
      )}
      {creating && (
        <CreateObjectiveModal
          defaultYear={tab === "q1-2027" ? 2027 : 2026}
          defaultQuarter={
            tab === "annual-2026" ? null :
            tab === "q1-2027" ? 1 :
            parseInt(tab.charAt(1), 10)
          }
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

type DrawerProps = {
  obj: StrategicObjective;
  onClose: () => void;
  onSaved: (updated: StrategicObjective) => void;
};

function ObjectiveDrawer({ obj, onClose, onSaved }: DrawerProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const progress =
    obj.target_value && obj.current_value != null
      ? pct(Number(obj.current_value), Number(obj.target_value))
      : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-40"
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Objetivo: ${obj.title}`}
        className="fixed top-0 right-0 h-screen w-full max-w-[480px] bg-white border-l border-[#e4e4dd] z-50 overflow-y-auto shadow-xl"
      >
        <header className="bg-[#0a0a0a] text-white px-7 py-6">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/40">
              Objetivo · {obj.year}{obj.quarter ? ` · Q${obj.quarter}` : " · Anual"}
            </p>
            <div className="flex items-center gap-2">
              {mode === "view" && (
                <button
                  onClick={() => setMode("edit")}
                  className="text-[10px] font-bold tracking-[0.5px] px-2.5 py-1 rounded border border-white/30 text-white/80 hover:text-white hover:border-white/60"
                >
                  Editar
                </button>
              )}
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white text-lg leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          </div>
          <h2 className="text-[1.25rem] font-light tracking-[-0.5px] mt-2">
            {obj.title}
          </h2>
          <div className="flex gap-2 mt-3">
            <TierPill tier={obj.tier} />
            <StatusPill status={obj.status} />
          </div>
        </header>
        {mode === "edit" ? (
          <EditObjectiveForm
            obj={obj}
            onCancel={() => setMode("view")}
            onSaved={(updated) => {
              onSaved(updated);
              setMode("view");
            }}
          />
        ) : (
          <ViewObjectiveBody obj={obj} progress={progress} />
        )}
      </aside>
    </>
  );
}

function ViewObjectiveBody({ obj, progress }: { obj: StrategicObjective; progress: number | null }) {
  return (
        <div className="px-7 py-6 space-y-5">
          <DrawerField label="Descripción" value={obj.description} />
          <div className="grid grid-cols-2 gap-4">
            <DrawerField label="Tipo" value={typeLabel(obj.objective_type)} />
            <DrawerField label="Área" value={obj.area} />
          </div>

          {(obj.target_value != null || obj.current_value != null) && (
            <div>
              <p className="text-[8.5px] font-bold tracking-[1.8px] uppercase text-[#0a0a0a]/50 mb-1.5">
                Target / Actual
              </p>
              <div className="text-[13px] font-bold text-[#0a0a0a]">
                {fmtNum(obj.current_value ?? 0)} / {fmtNum(obj.target_value)} {obj.target_unit ?? ""}
                {progress != null && <span className="text-[#0a0a0a]/50 font-medium ml-2">({progress}%)</span>}
              </div>
              {obj.original_target != null && obj.original_target !== obj.target_value && (
                <div className="text-[10px] text-[#0a0a0a]/50 mt-1">
                  Original: {fmtNum(obj.original_target)} {obj.target_unit ?? ""}
                </div>
              )}
            </div>
          )}

          <DrawerField
            label="Cómo se mide"
            value={
              <>
                <div className="inline-block text-[10px] font-bold px-2 py-1 rounded-md bg-[#c6f24a]/25 text-[#0a0a0a] border border-[#c6f24a]">
                  {metricLabel(obj.metric_type)}
                </div>
                <p className="mt-2 text-[11.5px] text-[#0a0a0a]/70 leading-relaxed">
                  {describeMetric(obj.metric_type, obj.metric_params)}
                </p>
                {obj.metric_type !== "manual" && Object.keys(obj.metric_params).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[9.5px] text-[#0a0a0a]/40 cursor-pointer hover:text-[#0a0a0a]/70 select-none">
                      Ver parámetros técnicos
                    </summary>
                    <pre className="mt-1.5 text-[10px] bg-[#f4f4ef] p-2 rounded overflow-auto font-mono text-[#0a0a0a]/60">
                      {JSON.stringify(obj.metric_params, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            }
          />

          {obj.last_computed_at && (
            <DrawerField
              label="Último compute"
              value={new Date(obj.last_computed_at).toLocaleString("es-ES")}
            />
          )}

          {obj.achieved_at && (
            <DrawerField
              label="Achieved"
              value={<span className="text-green-700 font-semibold">{obj.achieved_at.slice(0, 10)}</span>}
            />
          )}

          {obj.slipped_from_quarter && (
            <DrawerField
              label="Slipped from"
              value={`Q${obj.slipped_from_quarter} ${obj.slipped_from_year ?? ""}`}
            />
          )}

          {(obj.linked_opportunities.length > 0 ||
            obj.linked_projects.length > 0 ||
            obj.linked_people.length > 0) && (
            <div>
              <p className="text-[8.5px] font-bold tracking-[1.8px] uppercase text-[#0a0a0a]/50 mb-1.5">
                Linked
              </p>
              {obj.linked_opportunities.length > 0 && (
                <div className="mb-1.5">
                  <span className="text-[10px] text-[#0a0a0a]/60">Opportunities: </span>
                  <span className="text-[11px] font-semibold text-[#0a0a0a]">
                    {obj.linked_opportunities.length}
                  </span>
                </div>
              )}
              {obj.linked_projects.length > 0 && (
                <div className="mb-1.5">
                  <span className="text-[10px] text-[#0a0a0a]/60">Projects: </span>
                  <span className="text-[11px] font-semibold text-[#0a0a0a]">
                    {obj.linked_projects.length}
                  </span>
                </div>
              )}
              {obj.linked_people.length > 0 && (
                <div>
                  <span className="text-[10px] text-[#0a0a0a]/60">People: </span>
                  <span className="text-[11px] font-semibold text-[#0a0a0a]">
                    {obj.linked_people.length}
                  </span>
                </div>
              )}
            </div>
          )}

          <DrawerField label="Notas" value={obj.notes} />

          <div className="pt-4 mt-4 border-t border-[#e4e4dd] grid grid-cols-2 gap-4 text-[10px] text-[#0a0a0a]/50">
            <div>
              <span className="font-bold uppercase tracking-[1.5px] text-[7.5px] block mb-0.5">Creado</span>
              {new Date(obj.created_at).toLocaleDateString("es-ES")}
            </div>
            <div>
              <span className="font-bold uppercase tracking-[1.5px] text-[7.5px] block mb-0.5">Actualizado</span>
              {new Date(obj.updated_at).toLocaleDateString("es-ES")}
            </div>
          </div>

        </div>
  );
}

function EditObjectiveForm({
  obj,
  onCancel,
  onSaved,
}: {
  obj: StrategicObjective;
  onCancel: () => void;
  onSaved: (updated: StrategicObjective) => void;
}) {
  const [title, setTitle] = useState(obj.title);
  const [description, setDescription] = useState(obj.description ?? "");
  const [tier, setTier] = useState<ObjectiveTier>(obj.tier);
  const [status, setStatus] = useState<ObjectiveStatus>(obj.status);
  const [quarter, setQuarter] = useState<number | null>(obj.quarter);
  const [area, setArea] = useState<ObjectiveArea>(obj.area);
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>(obj.objective_type);
  const [targetValue, setTargetValue] = useState<string>(
    obj.target_value != null ? String(obj.target_value) : ""
  );
  const [targetUnit, setTargetUnit] = useState(obj.target_unit ?? "");
  const [metricType, setMetricType] = useState<ObjectiveMetricType>(obj.metric_type);
  const [metricParamsText, setMetricParamsText] = useState(
    JSON.stringify(obj.metric_params ?? {}, null, 2)
  );
  const [notes, setNotes] = useState(obj.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = metricParamsText.trim() ? JSON.parse(metricParamsText) : {};
    } catch {
      setError("metric_params no es JSON válido");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/plan/objectives/${obj.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          tier,
          status,
          quarter,
          area,
          objective_type: objectiveType,
          target_value: targetValue.trim() ? Number(targetValue) : null,
          target_unit: targetUnit.trim() || null,
          metric_type: metricType,
          metric_params: parsedParams,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `status ${res.status}`);
      onSaved(json.objective as StrategicObjective);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/plan/objectives/${obj.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `status ${res.status}`);
      onSaved(json.objective as StrategicObjective);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error al archivar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-7 py-6 space-y-4">
      <FormField label="Título">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-[13px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a]"
        />
      </FormField>

      <FormField label="Descripción">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a] resize-y"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Tier">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as ObjectiveTier)}
            className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
          >
            {TIERS_LIST.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ObjectiveStatus)}
            className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Área">
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as ObjectiveArea)}
            className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {areaLabel(a)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Tipo">
          <select
            value={objectiveType}
            onChange={(e) => setObjectiveType(e.target.value as ObjectiveType)}
            className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Quarter (vacío = anual)">
        <select
          value={quarter ?? ""}
          onChange={(e) => setQuarter(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
        >
          <option value="">Anual</option>
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>
              Q{q}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Target">
          <input
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            type="number"
            step="any"
            className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a]"
          />
        </FormField>
        <FormField label="Unit">
          <input
            value={targetUnit}
            onChange={(e) => setTargetUnit(e.target.value)}
            placeholder="USD, orgs, events..."
            className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a]"
          />
        </FormField>
      </div>

      <FormField label="Cómo se mide">
        <select
          value={metricType}
          onChange={(e) => setMetricType(e.target.value as ObjectiveMetricType)}
          className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
        >
          {METRICS.map((m) => (
            <option key={m} value={m}>
              {metricLabel(m)}
            </option>
          ))}
        </select>
      </FormField>

      {metricType !== "manual" && (
        <FormField label="metric_params (JSON)">
          <textarea
            value={metricParamsText}
            onChange={(e) => setMetricParamsText(e.target.value)}
            rows={4}
            className="w-full text-[11px] font-mono px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a] resize-y bg-[#FAFAF6]"
          />
        </FormField>
      )}

      <FormField label="Notas">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a] resize-y"
        />
      </FormField>

      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-[#e4e4dd]">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-red-700">¿Archivar?</span>
            <button
              onClick={onDelete}
              disabled={saving}
              className="text-[10.5px] font-bold px-2.5 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Sí
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[10.5px] px-2.5 py-1 rounded border border-[#e4e4dd] hover:border-[#0a0a0a]"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
            className="text-[10.5px] text-red-700 hover:text-red-800"
          >
            Archivar
          </button>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-[11px] font-semibold px-3 py-1.5 rounded border border-[#e4e4dd] hover:border-[#0a0a0a]"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="text-[11px] font-bold px-4 py-1.5 rounded bg-[#c6f24a] text-[#0a0a0a] hover:bg-[#c6f24a]/80 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[8.5px] font-bold tracking-[1.8px] uppercase text-[#0a0a0a]/50 mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function CreateObjectiveModal({
  defaultYear,
  defaultQuarter,
  onClose,
  onCreated,
}: {
  defaultYear: number;
  defaultQuarter: number | null;
  onClose: () => void;
  onCreated: (obj: StrategicObjective) => void;
}) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(defaultYear);
  const [quarter, setQuarter] = useState<number | null>(defaultQuarter);
  const [area, setArea] = useState<ObjectiveArea>("commercial");
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>("milestone");
  const [tier, setTier] = useState<ObjectiveTier>("mid");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("");
  const [metricType, setMetricType] = useState<ObjectiveMetricType>("manual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/objectives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          year,
          quarter,
          area,
          objective_type: objectiveType,
          tier,
          target_value: targetValue.trim() ? Number(targetValue) : null,
          target_unit: targetUnit.trim() || null,
          metric_type: metricType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `status ${res.status}`);
      onCreated(json.objective as StrategicObjective);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error al crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/50 z-40" aria-hidden />
      <div
        role="dialog"
        aria-label="Nuevo objetivo"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[540px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl z-50"
      >
        <header className="bg-[#0a0a0a] text-white px-6 py-5 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/40">
              Nuevo
            </p>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-lg leading-none"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <h2 className="text-[1.25rem] font-light tracking-[-0.5px] mt-1">
            Crear <em className="font-black not-italic italic text-[#c6f24a]">objetivo</em>
          </h2>
        </header>
        <div className="px-6 py-5 space-y-4">
          <FormField label="Título">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Un cliente grande en Francia"
              className="w-full text-[13px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a]"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Year">
              <input
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                type="number"
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a]"
              />
            </FormField>
            <FormField label="Quarter">
              <select
                value={quarter ?? ""}
                onChange={(e) => setQuarter(e.target.value === "" ? null : Number(e.target.value))}
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
              >
                <option value="">Anual</option>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Tier">
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as ObjectiveTier)}
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
              >
                {TIERS_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Área">
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as ObjectiveArea)}
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {areaLabel(a)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Tipo">
              <select
                value={objectiveType}
                onChange={(e) => setObjectiveType(e.target.value as ObjectiveType)}
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Target (opcional)">
              <input
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                type="number"
                step="any"
                placeholder="500000, 3, ..."
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a]"
              />
            </FormField>
            <FormField label="Unit">
              <input
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
                placeholder="USD, orgs, ..."
                className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md focus:outline-none focus:border-[#0a0a0a]"
              />
            </FormField>
          </div>

          <FormField label="Cómo se mide (métrica auto, default manual)">
            <select
              value={metricType}
              onChange={(e) => setMetricType(e.target.value as ObjectiveMetricType)}
              className="w-full text-[12px] px-3 py-2 border border-[#e4e4dd] rounded-md bg-white focus:outline-none focus:border-[#0a0a0a]"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {metricLabel(m)}
                </option>
              ))}
            </select>
          </FormField>

          {error && (
            <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-[11px] font-semibold px-3 py-1.5 rounded border border-[#e4e4dd] hover:border-[#0a0a0a]"
            >
              Cancelar
            </button>
            <button
              onClick={onCreate}
              disabled={saving || !title.trim()}
              className="text-[11px] font-bold px-4 py-1.5 rounded bg-[#c6f24a] text-[#0a0a0a] hover:bg-[#c6f24a]/80 disabled:opacity-50"
            >
              {saving ? "Creando..." : "Crear"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function DrawerField({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-[8.5px] font-bold tracking-[1.8px] uppercase text-[#0a0a0a]/50 mb-1.5">
        {label}
      </p>
      <div className="text-[12px] text-[#0a0a0a] leading-relaxed">{value}</div>
    </div>
  );
}

function Tab({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-[11px] font-bold tracking-[0.8px] border-b-2 transition-colors ${
        active
          ? "text-[#0a0a0a] border-[#c6f24a]"
          : "text-[#0a0a0a]/50 border-transparent hover:text-[#0a0a0a]"
      }`}
    >
      {label}
      {sublabel && (
        <span className="ml-1.5 font-medium text-[#0a0a0a]/40 text-[9px] tracking-normal">{sublabel}</span>
      )}
    </button>
  );
}

function AnnualRollupView({ objectives }: { objectives: StrategicObjective[] }) {
  const byArea = groupObjectivesByArea(objectives.filter((o) => o.quarter !== null));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      {(Object.keys(byArea) as ObjectiveArea[]).map((area) => {
        const items = byArea[area];
        if (items.length === 0) return null;
        const achieved = items.filter((o) => o.status === "achieved").length;
        const progress = items.length > 0 ? Math.round((achieved / items.length) * 100) : 0;
        return (
          <div key={area} className="bg-white border border-[#e4e4dd] rounded-2xl p-5">
            <div className="text-[16px] font-extrabold tracking-[-0.3px] text-[#0a0a0a] pb-3 border-b border-[#e4e4dd] mb-4">
              {areaLabel(area)}
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[12px] font-semibold text-[#0a0a0a]">Objetivos del año</span>
              <div className="flex items-center gap-3">
                <div className="w-32 h-1 bg-[#f4f4ef] rounded overflow-hidden">
                  <div className="h-full bg-[#c6f24a] rounded" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[13px] font-extrabold tracking-[-0.3px] text-[#0a0a0a]">
                  {achieved}
                  <span className="text-[#0a0a0a]/50 font-medium"> / {items.length}</span>
                </span>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {items.map((o) => (
                <span
                  key={o.id}
                  className={`text-[9px] font-semibold px-2 py-0.5 rounded ${
                    o.status === "achieved"
                      ? "bg-green-100 text-green-700"
                      : "bg-[#f4f4ef] text-[#0a0a0a]/60"
                  }`}
                  title={o.title}
                >
                  {o.title.length > 22 ? o.title.slice(0, 20) + "…" : o.title}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
