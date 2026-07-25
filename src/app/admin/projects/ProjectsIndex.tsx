"use client";

/**
 * Lista del índice de proyectos, con filtro por nombre client-side sobre la
 * lista ya cargada (sin fetch, sin paginación).
 *
 * Estructura de fila: un `<div>` grid donde cada celda tiene su propio link.
 * La fila entera NO es un link — si lo fuera, los links de Sala y Lobby
 * quedarían anidados dentro de un `<a>`, que es HTML inválido y rompe la
 * hidratación.
 */

import Link from "next/link";
import { useMemo, useState } from "react";

export type ProjectRow = {
  /** Clave que espera `/admin/projects/[id]` (notion_id, uuid como fallback). */
  detailId: string;
  /** uuid de Supabase — clave canónica de `/rooms/[projectId]`. */
  roomId: string;
  name: string;
  status: string | null;
  stage: string | null;
  engagementModel: string | null;
  geography: string | null;
  /** Sólo presente si el proyecto tiene hall_slug Y el lobby está habilitado. */
  lobbySlug: string | null;
  lastActivity: string | null;
};

const STAGE_COLORS: Record<string, string> = {
  "Discovery": "bg-blue-50 text-blue-600 border border-blue-200",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution": "bg-[#0a0a0a] text-[#c6f24a]",
  "Completion": "bg-[#c6f24a] text-[#0a0a0a]",
  "On Hold": "bg-gray-100 text-gray-400 border border-gray-200",
  "Paused": "bg-gray-100 text-gray-400 border border-gray-200",
};

const GROUPS: { key: string; label: string }[] = [
  { key: "Active", label: "Activos" },
  { key: "Proposed", label: "Propuestos" },
  { key: "Not started", label: "Sin arrancar" },
];
const OTHER_LABEL = "Resto";

function groupLabel(status: string | null): string {
  return GROUPS.find((g) => g.key === status)?.label ?? OTHER_LABEL;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return "—";
  }
}

const mono = {
  fontFamily: "var(--font-hall-mono)",
  letterSpacing: "0.06em",
} as const;

export function ProjectsIndex({ rows }: { rows: ProjectRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(needle));
  }, [rows, q]);

  // Agrupado preservando el orden que ya trae el server.
  const groups = useMemo(() => {
    const order = [...GROUPS.map((g) => g.label), OTHER_LABEL];
    const byLabel = new Map<string, ProjectRow[]>();
    for (const r of filtered) {
      const label = groupLabel(r.status);
      const arr = byLabel.get(label) ?? [];
      arr.push(r);
      byLabel.set(label, arr);
    }
    return order
      .filter((label) => (byLabel.get(label)?.length ?? 0) > 0)
      .map((label) => ({ label, items: byLabel.get(label) as ProjectRow[] }));
  }, [filtered]);

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] font-semibold" style={{ color: "var(--hall-ink-0)" }}>
          Todavía no hay proyectos.
        </p>
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
          Cuando exista uno, aparece acá con su Sala y, si tiene lobby publicado, su Lobby.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por nombre…"
          aria-label="Filtrar proyectos por nombre"
          className="w-full max-w-[320px] px-3 py-1.5 text-[12px] outline-none"
          style={{
            background: "var(--hall-paper-1)",
            border: "1px solid var(--hall-line)",
            borderRadius: 8,
            color: "var(--hall-ink-0)",
          }}
        />
        <span className="text-[10px] whitespace-nowrap" style={{ ...mono, color: "var(--hall-muted-2)" }}>
          {filtered.length}/{rows.length}
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-[11px] font-medium" style={{ color: "var(--hall-muted-3)" }}>
          Ningún proyecto coincide con “{q.trim()}”.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.label} className="mb-6">
          <div
            className="flex items-baseline justify-between gap-3 pb-2 mb-1"
            style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
          >
            <h2
              className="text-[13px] font-bold leading-none"
              style={{ letterSpacing: "-0.01em", color: "var(--hall-ink-0)" }}
            >
              {g.label}
            </h2>
            <span className="text-[10px]" style={{ ...mono, color: "var(--hall-muted-2)" }}>
              {g.items.length}
            </span>
          </div>

          <div className="flex flex-col">
            {g.items.map((p) => {
              const meta = [p.engagementModel, p.geography].filter(Boolean).join(" · ");
              return (
                /* Fila = div, no <a>. Cada celda lleva su propio link. */
                <div
                  key={p.roomId}
                  className="grid grid-cols-[minmax(0,1fr)_56px_64px] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_92px_56px_64px] gap-2 md:gap-3 py-2.5 items-center"
                  style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                >
                  {/* Proyecto → detalle */}
                  <Link href={`/admin/projects/${p.detailId}`} className="block min-w-0 hover:opacity-70">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        className="text-[12.5px] font-semibold truncate max-w-full"
                        style={{ color: "var(--hall-ink-0)" }}
                      >
                        {p.name}
                      </span>
                      {/* Mobile: la columna de stage está oculta, se muestra inline */}
                      {p.stage && (
                        <span
                          className={`md:hidden text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${STAGE_COLORS[p.stage] ?? "bg-[#f4f4ef] text-[#0a0a0a]/50"}`}
                        >
                          {p.stage}
                        </span>
                      )}
                    </div>
                    {meta && (
                      <span
                        className="block text-[10px] font-medium truncate mt-0.5"
                        style={{ ...mono, color: "var(--hall-muted-3)", letterSpacing: "normal" }}
                      >
                        {meta}
                      </span>
                    )}
                  </Link>

                  {/* Stage — oculto en mobile */}
                  <div className="min-w-0 hidden md:block">
                    {p.stage ? (
                      <span
                        className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full truncate max-w-full ${STAGE_COLORS[p.stage] ?? "bg-[#f4f4ef] text-[#0a0a0a]/50"}`}
                      >
                        {p.stage}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--hall-muted-3)" }}>
                        —
                      </span>
                    )}
                  </div>

                  {/* Estado + última actividad — oculto en mobile */}
                  <div className="hidden md:block text-right min-w-0">
                    <span
                      className="block text-[9px] font-bold uppercase truncate"
                      style={{ ...mono, color: "var(--hall-muted-2)" }}
                    >
                      {p.status ?? "SIN ESTADO"}
                    </span>
                    <span className="block text-[10px]" style={{ ...mono, color: "var(--hall-muted-3)", letterSpacing: "normal" }}>
                      {fmtDate(p.lastActivity)}
                    </span>
                  </div>

                  {/* Sala — sala de trabajo post-venta */}
                  <Link
                    href={`/rooms/${p.roomId}`}
                    title="Abrir la sala de trabajo"
                    className="text-right text-[9px] font-bold uppercase hover:underline"
                    style={{ ...mono, color: "var(--hall-muted-2)" }}
                  >
                    Sala →
                  </Link>

                  {/* Lobby — sólo si tiene slug y está habilitado */}
                  {p.lobbySlug ? (
                    <Link
                      href={`/lobby/${p.lobbySlug}`}
                      title={`Abrir el lobby de preventa (/${p.lobbySlug})`}
                      className="text-right text-[9px] font-bold uppercase hover:underline"
                      style={{ ...mono, color: "var(--hall-muted-2)" }}
                    >
                      Lobby →
                    </Link>
                  ) : (
                    <span className="text-right text-[9px]" style={{ ...mono, color: "var(--hall-muted-3)" }}>
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
