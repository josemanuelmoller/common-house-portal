/**
 * Control Room — My Rooms.
 *
 * Personal lens for the Common House team member. Surfaces:
 *   - My projects: filtered by ADMIN_STAFF_REGISTRY in clients.ts
 *   - My queue: blockers, stale, updates needed within my projects
 *   - What's moving: recent source activity from the last 14 days
 *   - Other rooms: the rest of the portfolio for reference
 *
 * Ownership model: ADMIN_STAFF_REGISTRY in src/lib/clients.ts.
 * Maps staff email → Notion project IDs they lead.
 * No Notion schema change required. Populate before use.
 * When registry is empty for this user, a setup prompt is shown instead.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { ProjectAvatar } from "@/components/ProjectAvatar";
import { getProjectsOverview, getAllSources } from "@/lib/notion";
import { getStaffProjectIds } from "@/lib/clients";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/** Best available activity signal: last status update OR last evidence OR last meeting */
function bestActivity(p: { lastUpdate: string | null; lastEvidenceDate?: string | null; lastMeetingDate?: string | null }): string | null {
  return [p.lastUpdate, p.lastEvidenceDate ?? null, p.lastMeetingDate ?? null]
    .filter(Boolean)
    .sort()
    .pop() ?? null;
}

function sourceIcon(type: string): string {
  if (type.includes("Email") || type.includes("Gmail")) return "✉";
  if (type.includes("Meeting") || type.includes("Fireflies")) return "◷";
  return "▤";
}

export default async function MyRoomsPage() {
  const user = await requireAdmin();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const [projects, allSources] = await Promise.all([
    getProjectsOverview(),
    getAllSources(),
  ]);

  // ── Ownership model ───────────────────────────────────────────────────────
  // Reads ADMIN_STAFF_REGISTRY in clients.ts.
  // If empty for this user: show setup prompt, no fake "all = mine" display.
  const myProjectIds   = getStaffProjectIds(email);
  const ownershipReady = myProjectIds.length > 0;
  const myProjects     = ownershipReady ? projects.filter(p => myProjectIds.includes(p.id)) : [];
  const otherProjects  = ownershipReady ? projects.filter(p => !myProjectIds.includes(p.id)) : projects;

  // ── My queue: only within my assigned projects ────────────────────────────
  const queueSource    = ownershipReady ? myProjects : projects;
  const withBlockers   = queueSource.filter(p => p.blockerCount > 0);
  const needsUpdate    = queueSource.filter(p => p.updateNeeded && p.blockerCount === 0);
  const staleProjects  = queueSource.filter(p => { const d = daysSince(bestActivity(p)); return !p.updateNeeded && p.blockerCount === 0 && d !== null && d > 30; });
  const healthyInMine  = myProjects.filter(p => {
    const d = daysSince(bestActivity(p));
    return p.blockerCount === 0 && !p.updateNeeded && d !== null && d <= 30;
  });

  const queueCount = withBlockers.length + needsUpdate.length + staleProjects.length;

  // ── What's moving: sources from last 14 days ─────────────────────────────
  const projectById = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const recentSources = allSources
    .filter(s => s.dateIngested && (daysSince(s.dateIngested) ?? Infinity) <= 14)
    .slice(0, 12)
    .map(s => ({ ...s, projectName: (s.projectId && projectById[s.projectId]) || "—" }));

  const todayLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 md:ml-[228px] overflow-auto"
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
              CONTROL ROOM · MY ROOMS ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{todayLabel}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              My Rooms
            </h1>
          </div>
        </header>

        <div className="px-8 py-6 space-y-6">

          {/* Ownership setup prompt — shown when ADMIN_STAFF_REGISTRY is not configured */}
          {!ownershipReady && (
            <div className="px-6 py-5" style={{ background: "var(--hall-warn-paper)", border: "1px solid var(--hall-warn)" }}>
              <div className="flex items-start gap-4">
                <span className="text-lg shrink-0 mt-0.5" style={{ color: "var(--hall-warn)" }}>◈</span>
                <div>
                  <p className="text-sm font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>Ownership not configured</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>
                    My Rooms shows your projects and queue. Add your email and project IDs to{" "}
                    <code className="text-[11px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}>ADMIN_STAFF_REGISTRY</code>{" "}
                    in <code className="text-[11px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}>src/lib/clients.ts</code>.
                  </p>
                  <p className="text-[10px] mt-2" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}>{email}</p>
                </div>
              </div>
            </div>
          )}

          {/* My Projects — only shown when ownership is configured */}
          {ownershipReady && myProjects.length > 0 && (
            <section className="mb-7">
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                >
                  My{" "}
                  <em
                    style={{
                      fontFamily: "var(--font-hall-display)",
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    projects
                  </em>
                </h2>
                <span
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    color: "var(--hall-muted-2)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {myProjects.length} PROJECT{myProjects.length !== 1 ? "S" : ""}
                </span>
              </div>
              <ul className="flex flex-col">
                {myProjects.map(p => (
                  <li key={p.id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-4 px-1 py-3 transition-colors group"
                    >
                      <ProjectAvatar name={p.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.blockerCount > 0 && (
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--hall-danger)",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {p.updateNeeded && p.blockerCount === 0 && (
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--hall-warn)",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              Update needed
                            </span>
                          )}
                          {!p.blockerCount && !p.updateNeeded && p.lastUpdate && (
                            <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}>
                              {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge value={p.stage} />
                      <span
                        className="text-sm transition-colors"
                        style={{ color: "var(--hall-muted-3)" }}
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Your Queue */}
          <section className="mb-7">
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
              >
                Your{" "}
                <em
                  style={{
                    fontFamily: "var(--font-hall-display)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "var(--hall-ink-0)",
                  }}
                >
                  queue
                </em>
              </h2>
              {queueCount > 0 ? (
                <span
                  className="px-2.5 py-1 rounded-full"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--hall-warn)",
                    background: "var(--hall-warn-soft)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {queueCount} item{queueCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span
                  className="px-2.5 py-1 rounded-full"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--hall-ok)",
                    background: "var(--hall-ok-soft)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Clear
                </span>
              )}
            </div>

            {queueCount === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>
                  All projects are healthy. Nothing urgent in your queue.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {/* Blocked */}
                {withBlockers.map(p => (
                  <li key={`b-${p.id}`} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-4 px-1 py-3 transition-colors group"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--hall-danger)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                        <p
                          className="mt-0.5"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--hall-danger)",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                          }}
                        >
                          {p.blockerCount} blocker{p.blockerCount > 1 ? "s" : ""} — unblock this
                        </p>
                      </div>
                      <StatusBadge value={p.stage} />
                      <span className="text-sm" style={{ color: "var(--hall-muted-3)" }}>→</span>
                    </Link>
                  </li>
                ))}

                {/* Needs update */}
                {needsUpdate.map(p => {
                  const days = daysSince(bestActivity(p));
                  return (
                    <li key={`u-${p.id}`} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="flex items-center gap-4 px-1 py-3 transition-colors group"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--hall-warn)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                          <p
                            className="mt-0.5"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--hall-warn)",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Status update needed · {days !== null ? `${days}d ago` : "no activity recorded"}
                          </p>
                        </div>
                        <StatusBadge value={p.stage} />
                        <span className="text-sm" style={{ color: "var(--hall-muted-3)" }}>→</span>
                      </Link>
                    </li>
                  );
                })}

                {/* Stale */}
                {staleProjects.map(p => {
                  const days = daysSince(bestActivity(p));
                  return (
                    <li key={`s-${p.id}`} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="flex items-center gap-4 px-1 py-3 transition-colors group"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--hall-muted-3)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                          <p
                            className="mt-0.5"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--hall-muted-3)",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            No activity · {days !== null ? `${days}d ago` : "unknown"}
                          </p>
                        </div>
                        <StatusBadge value={p.stage} />
                        <span className="text-sm" style={{ color: "var(--hall-muted-3)" }}>→</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* What's Moving — recent sources from last 14 days */}
          <section className="mb-7">
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
              >
                What&apos;s{" "}
                <em
                  style={{
                    fontFamily: "var(--font-hall-display)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "var(--hall-ink-0)",
                  }}
                >
                  moving
                </em>
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  color: "var(--hall-muted-2)",
                  letterSpacing: "0.06em",
                }}
              >
                SOURCE ACTIVITY · LAST 14 DAYS
              </span>
            </div>

            {recentSources.length > 0 ? (
              <ul className="flex flex-col">
                {recentSources.map(s => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 px-1 py-3"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <span className="shrink-0 w-4" style={{ fontSize: 11, color: "var(--hall-muted-3)" }}>
                      {sourceIcon(s.sourceType)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{s.title}</p>
                      <p
                        className="truncate mt-0.5"
                        style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}
                      >
                        {s.projectName}
                      </p>
                    </div>
                    {s.dateIngested && (
                      <div className="text-right shrink-0">
                        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>
                          {new Date(s.dateIngested).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                        <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9, color: "var(--hall-muted-3)" }}>
                          {daysSince(s.dateIngested)}d ago
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No new sources in the last 14 days.</p>
              </div>
            )}
          </section>

          {/* Other Rooms — the rest of the portfolio (not mine) */}
          {otherProjects.length > 0 && (
            <section className="mb-7">
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                >
                  {ownershipReady ? "Other" : "All"}{" "}
                  <em
                    style={{
                      fontFamily: "var(--font-hall-display)",
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    rooms
                  </em>
                </h2>
                <span
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    color: "var(--hall-muted-2)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {otherProjects.length} PROJECT{otherProjects.length !== 1 ? "S" : ""}
                </span>
              </div>
              <ul className="flex flex-col">
                {otherProjects.map(p => (
                  <li key={p.id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-4 px-1 py-3 transition-colors group"
                    >
                      <ProjectAvatar name={p.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                        {p.lastUpdate && (
                          <p
                            className="mt-0.5"
                            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-3)" }}
                          >
                            Updated {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                      <StatusBadge value={p.stage} />
                      <span className="text-sm" style={{ color: "var(--hall-muted-3)" }}>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
