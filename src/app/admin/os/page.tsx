import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricCard } from "@/components/MetricCard";
import { EvidenceQueueRow } from "@/components/EvidenceQueueRow";
import { getAllEvidence, getAllSources, getAllProjects } from "@/lib/notion";
import { isAdminUser } from "@/lib/clients";
import { NAV } from "../page";

export default async function OSPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAdminUser(userId)) redirect("/dashboard");

  const [allEvidence, sources, projects] = await Promise.all([
    getAllEvidence(),
    getAllSources(),
    getAllProjects(),
  ]);

  // Build project name lookup
  const projectNames: Record<string, string> = {};
  for (const p of projects) projectNames[p.id] = p.name;

  const pendingEvidence  = allEvidence.filter(e => e.validationStatus === "New");
  const reviewEvidence   = allEvidence.filter(e => e.validationStatus === "Auto-Review" || e.validationStatus === "Reviewed");
  const validatedEvidence = allEvidence.filter(e => e.validationStatus === "Validated");
  const blockers         = allEvidence.filter(e => e.type === "Blocker" && e.validationStatus === "Validated");

  const validationRate = allEvidence.length > 0
    ? Math.round((validatedEvidence.length / allEvidence.length) * 100)
    : 0;

  // Evidence per project
  const evidenceByProject: Record<string, { total: number; validated: number; pending: number }> = {};
  for (const e of allEvidence) {
    const pid = e.projectId ?? "unknown";
    if (!evidenceByProject[pid]) evidenceByProject[pid] = { total: 0, validated: 0, pending: 0 };
    evidenceByProject[pid].total++;
    if (e.validationStatus === "Validated") evidenceByProject[pid].validated++;
    if (e.validationStatus === "New") evidenceByProject[pid].pending++;
  }

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold text-[#B2FF59] bg-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest inline-block mb-3">
                Operations
              </p>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">Operation System</h1>
              <p className="text-sm text-[#131218]/40 mt-1">Pipeline de procesamiento · Sources → Evidence → Validation</p>
            </div>
            <p className="text-xs text-[#131218]/30 font-medium pb-1">
              {allEvidence.length} total evidence records
            </p>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Pipeline metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Sources"    value={sources.length}           />
            <MetricCard label="Evidence"   value={allEvidence.length}       />
            <MetricCard label="Validated"  value={validatedEvidence.length} color="green" />
            <MetricCard label="Pending"    value={pendingEvidence.length}   color={pendingEvidence.length > 0 ? "yellow" : "default"} />
            <MetricCard label="Blockers"   value={blockers.length}          color={blockers.length > 0 ? "red" : "default"} />
            <MetricCard label="Val. Rate"  value={`${validationRate}%`}     color="green" />
          </div>

          {/* Evidence per project breakdown */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">Evidence by Project</h2>
              <p className="text-xs text-[#131218]/40 mt-0.5">Cuánta evidence se ha procesado y validado por proyecto</p>
            </div>
            <div className="divide-y divide-[#EFEFEA]">
              {projects.map(p => {
                const stats = evidenceByProject[p.id] ?? { total: 0, validated: 0, pending: 0 };
                const rate  = stats.total > 0 ? Math.round((stats.validated / stats.total) * 100) : 0;
                return (
                  <div key={p.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#131218] text-sm tracking-tight truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge value={p.stage} />
                        {p.geography.map(g => (
                          <span key={g} className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">{g}</span>
                        ))}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-32 shrink-0">
                      <div className="flex justify-between text-[9px] font-bold text-[#131218]/40 uppercase tracking-widest mb-1">
                        <span>{stats.validated} validated</span>
                        <span>{rate}%</span>
                      </div>
                      <div className="h-1.5 bg-[#EFEFEA] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#B2FF59] rounded-full transition-all"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="flex gap-4 shrink-0">
                      <div className="text-center">
                        <p className="text-lg font-bold text-[#131218]">{stats.total}</p>
                        <p className="text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest">Total</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-lg font-bold ${stats.pending > 0 ? "text-amber-500" : "text-[#131218]/20"}`}>
                          {stats.pending}
                        </p>
                        <p className="text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest">Pending</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active blockers */}
          {blockers.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="h-1 bg-red-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Active Blockers</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">Blockers validados que requieren atención</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#EFEFEA]">
                    <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Blocker</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Confidence</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Captured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEA]">
                  {blockers.map(e => (
                    <tr key={e.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                      <td className="px-6 py-3">
                        <p className="font-semibold text-[#131218] text-sm">{e.title}</p>
                        {e.excerpt && <p className="text-xs text-[#131218]/35 mt-0.5 line-clamp-1 max-w-sm">{e.excerpt}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-[#131218]/50">
                        {e.projectId ? (projectNames[e.projectId] ?? "—") : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={e.confidence} /></td>
                      <td className="px-4 py-3 text-xs text-[#131218]/35 font-medium">
                        {e.dateCaptured
                          ? new Date(e.dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Evidence Queue */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-amber-400" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Evidence Queue</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Items pendientes de validación</p>
                </div>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {pendingEvidence.length + reviewEvidence.length} pending
                </span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Evidence</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Captured</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {[...pendingEvidence, ...reviewEvidence].slice(0, 20).map(e => (
                  <EvidenceQueueRow
                    key={e.id}
                    id={e.id}
                    title={e.title}
                    excerpt={e.excerpt}
                    projectName={e.projectId ? (projectNames[e.projectId] ?? "—") : "—"}
                    type={e.type}
                    validationStatus={e.validationStatus}
                    dateCaptured={e.dateCaptured}
                  />
                ))}
                {pendingEvidence.length === 0 && reviewEvidence.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#131218]/30">
                      No pending evidence. All caught up ✓
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {(pendingEvidence.length + reviewEvidence.length) > 0 && (
              <div className="px-6 py-3 border-t border-[#EFEFEA]">
                <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                  COUNT {pendingEvidence.length + reviewEvidence.length}
                </p>
              </div>
            )}
          </div>

          {/* Recent sources */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">Recent Sources</h2>
              <p className="text-xs text-[#131218]/40 mt-0.5">Últimos emails y documentos procesados</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Source</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Ingested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {sources.slice(0, 15).map(s => (
                  <tr key={s.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                    <td className="px-6 py-3 font-semibold text-[#131218] text-sm max-w-xs">
                      <p className="truncate">{s.title || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#131218]/50">
                      {s.projectId ? (projectNames[s.projectId] ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={s.sourceType} /></td>
                    <td className="px-4 py-3"><StatusBadge value={s.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#131218]/35 font-medium">
                      {s.dateIngested
                        ? new Date(s.dateIngested).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#131218]/30">
                      No sources ingested yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-6 py-3 border-t border-[#EFEFEA]">
              <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">COUNT {sources.length}</p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
