import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function warmthLabel(days: number): { label: string; dot: string; text: string } {
  if (days <= 3)  return { label: "Hot",     dot: "var(--hall-danger)", text: "var(--hall-danger)" };
  if (days <= 10) return { label: "Warm",    dot: "var(--hall-warn)",   text: "var(--hall-warn)" };
  if (days <= 21) return { label: "Active",  dot: "var(--hall-warn)",   text: "var(--hall-warn)" };
  if (days <= 35) return { label: "Cold",    dot: "var(--hall-info)",   text: "var(--hall-info)" };
  return              { label: "Dormant", dot: "var(--hall-muted-3)", text: "var(--hall-muted-3)" };
}

const STAGE_STYLES: Record<string, { bg: string; color: string }> = {
  "Discovery":  { bg: "var(--hall-info-soft)", color: "var(--hall-info)" },
  "Validation": { bg: "var(--hall-warn-soft)", color: "var(--hall-warn)" },
  "Execution":  { bg: "var(--hall-ink-0)",     color: "var(--hall-paper-0)" },
  "Completion": { bg: "var(--hall-ok-soft)",   color: "var(--hall-ok)" },
  "On Hold":    { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" },
};

const MODE_STYLES: Record<string, { bg: string; color: string }> = {
  "Advisory":    { bg: "var(--hall-fill-soft)", color: "var(--hall-ink-0)" },
  "Embedded":    { bg: "var(--hall-ink-0)",     color: "var(--hall-paper-0)" },
  "Consulting":  { bg: "var(--hall-info-soft)", color: "var(--hall-info)" },
  "Partnership": { bg: "var(--hall-ok-soft)",   color: "var(--hall-ok)" },
};

export default async function WorkroomsPage() {
  await requireAdmin();

  const allProjects = await getProjectsOverview();
  const projects    = allProjects.filter(p => p.primaryWorkspace === "workroom");

  const withBlockers   = projects.filter(p => p.blockerCount > 0);
  const needsUpdate    = projects.filter(p => p.updateNeeded);
  const staleCount     = projects.filter(p => daysSince(p.lastUpdate) > 30).length;
  const executionCount = projects.filter(p => p.stage === "Execution").length;

  const todayLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* K-v2 thin header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PORTFOLIO · CLIENT ENGAGEMENTS ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{todayLabel}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              The Workrooms
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}
          >
            <span>
              <b style={{ color: "var(--hall-ink-0)" }}>{projects.length}</b> ACTIVE
            </span>
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <span>
              <b style={{ color: "var(--hall-ok)" }}>{executionCount}</b> IN EXEC
            </span>
          </div>
        </header>

        <div className="px-9 py-7 max-w-7xl space-y-6">

          {/* P1 banner */}
          {(withBlockers.length > 0 || needsUpdate.length > 0) && (
            <div
              className="flex items-center gap-3 px-5 py-3.5"
              style={{
                background: "var(--hall-danger-soft)",
                border: "1px solid var(--hall-danger)",
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: "var(--hall-danger)" }} />
              <p className="text-sm flex-1 min-w-0" style={{ color: "var(--hall-ink-0)" }}>
                {withBlockers.length > 0 && (
                  <><strong>{withBlockers.length} blocker{withBlockers.length !== 1 ? "s" : ""}</strong>
                  {" — "}{withBlockers.slice(0, 2).map(p => p.name).join(", ")}</>
                )}
                {needsUpdate.length > 0 && (
                  <>{withBlockers.length > 0 ? " · " : ""}
                  <strong>{needsUpdate.length} update{needsUpdate.length !== 1 ? "s" : ""} pending</strong></>
                )}
              </p>
              <Link
                href="/admin/decisions"
                className="shrink-0 whitespace-nowrap"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "var(--hall-danger)",
                }}
              >
                View decisions →
              </Link>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="px-5 py-4" style={{ border: "1px solid var(--hall-line)" }}>
              <p
                className="mb-2"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--hall-muted-2)",
                }}
              >
                Workrooms
              </p>
              <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{projects.length}</p>
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>Active client engagements</p>
            </div>
            <div className="px-5 py-4" style={{ border: "1px solid var(--hall-line)" }}>
              <p
                className="mb-2"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--hall-muted-2)",
                }}
              >
                In Execution
              </p>
              <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-ok)" }}>{executionCount}</p>
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>Delivering now</p>
            </div>
            <div className="px-5 py-4" style={{ border: "1px solid var(--hall-line)" }}>
              <p
                className="mb-2"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--hall-muted-2)",
                }}
              >
                Blockers
              </p>
              {withBlockers.length > 0
                ? <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-danger)" }}>{withBlockers.length}</p>
                : <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-muted-3)" }}>0</p>
              }
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>
                {withBlockers.length > 0 ? "Need attention" : "All clear"}
              </p>
            </div>
            <div className="px-5 py-4" style={{ border: "1px solid var(--hall-line)" }}>
              <p
                className="mb-2"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--hall-muted-2)",
                }}
              >
                Stale
              </p>
              {staleCount > 0
                ? <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-warn)" }}>{staleCount}</p>
                : <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-muted-3)" }}>0</p>
              }
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>30+ days no update</p>
            </div>
          </div>

          {/* Project cards grid */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => {
                const days   = daysSince(p.lastUpdate);
                const warmth = warmthLabel(days);
                const stageStyle = p.stage ? STAGE_STYLES[p.stage] : undefined;
                const modeStyle = p.workroomMode ? MODE_STYLES[p.workroomMode] : undefined;

                const accentBar = p.blockerCount > 0
                  ? "var(--hall-danger)"
                  : p.updateNeeded
                  ? "var(--hall-warn)"
                  : "var(--hall-ok)";

                return (
                  <Link
                    key={p.id}
                    href={`/admin/projects/${p.id}`}
                    className="group transition-all duration-200 hover:-translate-y-0.5"
                    style={{ border: "1px solid var(--hall-line)", background: "var(--hall-paper-0)" }}
                  >
                    {/* Top accent bar */}
                    <div style={{ height: 4, background: accentBar }} />

                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold tracking-tight leading-snug truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                          {p.geography.length > 0 && (
                            <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--hall-muted-2)" }}>
                              {p.geography.slice(0, 2).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: warmth.dot }} />
                          <span
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 10,
                              fontWeight: 700,
                              color: warmth.text,
                            }}
                          >
                            {warmth.label}
                          </span>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {p.stage && (
                          <span
                            className="px-2 py-0.5 rounded-full"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 9.5,
                              fontWeight: 700,
                              background: stageStyle?.bg ?? "var(--hall-fill-soft)",
                              color: stageStyle?.color ?? "var(--hall-muted-2)",
                            }}
                          >
                            {p.stage}
                          </span>
                        )}
                        {p.workroomMode && (
                          <span
                            className="px-2 py-0.5 rounded-full"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 9.5,
                              fontWeight: 700,
                              background: modeStyle?.bg ?? "var(--hall-fill-soft)",
                              color: modeStyle?.color ?? "var(--hall-muted-3)",
                            }}
                          >
                            {p.workroomMode}
                          </span>
                        )}
                        {p.engagementStage && (
                          <span
                            className="px-2 py-0.5 rounded-full"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 9.5,
                              fontWeight: 700,
                              background: "var(--hall-fill-soft)",
                              color: "var(--hall-muted-3)",
                            }}
                          >
                            {p.engagementStage}
                          </span>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-2 mb-4">
                        {[
                          { label: "Evidence",  val: p.evidenceCount,  color: "var(--hall-ink-0)" },
                          { label: "Validated", val: p.validatedCount, color: "var(--hall-ink-0)" },
                          { label: "Sources",   val: p.sourcesCount,   color: "var(--hall-ink-0)" },
                          { label: "Decisions", val: p.decisionCount,  color: p.decisionCount > 0 ? "var(--hall-warn)" : "var(--hall-ink-0)" },
                        ].map(s => (
                          <div key={s.label}>
                            <p
                              className="mb-0.5"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 9,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--hall-muted-2)",
                              }}
                            >
                              {s.label}
                            </p>
                            <p className="text-[13px] font-bold" style={{ color: s.color }}>{s.val}</p>
                          </div>
                        ))}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                        <div className="flex items-center gap-3">
                          {p.blockerCount > 0 && (
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--hall-danger)",
                              }}
                            >
                              ↯ {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {p.updateNeeded && (
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--hall-warn)",
                              }}
                            >
                              ! Update needed
                            </span>
                          )}
                          {!p.blockerCount && !p.updateNeeded && (
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                color: "var(--hall-muted-3)",
                              }}
                            >
                              {p.lastUpdate
                                ? `Updated ${new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                                : "No update logged"
                              }
                            </span>
                          )}
                        </div>
                        <span
                          className="text-sm transition-colors"
                          style={{ color: "var(--hall-muted-3)" }}
                        >
                          →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div
              className="p-12 text-center"
              style={{ border: "1px solid var(--hall-line)" }}
            >
              <p className="text-sm font-bold mb-2" style={{ color: "var(--hall-muted-3)" }}>No workroom projects found</p>
              <p className="text-xs" style={{ color: "var(--hall-muted-3)" }}>
                Assign a project&apos;s <strong>Primary Workspace</strong> to <strong>workroom</strong> in Notion to see it here.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
