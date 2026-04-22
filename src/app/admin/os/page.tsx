import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricCard } from "@/components/MetricCard";
import { EvidenceQueueTable, EvidenceQueueReadOnlyTable } from "@/components/EvidenceQueueTable";
import { DecisionActions } from "@/components/DecisionActions";
import { getAllEvidence, getAllSources, getAllProjects, getDecisionItems, type DecisionItem } from "@/lib/notion";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";

const PRIORITY_RANK: Record<string, number> = {
  "P1 Critical": 0,
  "High": 1,
  "Medium": 2,
  "Low": 3,
};

const PRIORITY_DOT: Record<string, string> = {
  "P1 Critical": "bg-red-500",
  "High":        "bg-amber-400",
  "Medium":      "bg-blue-400",
  "Low":         "bg-[#131218]/15",
};

const TYPE_ICON: Record<string, { icon: string; color: string }> = {
  "Approval":                   { icon: "✓", color: "text-green-600 bg-green-50" },
  "Missing Input":              { icon: "?", color: "text-amber-600 bg-amber-50" },
  "Ambiguity Resolution":       { icon: "⊡", color: "text-blue-600 bg-blue-50" },
  "Policy/Automation Decision": { icon: "◎", color: "text-purple-600 bg-purple-50" },
  "Draft Review":               { icon: "▤", color: "text-[#131218] bg-[#EFEFEA]" },
};

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function DecisionCard({ d }: { d: DecisionItem }) {
  const needsExecute = d.requiresExecute && !d.executeApproved;
  const tCfg = TYPE_ICON[d.decisionType] ?? { icon: "·", color: "text-[#131218]/40 bg-[#EFEFEA]" };
  const overdue = d.dueDate && daysSince(d.dueDate) > 0;
  return (
    <div className={`px-6 py-4 flex items-start gap-4 ${needsExecute ? "bg-red-50/30" : ""}`}>
      <div className="mt-1 shrink-0">
        <span className={`w-2 h-2 rounded-full inline-block ${PRIORITY_DOT[d.priority] ?? PRIORITY_DOT["Low"]}`} />
      </div>
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${tCfg.color}`}>
        {tCfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[#131218] leading-snug">{d.title}</p>
          {needsExecute && (
            <span className="text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              × Execute blocked
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-[10px] text-[#131218]/30 font-medium">{d.decisionType}</span>
          {d.sourceAgent && <span className="text-[10px] text-[#131218]/25 font-medium">via {d.sourceAgent}</span>}
          {d.dueDate && (
            <span className={`text-[10px] font-bold ${overdue ? "text-red-500" : "text-[#131218]/25"}`}>
              {overdue ? "! Overdue" : "Due"} {new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
        {d.notes ? (
          <p className="text-[12px] text-[#131218]/65 mt-2 leading-relaxed">{d.notes}</p>
        ) : (
          <p className="text-[11px] text-[#131218]/25 italic mt-1.5">No context provided.</p>
        )}
        <DecisionActions
          id={d.id}
          requiresExecute={d.requiresExecute}
          executeApproved={d.executeApproved}
          status={d.status}
          decisionType={d.decisionType}
          sourceAgent={d.sourceAgent}
          notionUrl={d.notionUrl}
          relatedEntityId={d.relatedEntityId}
          relatedField={d.relatedField}
          relatedResolutionType={d.relatedResolutionType}
          relatedSearchDb={d.relatedSearchDb}
          relatedFields={d.relatedFields}
          entityAction={d.entityAction}
          entityName={d.entityName}
          entityDomain={d.entityDomain}
          entityCategory={d.entityCategory}
          contactName={d.contactName}
          contactEmail={d.contactEmail}
          personName={d.personName}
          personEmail={d.personEmail}
          personOrgId={d.personOrgId}
          personOrgName={d.personOrgName}
        />
      </div>
    </div>
  );
}

export default async function OSPage() {
  await requireAdmin();

  const [allEvidence, sources, projects, allDecisions] = await Promise.all([
    getAllEvidence(),
    getAllSources(),
    getAllProjects(),
    getDecisionItems(),
  ]);

  // Build project name lookup
  const projectNames: Record<string, string> = {};
  for (const p of projects) projectNames[p.id] = p.name;

  const newEvidence       = allEvidence.filter(e => e.validationStatus === "New");
  const reviewEvidenceRaw = allEvidence.filter(e => e.validationStatus === "Reviewed");
  // "Passing through" — only last 14 days. Older Reviewed items are archived by
  // the engine (validation-operator ARCHIVE tier) and don't belong in the queue.
  const reviewEvidence    = reviewEvidenceRaw.filter(e =>
    e.dateCaptured ? daysSince(e.dateCaptured) <= 14 : false,
  );
  const validatedEvidence = allEvidence.filter(e => e.validationStatus === "Validated");
  const blockers          = allEvidence.filter(e => e.type === "Blocker" && e.validationStatus === "Validated");

  // Open decisions — sorted by severity: Execute Gate > P1 > priority
  const openDecisions = allDecisions
    .filter(d => d.status === "Open" || !d.status)
    .sort((a, b) => {
      const aGate = a.requiresExecute && !a.executeApproved ? 0 : 1;
      const bGate = b.requiresExecute && !b.executeApproved ? 0 : 1;
      if (aGate !== bGate) return aGate - bGate;
      return (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    });
  const executeGateCount = openDecisions.filter(d => d.requiresExecute && !d.executeApproved).length;
  const p1DecisionCount  = openDecisions.filter(d => d.priority === "P1 Critical").length;

  const totalPending = newEvidence.length + reviewEvidence.length + openDecisions.length;

  const validationRate = allEvidence.length > 0
    ? Math.round((validatedEvidence.length / allEvidence.length) * 100)
    : 0;

  // Source pipeline status breakdown
  const ingestedSources    = sources.filter(s => s.status === "Ingested").length;
  const processedSources   = sources.filter(s => s.status === "Processed").length;
  const needsReviewSources = sources.filter(s => s.status === "Needs Review").length;
  const unlinkedSources    = sources.filter(s => !s.projectId).length;

  // Evidence per project
  const evidenceByProject: Record<string, { total: number; validated: number; pending: number }> = {};
  for (const e of allEvidence) {
    const pid = e.projectId ?? "unknown";
    if (!evidenceByProject[pid]) evidenceByProject[pid] = { total: 0, validated: 0, pending: 0 };
    evidenceByProject[pid].total++;
    if (e.validationStatus === "Validated") evidenceByProject[pid].validated++;
    if (e.validationStatus === "New") evidenceByProject[pid].pending++;
  }

  function sourceIcon(type: string): string {
    if (type.includes("Email") || type.includes("Gmail")) return "✉";
    if (type.includes("Meeting") || type.includes("Fireflies")) return "◷";
    return "▤";
  }

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 ml-[228px] overflow-auto">
        {/* Header */}
        <div className="bg-[#131218] px-10 py-10">
          <p className="text-[8px] font-bold uppercase tracking-[2.5px] text-white/20 mb-3">
            CONTROL ROOM · INTAKE
          </p>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px]">
            Intake &amp; <em className="font-[900] italic text-[#c8f55a]">Exceptions</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[520px] leading-[1.65]">
            Decisions · Evidence · Sources. Todo lo que el engine no pudo resolver solo.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Pipeline metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Decisions"  value={openDecisions.length}      color={openDecisions.length > 0 ? "yellow" : "default"} sub={executeGateCount > 0 ? `${executeGateCount} blocked` : undefined} />
            <MetricCard label="Sources"    value={sources.length}            sub={ingestedSources > 0 ? `${ingestedSources} ingested` : undefined} />
            <MetricCard label="New"        value={newEvidence.length}        color={newEvidence.length > 0 ? "yellow" : "default"} sub="needs human" />
            <MetricCard label="Validated"  value={validatedEvidence.length}  color="green" />
            <MetricCard label="Blockers"   value={blockers.length}           color={blockers.length > 0 ? "red" : "default"} />
            <MetricCard label="Val. Rate"  value={`${validationRate}%`}      color="green" />
          </div>

          {/* Active blockers — shown prominently if any */}
          {blockers.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="h-1 bg-red-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Active Blockers</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Validated blockers requiring immediate attention</p>
                </div>
                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {blockers.length} blocker{blockers.length !== 1 ? "s" : ""}
                </span>
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

          {/* Needs Your Call — unified: decisions + flagged evidence + passing through */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-amber-400" />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Needs Your Call</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">Decisions + exceptions que el engine no pudo resolver solo</p>
              </div>
              {totalPending > 0 ? (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {totalPending} pending
                </span>
              ) : (
                <span className="text-[10px] font-bold bg-[#EFEFEA] text-[#131218]/30 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  All clear
                </span>
              )}
            </div>

            {/* Decisions — top priority */}
            {openDecisions.length > 0 && (
              <div className="border-b border-[#EFEFEA]">
                <div className="px-6 py-2 bg-red-50/40 border-b border-red-100 flex items-center justify-between">
                  <p className="text-[9px] font-bold text-red-600 uppercase tracking-widest">
                    Decisions · {openDecisions.length} item{openDecisions.length !== 1 ? "s" : ""}
                  </p>
                  {(executeGateCount > 0 || p1DecisionCount > 0) && (
                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest">
                      {executeGateCount > 0 && `${executeGateCount} × execute blocked`}
                      {executeGateCount > 0 && p1DecisionCount > 0 && " · "}
                      {p1DecisionCount > 0 && `${p1DecisionCount} P1`}
                    </p>
                  )}
                </div>
                <div className="divide-y divide-[#EFEFEA]">
                  {openDecisions.map(d => <DecisionCard key={d.id} d={d} />)}
                </div>
              </div>
            )}

            {/* Flagged evidence — action required */}
            {newEvidence.length > 0 && (
              <div className="border-b border-[#EFEFEA]">
                <div className="px-6 py-2 bg-amber-50/60 border-b border-amber-100">
                  <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">
                    Flagged evidence · {newEvidence.length} item{newEvidence.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <EvidenceQueueTable
                  items={newEvidence.slice(0, 30)}
                  projectNames={projectNames}
                />
              </div>
            )}

            {/* In Review — recent (<=14d), engine will validate */}
            {reviewEvidence.length > 0 && (
              <>
                <div className="px-6 py-2 bg-[#EFEFEA]/60 border-y border-[#EFEFEA] flex items-center justify-between">
                  <p className="text-[9px] font-bold text-[#131218]/40 uppercase tracking-widest">
                    Passing through · {reviewEvidence.length} item{reviewEvidence.length !== 1 ? "s" : ""}
                  </p>
                  <p className="text-[9px] text-[#131218]/25 italic">Engine validará automáticamente</p>
                </div>
                <EvidenceQueueReadOnlyTable items={reviewEvidence} projectNames={projectNames} />
              </>
            )}

            {totalPending === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-medium text-[#131218]/30">Nothing pending — engine handled everything ✓</p>
              </div>
            )}

            {totalPending > 0 && (
              <div className="px-6 py-3 border-t border-[#EFEFEA]">
                <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                  {openDecisions.length} decisions · {newEvidence.length} flagged · {reviewEvidence.length} passing · {validatedEvidence.length} validated ({validationRate}% rate)
                </p>
              </div>
            )}
          </div>

          {/* Evidence per project breakdown */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">Evidence by Project</h2>
              <p className="text-xs text-[#131218]/40 mt-0.5">Processing and validation progress per project</p>
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
              {projects.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-[#131218]/30">
                  No projects found.
                </div>
              )}
            </div>
          </div>

          {/* Source Log */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Source Pipeline</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Ingested → Processed by the engine · emails, meetings, and documents</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <span className="text-[9px] font-bold bg-[#EFEFEA] text-[#131218]/40 px-2 py-1 rounded-full uppercase tracking-widest">
                    {processedSources} processed
                  </span>
                  {ingestedSources > 0 && (
                    <span className="text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded-full uppercase tracking-widest">
                      {ingestedSources} ingested
                    </span>
                  )}
                  {needsReviewSources > 0 && (
                    <span className="text-[9px] font-bold bg-red-50 text-red-500 border border-red-200 px-2 py-1 rounded-full uppercase tracking-widest">
                      {needsReviewSources} needs review
                    </span>
                  )}
                  {unlinkedSources > 0 && (
                    <span className="text-[9px] font-bold bg-gray-50 text-gray-400 border border-gray-200 px-2 py-1 rounded-full uppercase tracking-widest">
                      {unlinkedSources} unlinked
                    </span>
                  )}
                </div>
              </div>
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
                {sources.slice(0, 50).map(s => (
                  <tr key={s.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                    <td className="px-6 py-3 font-semibold text-[#131218] text-sm max-w-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] text-[#131218]/30 shrink-0">{sourceIcon(s.sourceType)}</span>
                        <p className="truncate">{s.title || "—"}</p>
                      </div>
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
            {sources.length > 0 && (
              <div className="px-6 py-3 border-t border-[#EFEFEA]">
                <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                  {sources.length <= 50
                    ? `${sources.length} registro${sources.length !== 1 ? "s" : ""}`
                    : `Últimos 50 de ${sources.length} registros`}
                </p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
