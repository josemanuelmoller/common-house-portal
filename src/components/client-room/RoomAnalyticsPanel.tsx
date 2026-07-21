import type { RoomAnalytics } from "@/lib/room-analytics";

function fmtDur(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const labelStyle = { fontFamily: "var(--font-hall-mono)", fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "var(--hall-muted-2)" };

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3" style={{ border: "1px solid var(--hall-line)", borderRadius: 10, borderTop: "3px solid var(--hall-lime)" }}>
      <p style={labelStyle}>{label}</p>
      <p className="text-[20px] font-bold mt-1 leading-none">{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: "var(--hall-muted)" }}>{sub}</p>}
    </div>
  );
}

/**
 * Read-only room analytics dashboard. Identified: every visit is attributed to
 * the client's email + role. Admin previews are excluded from the numbers.
 */
export function RoomAnalyticsPanel({ data }: { data: RoomAnalytics }) {
  if (data.totalVisits === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>
        Sin visitas de clientes todavía. Cuando entren al room aparecerá aquí quién entró, cuánto tiempo estuvo y qué miró.
        {data.adminPreviews > 0 && ` (${data.adminPreviews} preview${data.adminPreviews === 1 ? "" : "s"} de admin, no contadas.)`}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="Visitas" value={String(data.totalVisits)} />
        <Metric label="Visitantes" value={String(data.uniqueVisitors)} />
        <Metric label="Tiempo total" value={fmtDur(data.totalTimeMs)} />
        <Metric label="Última visita" value={data.lastVisitAt ? fmtWhen(data.lastVisitAt) : "—"} />
      </div>
      {data.adminPreviews > 0 && (
        <p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
          {data.adminPreviews} preview{data.adminPreviews === 1 ? "" : "s"} de admin excluida{data.adminPreviews === 1 ? "" : "s"} de estos números.
        </p>
      )}

      {/* Per visitor */}
      <div>
        <p style={labelStyle} className="mb-2">Por visitante</p>
        <div style={{ border: "1px solid var(--hall-line)", borderRadius: 10, overflow: "hidden" }}>
          {data.visitors.map((v, i) => (
            <div key={v.email} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--hall-line-soft)" }}>
              <div className="flex-1 min-w-[200px]">
                <p className="text-[12.5px] font-semibold">{v.email}</p>
                <p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{v.role ?? "—"} · última vez {fmtWhen(v.lastSeen)}</p>
              </div>
              <div className="text-[11px] text-right" style={{ color: "var(--hall-ink-3)" }}>
                <span className="font-semibold">{v.visits}</span> visita{v.visits === 1 ? "" : "s"} · <span className="font-semibold">{fmtDur(v.totalMs)}</span> · {v.sectionsViewed} secc. · {v.docsOpened} doc{v.docsOpened === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top sections */}
        <div>
          <p style={labelStyle} className="mb-2">Secciones más vistas</p>
          {data.topSections.length === 0 ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>—</p> : (
            <div className="space-y-1.5">
              {data.topSections.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 text-[12px]"><span>{s.label}</span><span style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{s.views}</span></div>
              ))}
            </div>
          )}
        </div>
        {/* Top docs */}
        <div>
          <p style={labelStyle} className="mb-2">Documentos más abiertos</p>
          {data.topDocs.length === 0 ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>Ninguno abierto aún.</p> : (
            <div className="space-y-1.5">
              {data.topDocs.map((d) => (
                <div key={d.target} className="flex items-center justify-between gap-3 text-[12px]"><span className="truncate">{d.target.replace(/^(doc|version|admin-doc):/, "")}</span><span style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{d.opens}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent sessions */}
      <div>
        <p style={labelStyle} className="mb-2">Visitas recientes</p>
        <div style={{ border: "1px solid var(--hall-line)", borderRadius: 10, overflow: "hidden" }}>
          {data.recentSessions.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--hall-line-soft)" }}>
              <span className="text-[11px] flex-1 min-w-[180px] font-medium">{s.email}</span>
              <span className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{fmtWhen(s.startedAt)}</span>
              <span className="text-[11px]" style={{ color: "var(--hall-ink-3)" }}>{fmtDur(s.durationMs)} · {s.sectionsViewed} secc. · {s.docsOpened} doc{s.docsOpened === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
