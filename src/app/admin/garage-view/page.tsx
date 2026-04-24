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

const STAGE_STYLES: Record<string, { bg: string; color: string; border?: string }> = {
  "Pre-seed":   { bg: "var(--hall-fill-soft)", color: "var(--hall-ink-0)" },
  "Seed":       { bg: "var(--hall-info-soft)", color: "var(--hall-info)" },
  "Series A":   { bg: "var(--hall-ink-0)",     color: "var(--hall-paper-0)" },
  "Series B":   { bg: "var(--hall-ink-0)",     color: "var(--hall-paper-0)" },
  "Discovery":  { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-2)" },
  "Validation": { bg: "var(--hall-warn-soft)", color: "var(--hall-warn)" },
  "Execution":  { bg: "var(--hall-ok-soft)",   color: "var(--hall-ok)" },
  "On Hold":    { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" },
};

export default async function GarageViewPage() {
  await requireAdmin();

  const allProjects = await getProjectsOverview();
  const projects    = allProjects.filter(p => p.primaryWorkspace === "garage");

  const withBlockers   = projects.filter(p => p.blockerCount > 0);
  const needsUpdate    = projects.filter(p => p.updateNeeded);
  const totalEvidence  = projects.reduce((sum, p) => sum + p.evidenceCount, 0);
  const totalValidated = projects.reduce((sum, p) => sum + p.validatedCount, 0);

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
              PORTFOLIO · STARTUPS ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{todayLabel}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              The Garage
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}
          >
            <span>
              <b style={{ color: "var(--hall-ink-0)" }}>{projects.length}</b> STARTUPS
            </span>
            <span style={{ color: "var(--hall-muted-3)" }}>·</span>
            <span>
              <b style={{ color: "var(--hall-ok)" }}>{totalValidated}</b> VALIDATED
            </span>
          </div>
        </header>

        <div className="px-9 py-7 max-w-7xl space-y-6">

          {/* P1 banner */}
          {withBlockers.length > 0 && (
            <div
              className="flex items-center gap-3 px-5 py-3.5"
              style={{
                background: "var(--hall-danger-soft)",
                border: "1px solid var(--hall-danger)",
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: "var(--hall-danger)" }} />
              <p className="text-sm flex-1 min-w-0" style={{ color: "var(--hall-ink-0)" }}>
                <strong>{withBlockers.length} blocker{withBlockers.length !== 1 ? "s" : ""}</strong>
                {" — "}{withBlockers.slice(0, 2).map(p => p.name).join(", ")}
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
                Portfolio
              </p>
              <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{projects.length}</p>
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>Active startups</p>
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
                Total evidence
              </p>
              <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{totalEvidence}</p>
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>{totalValidated} validated</p>
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
                {withBlockers.length > 0 ? "Need attention" : "Portfolio clear"}
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
                Pending updates
              </p>
              {needsUpdate.length > 0
                ? <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-warn)" }}>{needsUpdate.length}</p>
                : <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--hall-muted-3)" }}>0</p>
              }
              <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>Status updates due</p>
            </div>
          </div>

          {/* Startup cards grid */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => {
                const activityDate = [p.lastUpdate, p.lastEvidenceDate, p.lastMeetingDate].filter(Boolean).sort().pop() ?? null;
                const days    = daysSince(activityDate);
                const warmth  = warmthLabel(days);
                const stageStyle = p.stage ? STAGE_STYLES[p.stage] : undefined;

                const accentBar = p.blockerCount > 0
                  ? "var(--hall-danger)"
                  : p.updateNeeded
                  ? "var(--hall-warn)"
                  : "var(--hall-ok)";

                return (
                  <Link
                    key={p.id}
                    href={`/admin/garage/${p.id}`}
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
                        {p.themes.slice(0, 2).map(t => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 9.5,
                              fontWeight: 700,
                              background: "var(--hall-fill-soft)",
                              color: "var(--hall-muted-3)",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>

                      {/* Status snapshot */}
                      {p.statusSummary ? (
                        <p className="text-[11px] leading-relaxed mb-4 line-clamp-2" style={{ color: "var(--hall-muted-2)" }}>
                          {p.statusSummary}
                        </p>
                      ) : (
                        <p className="text-[11px] italic mb-4" style={{ color: "var(--hall-muted-3)" }}>No status logged yet.</p>
                      )}

                      {/* Current focus + next milestone */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="px-3 py-2.5" style={{ background: "var(--hall-fill-soft)" }}>
                          <p
                            className="mb-1"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 9,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: "var(--hall-muted-2)",
                            }}
                          >
                            Current focus
                          </p>
                          <p className="text-[11px] font-medium leading-snug line-clamp-2" style={{ color: "var(--hall-ink-0)" }}>
                            {p.hallCurrentFocus || <span style={{ color: "var(--hall-muted-3)", fontStyle: "italic" }}>—</span>}
                          </p>
                        </div>
                        <div className="px-3 py-2.5" style={{ background: "var(--hall-fill-soft)" }}>
                          <p
                            className="mb-1"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 9,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: "var(--hall-muted-2)",
                            }}
                          >
                            Next milestone
                          </p>
                          <p className="text-[11px] font-medium leading-snug line-clamp-2" style={{ color: "var(--hall-ink-0)" }}>
                            {p.hallNextMilestone || <span style={{ color: "var(--hall-muted-3)", fontStyle: "italic" }}>—</span>}
                          </p>
                        </div>
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
              <p className="text-sm font-bold mb-2" style={{ color: "var(--hall-muted-3)" }}>No garage projects found</p>
              <p className="text-xs" style={{ color: "var(--hall-muted-3)" }}>
                Assign a project&apos;s <strong>Primary Workspace</strong> to <strong>garage</strong> in Notion to see it here.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
