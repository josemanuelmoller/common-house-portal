import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 ml-[228px] overflow-auto">
        {/* Header */}
        <div className="bg-[#131218] px-10 py-10">
          <p className="text-[8px] font-bold uppercase tracking-[2.5px] text-white/20 mb-3">
            CONTROL ROOM · PREP BRIEFS
          </p>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px]">
            Project <em className="font-[900] italic text-[#c8f55a]">prep briefs</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[560px] leading-[1.65]">
            Estrategia pre-conversación generada desde evidencia reciente, preguntas abiertas, y commitments vivos. Click en un proyecto para abrir o regenerar.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Active projects (30d)" value={activeProjects.length} color="green" />
            <MetricCard label="Open questions"        value={totalOpen}             color={totalOpen > 0 ? "yellow" : "default"} />
            <MetricCard label="Stale questions"       value={totalStale}            color={totalStale > 0 ? "red" : "default"} sub="&gt;14d no answer" />
            <MetricCard label="Briefed"               value={briefedProjects.length} sub="con brief generado" />
          </div>

          {/* Project list */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">All projects</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">
                  Projects sorted by recent activity. Open questions highlight relational signal.
                </p>
              </div>
              <p className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest">{rows.length} total</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project</th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Sources 30d</th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Evidence 30d</th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Open Q</th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Stale Q</th>
                  <th className="text-center px-3 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Last brief</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {rows
                  .sort((a, b) => (b.sources_30d + b.evidence_30d) - (a.sources_30d + a.evidence_30d))
                  .map(p => {
                  const briefAge = daysSince(p.last_brief_at);
                  return (
                    <tr key={p.notion_id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                      <td className="px-6 py-3">
                        <Link href={`/admin/prep/${p.notion_id}`} className="block">
                          <p className="font-semibold text-[#131218] text-sm">{p.name ?? "—"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.current_stage && (
                              <span className="text-[9px] font-bold bg-[#EFEFEA] text-[#131218]/50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                {p.current_stage}
                              </span>
                            )}
                            {p.primary_workspace && (
                              <span className="text-[9px] text-[#131218]/30 font-medium">{p.primary_workspace}</span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-base font-bold ${p.sources_30d > 0 ? "text-[#131218]" : "text-[#131218]/20"}`}>
                          {p.sources_30d || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-base font-bold ${p.evidence_30d > 0 ? "text-[#131218]" : "text-[#131218]/20"}`}>
                          {p.evidence_30d || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.open_q > 0 ? (
                          <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                            {p.open_q}
                          </span>
                        ) : (
                          <span className="text-[#131218]/15">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.stale_q > 0 ? (
                          <span className="inline-block bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                            {p.stale_q}
                          </span>
                        ) : (
                          <span className="text-[#131218]/15">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {briefAge === null ? (
                          <span className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">No brief</span>
                        ) : (
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${briefAge <= 3 ? "text-[#131218]" : "text-[#131218]/40"}`}>
                            {briefAge === 0 ? "Today" : `${briefAge}d ago`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  );
}
