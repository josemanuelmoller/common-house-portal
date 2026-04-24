import type { CSSProperties } from "react";
import { Sidebar } from "@/components/Sidebar";
import { HallSection } from "@/components/HallSection";
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

const PRIORITY_DOT_STYLE: Record<string, CSSProperties> = {
  "P1 Critical": { background: "var(--hall-danger)" },
  "High":        { background: "var(--hall-warn)" },
  "Medium":      { background: "var(--hall-info)" },
  "Low":         { background: "var(--hall-muted-3)" },
};

const TYPE_ICON: Record<string, { icon: string; style: CSSProperties }> = {
  "Approval":                   { icon: "✓", style: { color: "var(--hall-ok)",       background: "var(--hall-ok-soft)" } },
  "Missing Input":              { icon: "?", style: { color: "var(--hall-warn)",     background: "var(--hall-warn-soft)" } },
  "Ambiguity Resolution":       { icon: "⊡", style: { color: "var(--hall-info)",     background: "var(--hall-info-soft)" } },
  "Policy/Automation Decision": { icon: "◎", style: { color: "var(--hall-muted-2)",  background: "var(--hall-fill-soft)" } },
  "Draft Review":               { icon: "▤", style: { color: "var(--hall-ink-0)",    background: "var(--hall-fill-soft)" } },
};

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function DecisionCard({ d }: { d: DecisionItem }) {
  const needsExecute = d.requiresExecute && !d.executeApproved;
  const tCfg = TYPE_ICON[d.decisionType] ?? { icon: "·", style: { color: "var(--hall-muted-3)", background: "var(--hall-fill-soft)" } };
  const overdue = d.dueDate && daysSince(d.dueDate) > 0;
  return (
    <div
      className="px-6 py-4 flex items-start gap-4"
      style={needsExecute ? { background: "var(--hall-danger-soft)" } : undefined}
    >
      <div className="mt-1 shrink-0">
        <span
          className="w-2 h-2 rounded-full inline-block"
          style={PRIORITY_DOT_STYLE[d.priority] ?? PRIORITY_DOT_STYLE["Low"]}
        />
      </div>
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
        style={tCfg.style}
      >
        {tCfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--hall-ink-0)" }}>{d.title}</p>
          {needsExecute && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{
                fontFamily: "var(--font-hall-mono)",
                background: "var(--hall-danger-soft)",
                color: "var(--hall-danger)",
                border: "1px solid var(--hall-danger)",
              }}
            >
              × Execute blocked
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span
            className="text-[10px] font-medium"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            {d.decisionType}
          </span>
          {d.sourceAgent && (
            <span
              className="text-[10px] font-medium"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
            >
              via {d.sourceAgent}
            </span>
          )}
          {d.dueDate && (
            <span
              className="text-[10px] font-bold"
              style={{ fontFamily: "var(--font-hall-mono)", color: overdue ? "var(--hall-danger)" : "var(--hall-muted-3)" }}
            >
              {overdue ? "! Overdue" : "Due"} {new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
        {d.notes ? (
          <p className="text-[12px] mt-2 leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{d.notes}</p>
        ) : (
          <p className="text-[11px] italic mt-1.5" style={{ color: "var(--hall-muted-3)" }}>No context provided.</p>
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
    <div className="flex min-h-screen bg-[#f4f4ef]">
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              OS · <b style={{ color: "var(--hall-ink-0)" }}>INTAKE</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Needs your{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                call
              </em>.
            </h1>
          </div>
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            {totalPending > 0 ? `${totalPending} PENDING` : "ALL CLEAR"}
          </span>
        </header>

        <div className="px-9 py-6 space-y-6">

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
            <HallSection
              title="Active " flourish="blockers"
              meta={`${blockers.length} BLOCKER${blockers.length !== 1 ? "S" : ""}`}
            >
              <p className="text-xs mb-2" style={{ color: "var(--hall-muted-2)" }}>
                Validated blockers requiring immediate attention
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--hall-paper-1)", borderBottom: "1px solid var(--hall-line-soft)" }}>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Blocker</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Project</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Confidence</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {blockers.map(e => (
                    <tr key={e.id} style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sm" style={{ color: "var(--hall-ink-0)" }}>{e.title}</p>
                        {e.excerpt && (
                          <p className="text-xs mt-0.5 line-clamp-1 max-w-sm" style={{ color: "var(--hall-muted-2)" }}>
                            {e.excerpt}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--hall-muted-2)" }}>
                        {e.projectId ? (projectNames[e.projectId] ?? "—") : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={e.confidence} /></td>
                      <td
                        className="px-4 py-3 text-xs font-medium"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                      >
                        {e.dateCaptured
                          ? new Date(e.dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HallSection>
          )}

          {/* Needs Your Call — unified: decisions + flagged evidence + passing through */}
          <HallSection
            title="Needs your " flourish="call"
            meta={totalPending > 0 ? `${totalPending} PENDING` : "ALL CLEAR"}
          >
            <p className="text-xs mb-3" style={{ color: "var(--hall-muted-2)" }}>
              Decisions + exceptions que el engine no pudo resolver solo
            </p>

            <div style={{ border: "1px solid var(--hall-line)" }}>

              {/* Decisions — top priority */}
              {openDecisions.length > 0 && (
                <div style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                  <div
                    className="px-6 py-2 flex items-center justify-between"
                    style={{ background: "var(--hall-danger-soft)", borderBottom: "1px solid var(--hall-line-soft)" }}
                  >
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
                    >
                      Decisions · {openDecisions.length} item{openDecisions.length !== 1 ? "s" : ""}
                    </p>
                    {(executeGateCount > 0 || p1DecisionCount > 0) && (
                      <p
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
                      >
                        {executeGateCount > 0 && `${executeGateCount} × execute blocked`}
                        {executeGateCount > 0 && p1DecisionCount > 0 && " · "}
                        {p1DecisionCount > 0 && `${p1DecisionCount} P1`}
                      </p>
                    )}
                  </div>
                  <div>
                    {openDecisions.map(d => (
                      <div key={d.id} style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                        <DecisionCard d={d} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Flagged evidence — action required */}
              {newEvidence.length > 0 && (
                <div style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                  <div
                    className="px-6 py-2"
                    style={{ background: "var(--hall-warn-paper)", borderBottom: "1px solid var(--hall-line-soft)" }}
                  >
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                    >
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
                  <div
                    className="px-6 py-2 flex items-center justify-between"
                    style={{ background: "var(--hall-fill-soft)", borderBottom: "1px solid var(--hall-line-soft)" }}
                  >
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Passing through · {reviewEvidence.length} item{reviewEvidence.length !== 1 ? "s" : ""}
                    </p>
                    <p
                      className="text-[9px] italic"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      Engine validará automáticamente
                    </p>
                  </div>
                  <EvidenceQueueReadOnlyTable items={reviewEvidence} projectNames={projectNames} />
                </>
              )}

              {totalPending === 0 && (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm font-medium" style={{ color: "var(--hall-muted-3)" }}>
                    Nothing pending — engine handled everything ✓
                  </p>
                </div>
              )}

              {totalPending > 0 && (
                <div className="px-6 py-3" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                  >
                    {openDecisions.length} decisions · {newEvidence.length} flagged · {reviewEvidence.length} passing · {validatedEvidence.length} validated ({validationRate}% rate)
                  </p>
                </div>
              )}
            </div>
          </HallSection>

          {/* Evidence per project breakdown */}
          <HallSection title="Evidence by " flourish="project">
            <p className="text-xs mb-2" style={{ color: "var(--hall-muted-2)" }}>
              Processing and validation progress per project
            </p>
            <ul className="flex flex-col">
              {projects.map(p => {
                const stats = evidenceByProject[p.id] ?? { total: 0, validated: 0, pending: 0 };
                const rate  = stats.total > 0 ? Math.round((stats.validated / stats.total) * 100) : 0;
                return (
                  <li key={p.id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <div className="py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm tracking-tight truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge value={p.stage} />
                          {p.geography.map(g => (
                            <span
                              key={g}
                              className="text-[9px] font-bold uppercase tracking-widest"
                              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="w-32 shrink-0">
                        <div
                          className="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                        >
                          <span>{stats.validated} validated</span>
                          <span>{rate}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--hall-fill-soft)" }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${rate}%`, background: "var(--hall-ok)" }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-4 shrink-0">
                        <div className="text-center">
                          <p className="text-lg font-bold" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}>{stats.total}</p>
                          <p
                            className="text-[9px] font-bold uppercase tracking-widest"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                          >
                            Total
                          </p>
                        </div>
                        <div className="text-center">
                          <p
                            className="text-lg font-bold"
                            style={{ fontFamily: "var(--font-hall-mono)", color: stats.pending > 0 ? "var(--hall-warn)" : "var(--hall-muted-3)" }}
                          >
                            {stats.pending}
                          </p>
                          <p
                            className="text-[9px] font-bold uppercase tracking-widest"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                          >
                            Pending
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
              {projects.length === 0 && (
                <li className="py-8 text-center text-sm" style={{ color: "var(--hall-muted-3)" }}>
                  No projects found.
                </li>
              )}
            </ul>
          </HallSection>

          {/* Source Log */}
          <HallSection title="Source " flourish="pipeline">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs" style={{ color: "var(--hall-muted-2)" }}>
                Ingested → Processed by the engine · emails, meetings, and documents
              </p>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <span
                  className="text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-widest"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: "var(--hall-fill-soft)",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  {processedSources} processed
                </span>
                {ingestedSources > 0 && (
                  <span
                    className="text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-widest"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      background: "var(--hall-warn-paper)",
                      color: "var(--hall-warn)",
                      border: "1px solid var(--hall-warn-soft)",
                    }}
                  >
                    {ingestedSources} ingested
                  </span>
                )}
                {needsReviewSources > 0 && (
                  <span
                    className="text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-widest"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      background: "var(--hall-danger-soft)",
                      color: "var(--hall-danger)",
                      border: "1px solid var(--hall-danger-soft)",
                    }}
                  >
                    {needsReviewSources} needs review
                  </span>
                )}
                {unlinkedSources > 0 && (
                  <span
                    className="text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-widest"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      background: "var(--hall-fill-soft)",
                      color: "var(--hall-muted-3)",
                      border: "1px solid var(--hall-line)",
                    }}
                  >
                    {unlinkedSources} unlinked
                  </span>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--hall-paper-1)", borderBottom: "1px solid var(--hall-line-soft)" }}>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Source</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Project</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Ingested</th>
                </tr>
              </thead>
              <tbody>
                {sources.slice(0, 50).map(s => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                    <td className="px-4 py-3 font-semibold text-sm max-w-xs" style={{ color: "var(--hall-ink-0)" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] shrink-0" style={{ color: "var(--hall-muted-3)" }}>{sourceIcon(s.sourceType)}</span>
                        <p className="truncate">{s.title || "—"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--hall-muted-2)" }}>
                      {s.projectId ? (projectNames[s.projectId] ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={s.sourceType} /></td>
                    <td className="px-4 py-3"><StatusBadge value={s.status} /></td>
                    <td
                      className="px-4 py-3 text-xs font-medium"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      {s.dateIngested
                        ? new Date(s.dateIngested).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm" style={{ color: "var(--hall-muted-3)" }}>
                      No sources ingested yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {sources.length > 0 && (
              <div className="py-3" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  {sources.length <= 50
                    ? `${sources.length} registro${sources.length !== 1 ? "s" : ""}`
                    : `Últimos 50 de ${sources.length} registros`}
                </p>
              </div>
            )}
          </HallSection>

        </div>
      </main>
    </div>
  );
}
