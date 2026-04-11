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

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { ProjectAvatar } from "@/components/ProjectAvatar";
import { getProjectsOverview, getAllSources } from "@/lib/notion";
import { isAdminUser, getStaffProjectIds } from "@/lib/clients";
import { NAV } from "../page";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function sourceIcon(type: string): string {
  if (type.includes("Email") || type.includes("Gmail")) return "✉";
  if (type.includes("Meeting") || type.includes("Fireflies")) return "◷";
  return "▤";
}

export default async function MyRoomsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAdminUser(userId)) redirect("/hall");

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";

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
  const staleProjects  = queueSource.filter(p => !p.updateNeeded && p.blockerCount === 0 && daysSince(p.lastUpdate) > 30);
  const healthyInMine  = myProjects.filter(
    p => p.blockerCount === 0 && !p.updateNeeded && daysSince(p.lastUpdate) <= 30
  );

  const queueCount = withBlockers.length + needsUpdate.length + staleProjects.length;

  // ── What's moving: sources from last 14 days ─────────────────────────────
  const projectById = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const recentSources = allSources
    .filter(s => s.dateIngested && daysSince(s.dateIngested) <= 14)
    .slice(0, 12)
    .map(s => ({ ...s, projectName: (s.projectId && projectById[s.projectId]) || "—" }));

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
                  Control Room · My Rooms
                </p>
                <span className="text-[#131218]/15">·</span>
                <p className="text-[10px] font-bold text-[#B2FF59] bg-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest">
                  Personal lens
                </p>
              </div>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">My Rooms</h1>
              <p className="text-sm text-[#131218]/40 mt-1.5 font-medium">What belongs to you. What needs to move next.</p>
            </div>
            <p className="text-xs text-[#131218]/30 font-medium pb-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Ownership setup prompt — shown when ADMIN_STAFF_REGISTRY is not configured */}
          {!ownershipReady && (
            <div className="bg-[#131218] rounded-2xl px-6 py-5">
              <div className="flex items-start gap-4">
                <span className="text-[#B2FF59] text-lg shrink-0 mt-0.5">◈</span>
                <div>
                  <p className="text-sm font-bold text-white tracking-tight">Ownership not configured</p>
                  <p className="text-xs text-white/40 mt-1 leading-relaxed">
                    My Rooms shows your projects and queue. Add your email and project IDs to{" "}
                    <code className="text-[#B2FF59] text-[11px] font-mono">ADMIN_STAFF_REGISTRY</code>{" "}
                    in <code className="text-[#B2FF59] text-[11px] font-mono">src/lib/clients.ts</code>.
                  </p>
                  <p className="text-[10px] text-white/20 font-mono mt-2">{email}</p>
                </div>
              </div>
            </div>
          )}

          {/* My Projects — only shown when ownership is configured */}
          {ownershipReady && myProjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">My Projects</p>
                  <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">Projects you lead</p>
                </div>
                <span className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                  {myProjects.length} project{myProjects.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {myProjects.map(p => (
                  <Link
                    key={p.id}
                    href={`/admin/projects/${p.id}`}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors group"
                  >
                    <ProjectAvatar name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#131218] truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {p.blockerCount > 0 && (
                          <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest">
                            {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        {p.updateNeeded && p.blockerCount === 0 && (
                          <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Update needed</span>
                        )}
                        {!p.blockerCount && !p.updateNeeded && p.lastUpdate && (
                          <span className="text-[9px] text-[#131218]/25 font-medium">
                            {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusBadge value={p.stage} />
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Your Queue */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className={`h-1 ${queueCount > 0 ? "bg-amber-400" : "bg-[#B2FF59]"}`} />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Your Queue</p>
                <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">
                  {ownershipReady ? "Action items in your projects" : "Action items across all projects"}
                </p>
              </div>
              {queueCount > 0 ? (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {queueCount} item{queueCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-[10px] font-bold bg-[#B2FF59] text-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest">
                  Clear
                </span>
              )}
            </div>

            {queueCount === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-[#131218]/30 font-medium">All projects are healthy. Nothing urgent in your queue.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#EFEFEA]">

                {/* Blocked */}
                {withBlockers.map(p => (
                  <Link
                    key={`b-${p.id}`}
                    href={`/admin/projects/${p.id}`}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors group"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#131218] truncate">{p.name}</p>
                      <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-0.5">
                        {p.blockerCount} blocker{p.blockerCount > 1 ? "s" : ""} — unblock this
                      </p>
                    </div>
                    <StatusBadge value={p.stage} />
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                  </Link>
                ))}

                {/* Needs update */}
                {needsUpdate.map(p => {
                  const days = daysSince(p.lastUpdate);
                  return (
                    <Link
                      key={`u-${p.id}`}
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors group"
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#131218] truncate">{p.name}</p>
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-0.5">
                          Status update needed · {days < 999 ? `${days}d ago` : "no recent update"}
                        </p>
                      </div>
                      <StatusBadge value={p.stage} />
                      <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                    </Link>
                  );
                })}

                {/* Stale */}
                {staleProjects.map(p => {
                  const days = daysSince(p.lastUpdate);
                  return (
                    <Link
                      key={`s-${p.id}`}
                      href={`/admin/projects/${p.id}`}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors group"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#131218]/20 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#131218] truncate">{p.name}</p>
                        <p className="text-[10px] text-[#131218]/35 font-bold uppercase tracking-widest mt-0.5">
                          No activity · {days < 999 ? `${days}d ago` : "unknown"}
                        </p>
                      </div>
                      <StatusBadge value={p.stage} />
                      <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                    </Link>
                  );
                })}

              </div>
            )}
          </div>

          {/* What's Moving — recent sources from last 14 days */}
          {recentSources.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#131218]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">What&apos;s Moving</p>
                <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">Source activity — last 14 days</p>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {recentSources.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-6 py-3">
                    <span className="text-[11px] text-[#131218]/25 shrink-0 w-4">{sourceIcon(s.sourceType)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#131218] truncate">{s.title}</p>
                      <p className="text-[10px] text-[#131218]/35 font-medium truncate mt-0.5">{s.projectName}</p>
                    </div>
                    {s.dateIngested && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-[#131218]/30 font-medium">
                          {new Date(s.dateIngested).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                        <p className="text-[9px] text-[#131218]/20 font-medium">
                          {daysSince(s.dateIngested)}d ago
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentSources.length === 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#131218]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">What&apos;s Moving</p>
                <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">Source activity — last 14 days</p>
              </div>
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-[#131218]/25 font-medium">No new sources in the last 14 days.</p>
              </div>
            </div>
          )}

          {/* Other Rooms — the rest of the portfolio (not mine) */}
          {otherProjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#EFEFEA]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
                    {ownershipReady ? "Other Rooms" : "All Rooms"}
                  </p>
                  <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">
                    {ownershipReady ? "Rest of the portfolio — for reference" : "All active projects"}
                  </p>
                </div>
                <span className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                  {otherProjects.length} project{otherProjects.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {otherProjects.map(p => (
                  <Link
                    key={p.id}
                    href={`/admin/projects/${p.id}`}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors group"
                  >
                    <ProjectAvatar name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#131218] truncate">{p.name}</p>
                      {p.lastUpdate && (
                        <p className="text-[10px] text-[#131218]/25 font-medium mt-0.5">
                          Updated {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                    </div>
                    <StatusBadge value={p.stage} />
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
