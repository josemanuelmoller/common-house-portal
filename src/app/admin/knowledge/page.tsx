import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricCard } from "@/components/MetricCard";
import { getKnowledgeAssets, getReusableEvidence, getAllProjects, getAllEvidence } from "@/lib/notion";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";

export default async function KnowledgePage() {
  await requireAdmin();

  const [assets, reusable, projects, allEvidence] = await Promise.all([
    getKnowledgeAssets(),
    getReusableEvidence(),
    getAllProjects(),
    getAllEvidence(),
  ]);

  // Build project name lookup
  const projectNames: Record<string, string> = {};
  for (const p of projects) projectNames[p.id] = p.name;

  // Evidence per project (for breakdown table)
  const evidenceByProject: Record<string, {
    name: string;
    total: number;
    validated: number;
    reusable: number;
    types: Record<string, number>;
  }> = {};

  for (const p of projects) {
    evidenceByProject[p.id] = { name: p.name, total: 0, validated: 0, reusable: 0, types: {} };
  }

  for (const e of allEvidence) {
    const pid = e.projectId ?? "";
    if (!evidenceByProject[pid]) continue;
    evidenceByProject[pid].total++;
    if (e.validationStatus === "Validated") evidenceByProject[pid].validated++;
    if ((e.reusability === "Reusable" || e.reusability === "Canonical") && e.validationStatus === "Validated") evidenceByProject[pid].reusable++;
    const t = e.type || "Other";
    evidenceByProject[pid].types[t] = (evidenceByProject[pid].types[t] ?? 0) + 1;
  }

  const canonicalEvidence     = reusable.filter(e => e.reusability === "Canonical");
  const trueReusableEvidence  = reusable.filter(e => e.reusability === "Reusable");

  const topTypes = ["Decision", "Outcome", "Requirement", "Process Step", "Blocker", "Dependency"];

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold text-[#B2FF59] bg-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest inline-block mb-3">
                Knowledge
              </p>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">Knowledge Assets</h1>
              <p className="text-sm text-[#131218]/40 mt-1">Canonical assets, reusable evidence, and cross-project intelligence</p>
            </div>
            <p className="text-xs text-[#131218]/30 font-medium pb-1">
              {assets.length} asset{assets.length !== 1 ? "s" : ""} · {canonicalEvidence.length} canonical · {trueReusableEvidence.length} reusable
            </p>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Knowledge Assets"  value={assets.length}                   color="green" />
            <MetricCard label="Canonical"          value={canonicalEvidence.length}        color="blue"  sub="highest reusability tier" />
            <MetricCard label="Reusable"           value={trueReusableEvidence.length}     color="green" sub="cross-project evidence" />
            <MetricCard label="Total Evidence"     value={allEvidence.length}              />
          </div>

          {/* Knowledge Assets — primary view */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#131218]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Knowledge Assets</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">Canonical assets maintained and updated by the OS engine</p>
              </div>
              <p className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest">{assets.length} asset{assets.length !== 1 ? "s" : ""}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Asset</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Category</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {assets.map(a => (
                  <tr key={a.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                    <td className="px-6 py-3 font-semibold text-[#131218] text-sm">{a.name}</td>
                    <td className="px-4 py-3"><StatusBadge value={a.category} /></td>
                    <td className="px-4 py-3"><StatusBadge value={a.assetType} /></td>
                    <td className="px-4 py-3"><StatusBadge value={a.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#131218]/35 font-medium">
                      {a.lastUpdated
                        ? new Date(a.lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
                      <p className="text-sm font-medium text-[#131218]/30">No knowledge assets yet</p>
                      <p className="text-xs text-[#131218]/20 mt-1">Assets are built from validated, reusable evidence</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-6 py-3 border-t border-[#EFEFEA]">
              <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">COUNT {assets.length}</p>
            </div>
          </div>

          {/* Reusable Evidence */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Reusable Evidence</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">Validated evidence flagged as reusable across projects</p>
              </div>
              <div className="flex items-center gap-2">
                {canonicalEvidence.length > 0 && (
                  <span className="inline-block bg-[#131218] text-[#B2FF59] text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest">
                    {canonicalEvidence.length} canonical
                  </span>
                )}
                {trueReusableEvidence.length > 0 && (
                  <span className="inline-block bg-[#B2FF59] text-[#131218] text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest">
                    {trueReusableEvidence.length} reusable
                  </span>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Evidence</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Tier</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Confidence</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {reusable.map(e => (
                  <tr key={e.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-[#131218] text-sm">{e.title}</p>
                      {e.excerpt && <p className="text-xs text-[#131218]/35 mt-0.5 line-clamp-1 max-w-sm">{e.excerpt}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#131218]/50">
                      {e.projectId ? (projectNames[e.projectId] ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={e.type} /></td>
                    <td className="px-4 py-3"><StatusBadge value={e.reusability} /></td>
                    <td className="px-4 py-3"><StatusBadge value={e.confidence} /></td>
                    <td className="px-4 py-3 text-xs text-[#131218]/35 font-medium">
                      {e.dateCaptured
                        ? new Date(e.dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {reusable.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <p className="text-sm font-medium text-[#131218]/30">No reusable evidence validated yet</p>
                      <p className="text-xs text-[#131218]/20 mt-1">Evidence marked Reusable or Canonical will appear here after validation</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-6 py-3 border-t border-[#EFEFEA]">
              <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                COUNT {reusable.length} · {canonicalEvidence.length} canonical · {trueReusableEvidence.length} reusable
              </p>
            </div>
          </div>

          {/* Evidence breakdown per project — detail view */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#EFEFEA]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">Evidence Contribution — by Project</h2>
              <p className="text-xs text-[#131218]/40 mt-0.5">How much evidence each project has generated and how much is reusable</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#EFEFEA]">
                    <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Evidence</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Validated</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Reusable</th>
                    {topTypes.map(t => (
                      <th key={t} className="text-center px-3 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest whitespace-nowrap">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEA]">
                  {projects.map(p => {
                    const stats = evidenceByProject[p.id];
                    if (!stats) return null;
                    return (
                      <tr key={p.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#131218] tracking-tight">{p.name}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <StatusBadge value={p.stage} />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="text-base font-bold text-[#131218]">{stats.total || "—"}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-base font-bold ${stats.validated > 0 ? "text-[#131218]" : "text-[#131218]/20"}`}>
                            {stats.validated || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {stats.reusable > 0 ? (
                            <span className="inline-block bg-[#B2FF59] text-[#131218] text-xs font-bold px-2 py-0.5 rounded-full">
                              {stats.reusable}
                            </span>
                          ) : (
                            <span className="text-[#131218]/15 text-sm">—</span>
                          )}
                        </td>
                        {topTypes.map(t => (
                          <td key={t} className="px-3 py-4 text-center text-sm">
                            {stats.types[t] ? (
                              <span className="font-semibold text-[#131218]/60">{stats.types[t]}</span>
                            ) : (
                              <span className="text-[#131218]/15">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {projects.length === 0 && (
                    <tr>
                      <td colSpan={4 + topTypes.length} className="px-6 py-8 text-center text-sm text-[#131218]/30">
                        No projects found.
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="border-t-2 border-[#EFEFEA] bg-[#EFEFEA]/50">
                    <td className="px-6 py-3 text-[10px] font-bold text-[#131218]/40 uppercase tracking-widest">Total</td>
                    <td className="px-4 py-3 text-center font-bold text-[#131218]">{allEvidence.length}</td>
                    <td className="px-4 py-3 text-center font-bold text-[#131218]">
                      {allEvidence.filter(e => e.validationStatus === "Validated").length}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-[#B2FF59] text-[#131218] text-xs font-bold px-2 py-0.5 rounded-full">
                        {reusable.length}
                      </span>
                    </td>
                    {topTypes.map(t => {
                      const count = allEvidence.filter(e => e.type === t).length;
                      return (
                        <td key={t} className="px-3 py-3 text-center text-sm font-bold text-[#131218]/40">
                          {count || "—"}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
