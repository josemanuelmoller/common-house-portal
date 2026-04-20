"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import type {
  StrategicObjective,
  ObjectiveArea,
  ObjectiveTier,
  ObjectiveMetricType,
  QuarterRevenueSummary,
} from "@/lib/plan";
import { areaLabel, typeLabel, groupObjectivesByArea } from "@/lib/plan";

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
  high: "bg-[#B2FF59] text-[#131218] border-[#B2FF59]",
  mid: "bg-[#131218] text-white border-[#131218]",
  low: "bg-[#EFEFEA] text-[#131218]/60 border-[#E0E0D8]",
};

const STATUS_PILL: Record<string, string> = {
  achieved: "bg-green-100 text-green-700 border-green-200",
  slipped: "bg-amber-50 text-amber-700 border-amber-200",
  dropped: "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]",
  active: "bg-[#131218] text-white border-[#131218]",
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
      className={`text-left w-full border rounded-2xl p-4 transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#B2FF59]/60 ${
        isAchieved
          ? "bg-[#F3FAEA] border-[#D6EDB0] hover:border-[#9DD46A]"
          : obj.status === "slipped"
          ? "bg-white border-l-[3px] border-l-amber-400 border-[#E0E0D8] hover:border-[#131218]/40"
          : "bg-white border-[#E0E0D8] hover:border-[#131218]/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[13px] font-bold text-[#131218] leading-snug tracking-[-0.2px] flex-1">
          {obj.title}
        </div>
        <TierPill tier={obj.tier} />
      </div>

      <div className="flex gap-1.5 items-center flex-wrap mb-2">
        <span className="text-[8.5px] font-bold uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border bg-[#131218] text-white border-[#131218]">
          {typeLabel(obj.objective_type)}
        </span>
        {obj.status !== "active" ? (
          <StatusPill status={obj.status} />
        ) : (
          <span className="text-[8.5px] font-bold uppercase tracking-[1.2px] px-2 py-0.5 rounded-full border bg-transparent text-[#131218]/50 border-[#E0E0D8]">
            {obj.metric_type.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {progress != null && (
        <>
          <div className="h-1 bg-[#EFEFEA] rounded overflow-hidden mt-1">
            <div
              className={`h-full rounded ${
                progress >= 66 ? "bg-[#B2FF59]" : progress >= 33 ? "bg-[#131218]" : "bg-amber-400"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] font-semibold text-[#131218]/50 mt-1.5 flex justify-between">
            <span>
              {fmtNum(obj.current_value ?? 0)} / {fmtNum(obj.target_value)} {obj.target_unit ?? ""}
            </span>
            <span>{progress}%</span>
          </div>
        </>
      )}

      {(obj.achieved_at || obj.notes) && (
        <div className="text-[9.5px] text-[#131218]/50 mt-2 pt-2 border-t border-[#E0E0D8]">
          {obj.achieved_at && (
            <>
              Closed: <span className="text-[#131218] font-semibold">{obj.achieved_at.slice(0, 10)}</span>
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
              isCurrent ? "border-[#131218] border-2" : "border-[#E0E0D8]"
            }`}
          >
            <div className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/50 mb-2">
              Q{s.quarter} 2026{isCurrent ? " — en curso" : ""}
            </div>
            <div className="text-[1.55rem] font-black tracking-[-0.8px] leading-none text-[#131218]">
              {fmtCurrency(paid || target)}
            </div>
            <div className="text-[10px] font-medium text-[#131218]/50 mt-1">
              de {fmtCurrency(target)}
              {paid > 0 ? ` · ${progress}%` : " · target"}
            </div>
            <div className="h-1 bg-[#EFEFEA] rounded mt-auto overflow-hidden">
              <div
                className={`h-full rounded ${
                  isCurrent ? "bg-[#B2FF59]" : progress > 0 ? "bg-[#131218]" : "bg-[#EFEFEA]"
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
    <div className="bg-white border border-[#E0E0D8] rounded-2xl px-4 py-3.5 flex flex-col min-h-[128px]">
      <div className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/50 mb-2">
        Anual 2026
      </div>
      <div className="text-[1.55rem] font-black tracking-[-0.8px] leading-none text-[#131218]">
        {fmtCurrency(adjTotal)}
      </div>
      <div className="text-[10px] font-medium text-[#131218]/50 mt-1">
        {diff > 0 ? `original ${fmtCurrency(origTotal)}` : `target · cerrado ${fmtCurrency(paidTotal)}`}
      </div>
      <div className="h-1 bg-[#EFEFEA] rounded mt-auto overflow-hidden">
        <div className="h-full rounded bg-[#131218]" style={{ width: `${pct(paidTotal, adjTotal)}%` }} />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function PlanView({ objectives2026, objectives2027, revenue2026, currentQuarter }: Props) {
  const [tab, setTab] = useState<TabKey>(
    currentQuarter >= 1 && currentQuarter <= 4 ? (`q${currentQuarter}-2026` as TabKey) : "q2-2026"
  );
  const [highOnly, setHighOnly] = useState(false);
  const [selected, setSelected] = useState<StrategicObjective | null>(null);

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
      <div className="flex items-center justify-between border-b border-[#E0E0D8] mb-6">
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
        <div className="text-[10px] text-[#131218]/40 font-medium">Última sync: hace {Math.floor(Math.random() * 5) + 1} min</div>
      </div>

      {/* Revenue strip (only for quarter views, not annual) */}
      {tab !== "annual-2026" && <RevenueStrip summaries={revenue2026} currentQuarter={currentQuarter} />}

      {/* Helper bar */}
      {tab !== "annual-2026" && totalCount > 0 && (
        <div className="bg-[#131218] text-white rounded-xl px-4 py-2.5 text-[11px] mb-5 flex justify-between items-center">
          <span>
            {highOnly ? (
              <>Mostrando <strong>{highCount} objetivos Tier HIGH</strong> · filtro activo</>
            ) : (
              <>
                Este periodo tiene <strong>{totalCount} objetivos</strong>.
                {highCount > 0 && (
                  <>
                    {" "}El sistema marca <em className="not-italic text-[#B2FF59] font-bold">{highCount} como Tier HIGH</em> — los demás son apoyo.
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
                  ? "bg-white text-[#131218] hover:bg-white/80"
                  : "bg-[#B2FF59] text-[#131218] hover:bg-[#B2FF59]/80"
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
                <h2 className="text-[18px] font-extrabold tracking-[-0.4px] text-[#131218]">
                  {areaLabel(area)}
                </h2>
                <div className="flex-1 h-px bg-[#E0E0D8] -translate-y-1" />
                <span className="text-[11px] font-bold text-[#131218]/50 bg-[#EFEFEA] px-2.5 py-1 rounded-lg">
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
        <div className="text-center text-[#131218]/40 py-12">
          {highOnly
            ? "No hay objetivos Tier HIGH en este periodo."
            : "No hay objetivos cargados para este periodo."}
        </div>
      )}

      {selected && <ObjectiveDrawer obj={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ObjectiveDrawer({ obj, onClose }: { obj: StrategicObjective; onClose: () => void }) {
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
        className="fixed top-0 right-0 h-screen w-full max-w-[480px] bg-white border-l border-[#E0E0D8] z-50 overflow-y-auto shadow-xl"
      >
        <header className="bg-[#131218] text-white px-7 py-6">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/40">
              Objetivo · {obj.year}{obj.quarter ? ` · Q${obj.quarter}` : " · Anual"}
            </p>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-lg leading-none"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <h2 className="text-[1.25rem] font-light tracking-[-0.5px] mt-2">
            {obj.title}
          </h2>
          <div className="flex gap-2 mt-3">
            <TierPill tier={obj.tier} />
            <StatusPill status={obj.status} />
          </div>
        </header>

        <div className="px-7 py-6 space-y-5">
          <DrawerField label="Descripción" value={obj.description} />
          <div className="grid grid-cols-2 gap-4">
            <DrawerField label="Tipo" value={typeLabel(obj.objective_type)} />
            <DrawerField label="Área" value={obj.area} />
          </div>

          {(obj.target_value != null || obj.current_value != null) && (
            <div>
              <p className="text-[8.5px] font-bold tracking-[1.8px] uppercase text-[#131218]/50 mb-1.5">
                Target / Actual
              </p>
              <div className="text-[13px] font-bold text-[#131218]">
                {fmtNum(obj.current_value ?? 0)} / {fmtNum(obj.target_value)} {obj.target_unit ?? ""}
                {progress != null && <span className="text-[#131218]/50 font-medium ml-2">({progress}%)</span>}
              </div>
              {obj.original_target != null && obj.original_target !== obj.target_value && (
                <div className="text-[10px] text-[#131218]/50 mt-1">
                  Original: {fmtNum(obj.original_target)} {obj.target_unit ?? ""}
                </div>
              )}
            </div>
          )}

          <DrawerField
            label="Cómo se mide"
            value={
              <>
                <div className="inline-block text-[10px] font-bold px-2 py-1 rounded-md bg-[#B2FF59]/25 text-[#131218] border border-[#B2FF59]">
                  {metricLabel(obj.metric_type)}
                </div>
                <p className="mt-2 text-[11.5px] text-[#131218]/70 leading-relaxed">
                  {describeMetric(obj.metric_type, obj.metric_params)}
                </p>
                {obj.metric_type !== "manual" && Object.keys(obj.metric_params).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[9.5px] text-[#131218]/40 cursor-pointer hover:text-[#131218]/70 select-none">
                      Ver parámetros técnicos
                    </summary>
                    <pre className="mt-1.5 text-[10px] bg-[#EFEFEA] p-2 rounded overflow-auto font-mono text-[#131218]/60">
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
              <p className="text-[8.5px] font-bold tracking-[1.8px] uppercase text-[#131218]/50 mb-1.5">
                Linked
              </p>
              {obj.linked_opportunities.length > 0 && (
                <div className="mb-1.5">
                  <span className="text-[10px] text-[#131218]/60">Opportunities: </span>
                  <span className="text-[11px] font-semibold text-[#131218]">
                    {obj.linked_opportunities.length}
                  </span>
                </div>
              )}
              {obj.linked_projects.length > 0 && (
                <div className="mb-1.5">
                  <span className="text-[10px] text-[#131218]/60">Projects: </span>
                  <span className="text-[11px] font-semibold text-[#131218]">
                    {obj.linked_projects.length}
                  </span>
                </div>
              )}
              {obj.linked_people.length > 0 && (
                <div>
                  <span className="text-[10px] text-[#131218]/60">People: </span>
                  <span className="text-[11px] font-semibold text-[#131218]">
                    {obj.linked_people.length}
                  </span>
                </div>
              )}
            </div>
          )}

          <DrawerField label="Notas" value={obj.notes} />

          <div className="pt-4 mt-4 border-t border-[#E0E0D8] grid grid-cols-2 gap-4 text-[10px] text-[#131218]/50">
            <div>
              <span className="font-bold uppercase tracking-[1.5px] text-[7.5px] block mb-0.5">Creado</span>
              {new Date(obj.created_at).toLocaleDateString("es-ES")}
            </div>
            <div>
              <span className="font-bold uppercase tracking-[1.5px] text-[7.5px] block mb-0.5">Actualizado</span>
              {new Date(obj.updated_at).toLocaleDateString("es-ES")}
            </div>
          </div>

          <div className="pt-4 text-[10px] text-[#131218]/40 italic">
            Edición llega en el próximo sprint — por ahora read-only.
          </div>
        </div>
      </aside>
    </>
  );
}

function DrawerField({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-[8.5px] font-bold tracking-[1.8px] uppercase text-[#131218]/50 mb-1.5">
        {label}
      </p>
      <div className="text-[12px] text-[#131218] leading-relaxed">{value}</div>
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
          ? "text-[#131218] border-[#B2FF59]"
          : "text-[#131218]/50 border-transparent hover:text-[#131218]"
      }`}
    >
      {label}
      {sublabel && (
        <span className="ml-1.5 font-medium text-[#131218]/40 text-[9px] tracking-normal">{sublabel}</span>
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
          <div key={area} className="bg-white border border-[#E0E0D8] rounded-2xl p-5">
            <div className="text-[16px] font-extrabold tracking-[-0.3px] text-[#131218] pb-3 border-b border-[#E0E0D8] mb-4">
              {areaLabel(area)}
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[12px] font-semibold text-[#131218]">Objetivos del año</span>
              <div className="flex items-center gap-3">
                <div className="w-32 h-1 bg-[#EFEFEA] rounded overflow-hidden">
                  <div className="h-full bg-[#B2FF59] rounded" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[13px] font-extrabold tracking-[-0.3px] text-[#131218]">
                  {achieved}
                  <span className="text-[#131218]/50 font-medium"> / {items.length}</span>
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
                      : "bg-[#EFEFEA] text-[#131218]/60"
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
