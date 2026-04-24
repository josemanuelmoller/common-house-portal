import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
import { HallSection } from "@/components/HallSection";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type ProjectRow = {
  notion_id: string;
  name: string | null;
  current_stage: string | null;
  primary_workspace: string | null;
};

type PrepBriefRow = {
  id: string;
  project_notion_id: string;
  generated_at: string;
};

type ProjectCounts = {
  sources_30d: number;
  evidence_30d: number;
  open_q: number;
  stale_q: number;
  last_brief_at: string | null;
};

async function loadProjectsOverview(): Promise<Array<ProjectRow & ProjectCounts>> {
  const sb = getSupabaseServerClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: projects }, { data: sources30 }, { data: evidence }, { data: briefs }] = await Promise.all([
    sb.from("projects").select("notion_id, name, current_stage, primary_workspace")
      .order("name", { ascending: true }),
    sb.from("sources").select("project_notion_id, source_date")
      .gte("source_date", since),
    sb.from("evidence").select("project_notion_id, resolution_status, date_captured")
      .eq("validation_status", "Validated"),
    sb.from("prep_briefs").select("id, project_notion_id, generated_at")
      .order("generated_at", { ascending: false }),
  ]);

  // Index by project
  const sourcesByProject: Record<string, number> = {};
  for (const s of (sources30 ?? []) as { project_notion_id: string | null }[]) {
    if (s.project_notion_id) sourcesByProject[s.project_notion_id] = (sourcesByProject[s.project_notion_id] ?? 0) + 1;
  }

  const evidenceByProject: Record<string, { e30: number; openQ: number; staleQ: number }> = {};
  for (const e of (evidence ?? []) as { project_notion_id: string | null; resolution_status: string | null; date_captured: string | null }[]) {
    const pid = e.project_notion_id;
    if (!pid) continue;
    if (!evidenceByProject[pid]) evidenceByProject[pid] = { e30: 0, openQ: 0, staleQ: 0 };
    if (e.date_captured && e.date_captured >= since) evidenceByProject[pid].e30++;
    if (e.resolution_status === "open") evidenceByProject[pid].openQ++;
    if (e.resolution_status === "stale") evidenceByProject[pid].staleQ++;
  }

  const lastBriefByProject: Record<string, string> = {};
  for (const b of (briefs ?? []) as PrepBriefRow[]) {
    if (!lastBriefByProject[b.project_notion_id]) {
      lastBriefByProject[b.project_notion_id] = b.generated_at;
    }
  }

  return ((projects as ProjectRow[] | null) ?? []).map(p => {
    const ev = evidenceByProject[p.notion_id] ?? { e30: 0, openQ: 0, staleQ: 0 };
    return {
      ...p,
      sources_30d: sourcesByProject[p.notion_id] ?? 0,
      evidence_30d: ev.e30,
      open_q: ev.openQ,
      stale_q: ev.staleQ,
      last_brief_at: lastBriefByProject[p.notion_id] ?? null,
    };
  });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function PrepListPage() {
  await requireAdmin();

  const rows = await loadProjectsOverview();

  const totalOpen  = rows.reduce((n, r) => n + r.open_q, 0);
  const totalStale = rows.reduce((n, r) => n + r.stale_q, 0);
  const activeProjects = rows.filter(r => r.sources_30d > 0 || r.evidence_30d > 0);
  const briefedProjects = rows.filter(r => r.last_brief_at !== null);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 md:ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] uppercase whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PREP · <b style={{ color: "var(--hall-ink-0)" }}>{rows.length} BRIEFS</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Meeting{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                prep
              </em>
              .
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>{activeProjects.length} ACTIVE</span>
            <span style={{ color: totalOpen > 0 ? "var(--hall-warn)" : "var(--hall-muted-3)" }}>{totalOpen} OPEN</span>
            <span style={{ color: totalStale > 0 ? "var(--hall-danger)" : "var(--hall-muted-3)" }}>{totalStale} STALE</span>
          </div>
        </header>

        <div className="px-9 py-6 space-y-7">

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Active projects (30d)" value={activeProjects.length} color="green" />
            <MetricCard label="Open questions"        value={totalOpen}             color={totalOpen > 0 ? "yellow" : "default"} />
            <MetricCard label="Stale questions"       value={totalStale}            color={totalStale > 0 ? "red" : "default"} sub="&gt;14d no answer" />
            <MetricCard label="Briefed"               value={briefedProjects.length} sub="con brief generado" />
          </div>

          {/* Project list */}
          <HallSection
            title="All"
            flourish="projects"
            meta={`${rows.length} TOTAL`}
          >
            <p
              className="mb-3"
              style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
            >
              Projects sorted by recent activity. Open questions highlight relational signal.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Project
                  </th>
                  <th
                    className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Sources 30d
                  </th>
                  <th
                    className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Evidence 30d
                  </th>
                  <th
                    className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Open Q
                  </th>
                  <th
                    className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Stale Q
                  </th>
                  <th
                    className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Last brief
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .sort((a, b) => (b.sources_30d + b.evidence_30d) - (a.sources_30d + a.evidence_30d))
                  .map(p => {
                  const briefAge = daysSince(p.last_brief_at);
                  return (
                    <tr
                      key={p.notion_id}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
                    >
                      <td className="px-3 py-3">
                        <Link href={`/admin/prep/${p.notion_id}`} className="block">
                          <p className="font-semibold text-sm" style={{ color: "var(--hall-ink-0)" }}>{p.name ?? "—"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.current_stage && (
                              <span
                                className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                                style={{
                                  fontFamily: "var(--font-hall-mono)",
                                  background: "var(--hall-fill-soft)",
                                  color: "var(--hall-muted-2)",
                                }}
                              >
                                {p.current_stage}
                              </span>
                            )}
                            {p.primary_workspace && (
                              <span
                                className="text-[9px] font-medium"
                                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                              >
                                {p.primary_workspace}
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className="text-base font-bold tabular-nums"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            color: p.sources_30d > 0 ? "var(--hall-ink-0)" : "var(--hall-muted-3)",
                          }}
                        >
                          {p.sources_30d || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className="text-base font-bold tabular-nums"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            color: p.evidence_30d > 0 ? "var(--hall-ink-0)" : "var(--hall-muted-3)",
                          }}
                        >
                          {p.evidence_30d || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.open_q > 0 ? (
                          <span
                            className="inline-block text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              background: "var(--hall-warn-soft)",
                              color: "var(--hall-warn)",
                            }}
                          >
                            {p.open_q}
                          </span>
                        ) : (
                          <span style={{ color: "var(--hall-muted-3)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.stale_q > 0 ? (
                          <span
                            className="inline-block text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              background: "var(--hall-danger-soft)",
                              color: "var(--hall-danger)",
                            }}
                          >
                            {p.stale_q}
                          </span>
                        ) : (
                          <span style={{ color: "var(--hall-muted-3)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {briefAge === null ? (
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                          >
                            No brief
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              color: briefAge <= 3 ? "var(--hall-ink-0)" : "var(--hall-muted-2)",
                            }}
                          >
                            {briefAge === 0 ? "Today" : `${briefAge}d ago`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </HallSection>

        </div>
      </main>
    </div>
  );
}
