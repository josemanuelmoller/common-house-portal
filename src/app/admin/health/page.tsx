import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { getAllEvidence, getAllSources, getAllProjects } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/** Best available activity signal across all date fields on a project */
function bestActivity(p: { lastUpdate: string | null; lastEvidenceDate?: string | null; lastMeetingDate?: string | null }): string | null {
  return [p.lastUpdate, p.lastEvidenceDate ?? null, p.lastMeetingDate ?? null]
    .filter(Boolean)
    .sort()
    .pop() ?? null;
}

function HallSectionHead({ title, flourish, meta }: { title: string; flourish?: string; meta?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
    >
      <h2
        className="text-[19px] font-bold leading-none"
        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
      >
        {title}
        {flourish && (
          <>
            {" "}
            <em className="hall-flourish">{flourish}</em>
          </>
        )}
      </h2>
      {meta && (
        <span
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

export default async function HealthPage() {
  await requireAdmin();

  const [allEvidence, sources, projects] = await Promise.all([
    getAllEvidence(),
    getAllSources(),
    getAllProjects(),
  ]);

  const projectNames: Record<string, string> = {};
  for (const p of projects) projectNames[p.id] = p.name;

  const newEvidence        = allEvidence.filter(e => e.validationStatus === "New");
  const reviewedEvidence   = allEvidence.filter(e => e.validationStatus === "Reviewed");
  const validatedEvidence  = allEvidence.filter(e => e.validationStatus === "Validated");
  const blockers           = allEvidence.filter(e => e.type === "Blocker" && e.validationStatus === "Validated");
  const evidenceWithExcerpt    = allEvidence.filter(e => e.excerpt && e.excerpt.trim().length > 0);
  const evidenceMissingExcerpt = allEvidence.filter(e => !e.excerpt || e.excerpt.trim().length === 0);

  const validationRate = allEvidence.length > 0
    ? Math.round((validatedEvidence.length / allEvidence.length) * 100)
    : 0;

  const ingestedSources    = sources.filter(s => s.status === "Ingested");
  const processedSources   = sources.filter(s => s.status === "Processed");
  const needsReviewSources = sources.filter(s => s.status === "Needs Review");
  const unlinkedSources    = sources.filter(s => !s.projectId);

  const backlogByProject = projects
    .map(p => {
      const pending = allEvidence.filter(
        e => e.projectId === p.id && e.validationStatus === "New"
      ).length;
      return { ...p, pending };
    })
    .filter(p => p.pending > 0)
    .sort((a, b) => b.pending - a.pending);

  const updateNeededProjects = projects.filter(p => p.updateNeeded);
  const staleProjects        = projects.filter(p => { const d = daysSince(bestActivity(p)); return d !== null && d > 30; });

  const overallHealthy =
    newEvidence.length === 0 &&
    blockers.length === 0 &&
    updateNeededProjects.length === 0 &&
    needsReviewSources.length === 0;

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              HEALTH · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              System <em className="hall-flourish">Health</em>
            </h1>
          </div>
          <span
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: overallHealthy ? "var(--hall-ok)" : "var(--hall-warn)", letterSpacing: "0.08em" }}
          >
            {overallHealthy ? "ALL CLEAR" : "INTERVENTION NEEDED"}
          </span>
        </header>

        <div className="px-9 py-6 space-y-7">

          {/* Intervention summary */}
          {overallHealthy ? (
            <div
              className="flex items-center gap-4 px-6 py-5"
              style={{ background: "var(--hall-ink-0)", borderRadius: 3 }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{background: "var(--hall-ok)"}} />
              <div>
                <p className="text-sm font-bold tracking-tight" style={{color: "var(--hall-paper-0)"}}>All clear — no intervention needed</p>
                <p className="text-xs font-medium mt-0.5" style={{color: "var(--hall-muted-3)"}}>Evidence is clean, blockers are resolved, sources are linked.</p>
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--hall-ink-0)", borderRadius: 3, overflow: "hidden" }}>
              <div
                className="px-6 py-4 flex items-center justify-between"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  Intervention Needed
                </p>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    letterSpacing: "0.08em",
                    background: "var(--hall-danger)",
                    color: "var(--hall-paper-0)",
                  }}
                >
                  {[
                    blockers.length > 0 && "blockers",
                    newEvidence.length > 0 && "pending evidence",
                    updateNeededProjects.length > 0 && "updates needed",
                    needsReviewSources.length > 0 && "source exceptions",
                  ].filter(Boolean).length} signals
                </span>
              </div>
              <div>
                {blockers.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "var(--hall-danger)"}} />
                    <p className="text-sm font-semibold flex-1" style={{color: "rgba(255,255,255,0.8)"}}>
                      {blockers.length} active blocker{blockers.length !== 1 ? "s" : ""}
                    </p>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
                    >
                      Act now
                    </p>
                  </div>
                )}
                {needsReviewSources.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "var(--hall-warn)"}} />
                    <p className="text-sm font-semibold flex-1" style={{color: "rgba(255,255,255,0.8)"}}>
                      {needsReviewSources.length} source{needsReviewSources.length !== 1 ? "s" : ""} need review
                    </p>
                    <Link
                      href="/admin/os"
                      className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                    >
                      Go to Intake →
                    </Link>
                  </div>
                )}
                {newEvidence.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "var(--hall-warn)"}} />
                    <p className="text-sm font-semibold flex-1" style={{color: "rgba(255,255,255,0.8)"}}>
                      {newEvidence.length} evidence item{newEvidence.length !== 1 ? "s" : ""} pending validation
                    </p>
                    <Link
                      href="/admin/os"
                      className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                    >
                      Go to Intake →
                    </Link>
                  </div>
                )}
                {updateNeededProjects.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "rgba(255,255,255,0.2)"}} />
                    <p className="text-sm font-semibold flex-1" style={{color: "rgba(255,255,255,0.8)"}}>
                      {updateNeededProjects.length} project{updateNeededProjects.length !== 1 ? "s" : ""} need a status update
                    </p>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "rgba(255,255,255,0.25)" }}
                    >
                      This week
                    </p>
                  </div>
                )}
                {staleProjects.filter(p => !p.updateNeeded).length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "rgba(255,255,255,0.1)"}} />
                    <p className="text-sm font-semibold flex-1" style={{color: "rgba(255,255,255,0.5)"}}>
                      {staleProjects.filter(p => !p.updateNeeded).length} project{staleProjects.filter(p => !p.updateNeeded).length !== 1 ? "s" : ""} stale (30d+)
                    </p>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "rgba(255,255,255,0.2)" }}
                    >
                      Watch
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Core health metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Pending Evidence"   value={newEvidence.length}            color={newEvidence.length > 0 ? "yellow" : "green"} sub={reviewedEvidence.length > 0 ? `+${reviewedEvidence.length} reviewed` : undefined} />
            <MetricCard label="Active Blockers"    value={blockers.length}               color={blockers.length > 0 ? "red" : "green"} />
            <MetricCard label="Validation Rate"    value={`${validationRate}%`}          color={validationRate >= 80 ? "green" : "yellow"} />
            <MetricCard label="Ingested (pending)" value={ingestedSources.length}        color={ingestedSources.length > 0 ? "yellow" : "green"} sub={`${processedSources.length} processed`} />
          </div>

          {/* Evidence hygiene */}
          <div className="grid grid-cols-2 gap-6">

            {/* Missing excerpts */}
            <section>
              <HallSectionHead
                title="Missing"
                flourish="excerpts"
                meta={`${evidenceMissingExcerpt.length} MISSING`}
              />
              <div className="py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold tabular-nums" style={{color: "var(--hall-ink-0)"}}>{evidenceMissingExcerpt.length}</p>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      Without excerpt
                    </p>
                  </div>
                  <div className="text-lg" style={{color: "var(--hall-muted-3)"}}>·</div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums" style={{color: "var(--hall-ink-0)"}}>{evidenceWithExcerpt.length}</p>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      With excerpt
                    </p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full overflow-hidden" style={{background: "var(--hall-fill-soft)"}}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          background: "var(--hall-ok)",
                          width: allEvidence.length > 0 ? `${Math.round((evidenceWithExcerpt.length / allEvidence.length) * 100)}%` : "0%",
                        }}
                      />
                    </div>
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest mt-1"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      {allEvidence.length > 0 ? Math.round((evidenceWithExcerpt.length / allEvidence.length) * 100) : 0}% coverage
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Validation backlog */}
            <section>
              <HallSectionHead
                title="Validation"
                flourish="backlog"
                meta={`${newEvidence.length} PENDING`}
              />
              <div className="py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold tabular-nums" style={{color: "var(--hall-ink-0)"}}>{newEvidence.length}</p>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      New
                    </p>
                  </div>
                  <div className="text-lg" style={{color: "var(--hall-muted-3)"}}>·</div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums" style={{color: "var(--hall-ink-0)"}}>{validatedEvidence.length}</p>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      Validated
                    </p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full overflow-hidden" style={{background: "var(--hall-fill-soft)"}}>
                      <div
                        className="h-full rounded-full"
                        style={{ background: "var(--hall-ok)", width: `${validationRate}%` }}
                      />
                    </div>
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest mt-1"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      {validationRate}% validated
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Backlog by project */}
          {backlogByProject.length > 0 && (
            <section>
              <HallSectionHead
                title="Pending"
                flourish="by project"
                meta={`${backlogByProject.length} PROJECT${backlogByProject.length !== 1 ? "S" : ""}`}
              />
              <ul className="flex flex-col">
                {backlogByProject.map((p, idx) => (
                  <li
                    key={p.id}
                    style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-4 py-3 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{color: "var(--hall-ink-0)"}}>{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StatusBadge value={p.stage} />
                        </div>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          background: "var(--hall-warn-soft)",
                          color: "var(--hall-warn)",
                        }}
                      >
                        {p.pending} pending
                      </span>
                      <span className="transition-colors text-sm shrink-0" style={{color: "var(--hall-muted-3)"}}>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Active blockers */}
          {blockers.length > 0 && (
            <section>
              <HallSectionHead
                title="Active"
                flourish="blockers"
                meta={`${blockers.length} BLOCKER${blockers.length !== 1 ? "S" : ""}`}
              />
              <ul className="flex flex-col">
                {blockers.map((e, idx) => (
                  <li
                    key={e.id}
                    className="py-3 flex items-start gap-3"
                    style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{background: "var(--hall-danger)"}} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{color: "var(--hall-ink-0)"}}>{e.title}</p>
                      {e.projectId && (
                        <Link
                          href={`/admin/projects/${e.projectId}`}
                          className="text-xs font-medium mt-0.5 inline-block transition-colors"
                          style={{color: "var(--hall-muted-2)"}}
                        >
                          {projectNames[e.projectId] ?? "—"} →
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Project health */}
          {(updateNeededProjects.length > 0 || staleProjects.length > 0) && (
            <section>
              <HallSectionHead
                title="Project"
                flourish="status"
                meta={[
                  updateNeededProjects.length > 0 ? `${updateNeededProjects.length} UPDATE NEEDED` : null,
                  staleProjects.length > 0 ? `${staleProjects.length} STALE` : null,
                ].filter(Boolean).join(" · ")}
              />
              <ul className="flex flex-col">
                {updateNeededProjects.map((p, idx) => (
                  <li
                    key={`upd-${p.id}`}
                    style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-3 py-3 transition-colors group"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{background: "var(--hall-warn)"}} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{color: "var(--hall-ink-0)"}}>{p.name}</p>
                        <p
                          className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                        >
                          Update needed · {daysSince(bestActivity(p)) !== null ? `${daysSince(bestActivity(p))}d ago` : "no activity recorded"}
                        </p>
                      </div>
                      <StatusBadge value={p.stage} />
                      <span className="transition-colors text-sm shrink-0" style={{color: "var(--hall-muted-3)"}}>→</span>
                    </Link>
                  </li>
                ))}
                {staleProjects.filter(p => !p.updateNeeded).map((p, idx) => (
                  <li
                    key={`stale-${p.id}`}
                    style={(idx === 0 && updateNeededProjects.length === 0) ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-3 py-3 transition-colors group"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{background: "var(--hall-danger)"}} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{color: "var(--hall-ink-0)"}}>{p.name}</p>
                        <p
                          className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
                        >
                          Stale · {daysSince(bestActivity(p)) ?? "—"}d since last activity
                        </p>
                      </div>
                      <StatusBadge value={p.stage} />
                      <span className="transition-colors text-sm shrink-0" style={{color: "var(--hall-muted-3)"}}>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Source exceptions */}
          {(needsReviewSources.length > 0 || unlinkedSources.length > 0) && (
            <section>
              <HallSectionHead
                title="Source"
                flourish="exceptions"
                meta="MANUAL TRIAGE"
              />
              <ul className="flex flex-col">
                {needsReviewSources.map((s, idx) => (
                  <li
                    key={s.id}
                    className="py-3 flex items-center gap-3"
                    style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{background: "var(--hall-warn)"}} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{color: "var(--hall-ink-0)"}}>{s.title}</p>
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                      >
                        Needs Review · {s.sourceType}
                      </p>
                    </div>
                    <StatusBadge value={s.status} />
                  </li>
                ))}
                {unlinkedSources.slice(0, 5).map((s, idx) => (
                  <li
                    key={`unlinked-${s.id}`}
                    className="py-3 flex items-center gap-3"
                    style={(idx === 0 && needsReviewSources.length === 0) ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{background: "var(--hall-muted-3)"}} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{color: "var(--hall-ink-0)"}}>{s.title}</p>
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                      >
                        Unlinked · {s.sourceType}
                      </p>
                    </div>
                    <StatusBadge value={s.status} />
                  </li>
                ))}
                {unlinkedSources.length > 5 && (
                  <li className="py-3 text-center" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      +{unlinkedSources.length - 5} more unlinked sources
                    </p>
                  </li>
                )}
              </ul>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
