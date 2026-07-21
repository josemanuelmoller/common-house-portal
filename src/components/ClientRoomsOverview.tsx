import Link from "next/link";
import { getRoomsOverview } from "@/lib/room-analytics";

function fmtDur(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "sin visitas";
  try {
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Cross-room status box for the admin Hall: which client rooms are ready to
 * share and a light analytics roll-up per room. Self-fetching so it can be
 * dropped into the Hall inside a Suspense/error boundary.
 */
export async function ClientRoomsOverview() {
  const rooms = await getRoomsOverview();
  if (rooms.length === 0) return null;

  const ordered = [...rooms].sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    if ((b.lastVisitAt ?? "") !== (a.lastVisitAt ?? "")) return (b.lastVisitAt ?? "") > (a.lastVisitAt ?? "") ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  const readyCount = rooms.filter((r) => r.ready).length;

  return (
    <section className="mb-2">
      <div className="flex items-baseline justify-between gap-3 pb-2 mb-3" style={{ borderBottom: "1px solid var(--hall-ink-0)" }}>
        <h2 className="text-[19px] font-bold leading-none flex items-baseline gap-2" style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}>
          <span>Client</span>
          <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>rooms</em>
        </h2>
        <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}>
          {readyCount}/{rooms.length} LISTOS
        </span>
      </div>

      <div style={{ border: "1px solid var(--hall-line)", borderRadius: 12, overflow: "hidden" }}>
        {ordered.map((r, i) => (
          <Link
            key={r.projectId}
            href={`/admin/projects/${r.projectId}/client-room`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-[var(--hall-fill-soft)] transition-colors"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--hall-line-soft)" }}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
              <span
                className="shrink-0"
                title={r.ready ? "Listo para compartir" : "En preparación"}
                style={{ width: 8, height: 8, borderRadius: 999, background: r.ready ? "var(--hall-lime)" : "var(--hall-muted-3)" }}
              />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{r.org ?? r.name}</p>
                <p className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>
                  {r.ready ? "listo" : !r.enabled ? "room off" : r.grants === 0 ? "sin accesos" : "sin material"}
                  {" · "}/{r.slug}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--hall-ink-3)" }}>
              <span title="visitas de clientes"><b>{r.visits}</b> visitas</span>
              <span title="visitantes únicos"><b>{r.visitors}</b> personas</span>
              <span className="hidden sm:inline" title="tiempo total">{fmtDur(r.totalTimeMs)}</span>
              <span className="hidden md:inline" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted)" }}>{fmtWhen(r.lastVisitAt)}</span>
            </div>
            <span className="text-sm" style={{ color: "var(--hall-muted-3)" }}>→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
