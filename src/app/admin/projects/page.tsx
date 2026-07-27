/**
 * /admin/projects — índice del portafolio.
 *
 * Existía `/admin/projects/[id]` (detalle) pero no el índice, así que los
 * fallbacks de las rutas hijas tenían que caer en `/admin`. Esta página es ese
 * índice: todos los proyectos, no sólo los activos.
 *
 * Nomenclatura: **Sala** = sala de trabajo post-venta (`/rooms/[projectId]`),
 * **Lobby** = superficie de preventa (`/lobby/[slug]`). Un proyecto andando
 * tiene Sala; el lobby sólo aparece si el proyecto tiene `hall_slug` y
 * `client_room_enabled`.
 *
 * Datos: Supabase `projects` vía `supabaseAdmin()`. El detalle
 * (`/admin/projects/[id]`) está keyed por `notion_id` — ver `getProjectById` en
 * `src/lib/notion/projects.ts` — mientras que `/rooms/[projectId]` resuelve uuid
 * o notion_id (`resolveClientRoomProject`). Cada link usa la clave que su ruta
 * espera.
 */

import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV as NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { ProjectsIndex, type ProjectRow } from "./ProjectsIndex";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  notion_id: string | null;
  name: string | null;
  hall_slug: string | null;
  project_status: string | null;
  current_stage: string | null;
  client_room_enabled: boolean | null;
  engagement_model: string | null;
  geography: string | null;
  last_status_update: string | null;
  last_meeting_date: string | null;
};

/** Orden de los grupos: lo que está andando primero, el resto después. */
const STATUS_RANK: Record<string, number> = {
  "Active": 0,
  "Proposed": 1,
  "Not started": 2,
};
const RANK_FALLBACK = 3;

function rankOf(status: string | null): number {
  return STATUS_RANK[status ?? ""] ?? RANK_FALLBACK;
}

function lastActivity(r: Row): string | null {
  return [r.last_status_update, r.last_meeting_date].filter(Boolean).sort().pop() ?? null;
}

export default async function ProjectsIndexPage() {
  await requireAdmin();

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("projects")
    .select(
      "id, notion_id, name, hall_slug, project_status, current_stage, client_room_enabled, engagement_model, geography, last_status_update, last_meeting_date",
    );

  const rows = (error ? [] : ((data ?? []) as Row[]))
    .slice()
    .sort((a, b) => {
      const ra = rankOf(a.project_status);
      const rb = rankOf(b.project_status);
      if (ra !== rb) return ra - rb;
      const da = lastActivity(a) ?? "";
      const dbb = lastActivity(b) ?? "";
      if (da !== dbb) return da < dbb ? 1 : -1; // actividad reciente primero
      return (a.name ?? "").localeCompare(b.name ?? "");
    })
    .map<ProjectRow>((r) => ({
      // El detalle está keyed por notion_id; el uuid sólo es fallback.
      detailId: r.notion_id ?? r.id,
      roomId: r.id,
      name: (r.name ?? "").trim() || "(sin nombre)",
      status: r.project_status,
      stage: r.current_stage,
      engagementModel: r.engagement_model,
      geography: r.geography,
      lobbySlug: r.hall_slug && r.client_room_enabled ? r.hall_slug : null,
      lastActivity: lastActivity(r),
    }));

  const activeCount = rows.filter((r) => r.status === "Active").length;
  const loadFailed = Boolean(error);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 md:ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 collapsed header — mismo patrón que /admin/projects/[id] */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] uppercase whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PORTFOLIO · <b style={{ color: "var(--hall-ink-0)" }}>{rows.length}</b>
            </span>
            <h1 className="text-[16px] font-medium tracking-[-0.01em] truncate" style={{ color: "var(--hall-ink-0)" }}>
              Projects
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              color: "var(--hall-muted-2)",
              letterSpacing: "0.06em",
            }}
          >
            <span>{activeCount} ACTIVE</span>
          </div>
        </header>

        <div className="px-8 py-6">
          {loadFailed ? (
            <p className="py-16 text-center text-[11px] font-medium" style={{ color: "var(--hall-muted-2)" }}>
              No se pudo leer el portafolio desde Supabase. Reintenta o revisa <code>System Health</code>.
            </p>
          ) : (
            <ProjectsIndex rows={rows} />
          )}
        </div>
      </main>
    </div>
  );
}
