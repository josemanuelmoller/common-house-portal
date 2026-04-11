import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { ProjectAvatar } from "@/components/ProjectAvatar";
import { ProjectsMap } from "@/components/ProjectsMap";
import { getProjectsOverview } from "@/lib/notion";
import { isAdminUser } from "@/lib/clients";

export const NAV = [
  { label: "Home",               href: "/admin",            icon: "◈" },
  { label: "Operation System",   href: "/admin/os",         icon: "⬡" },
  { label: "Knowledge System",   href: "/admin/knowledge",  icon: "◉" },
];

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAdminUser(userId)) redirect("/dashboard");

  const projects = await getProjectsOverview();

  const totalEvidence  = projects.reduce((s, p) => s + p.evidenceCount, 0);
  const totalValidated = projects.reduce((s, p) => s + p.validatedCount, 0);
  const totalSources   = projects.reduce((s, p) => s + p.sourcesCount, 0);
  const totalBlockers  = projects.reduce((s, p) => s + p.blockerCount, 0);
  const validationRate = totalEvidence > 0
    ? Math.round((totalValidated / totalEvidence) * 100)
    : 0;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-[10px] font-bold text-[#B2FF59] bg-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest inline-block mb-3">
                Admin
              </p>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">Projects</h1>
            </div>
            <p className="text-xs text-[#131218]/30 font-medium pb-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          {/* Global stats row */}
          <div className="grid grid-cols-5 gap-px bg-[#E0E0D8] rounded-2xl overflow-hidden">
            {[
              { label: "Active Projects", value: projects.length,  },
              { label: "Sources",         value: totalSources,     },
              { label: "Evidence",        value: totalEvidence,    },
              { label: "Validated",       value: totalValidated,   },
              { label: "Validation Rate", value: `${validationRate}%`, highlight: true },
            ].map(m => (
              <div key={m.label} className="bg-white px-6 py-4">
                <p className={`text-2xl font-bold tracking-tight ${m.highlight ? "text-[#B2FF59] bg-[#131218] w-fit px-2 rounded-lg" : "text-[#131218]"}`}>
                  {m.value}
                </p>
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="px-8 pt-6">
          <div className="grid grid-cols-2 gap-6">
            <ProjectsMap projects={projects.map(p => ({ id: p.id, name: p.name, geography: p.geography }))} />
          </div>
        </div>

        {/* Projects list */}
        <div className="px-8 py-6">
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">

            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_80px_80px_80px_120px_40px] gap-0 border-b border-[#EFEFEA] px-4 py-3">
              {["Project", "Status", "Stage", "Geography", "Sources", "Evidence", "Validated", "Blockers", "Last update", ""].map(h => (
                <div key={h} className="px-2 text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
                  {h}
                </div>
              ))}
            </div>

            {/* Project rows */}
            <div className="divide-y divide-[#EFEFEA]">
              {projects.map(p => (
                <Link
                  key={p.id}
                  href={`/admin/projects/${p.id}`}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_80px_80px_80px_120px_40px] gap-0 px-4 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors group items-center"
                >
                  {/* Project name + avatar */}
                  <div className="px-2 flex items-center gap-3 min-w-0">
                    <ProjectAvatar name={p.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[#131218] text-sm tracking-tight truncate">
                        {p.name}
                      </p>
                      {p.themes.length > 0 && (
                        <p className="text-[10px] text-[#131218]/30 font-medium truncate mt-0.5">
                          {p.themes.slice(0, 2).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="px-2">
                    <StatusBadge value={p.status} />
                  </div>

                  {/* Stage */}
                  <div className="px-2">
                    <StatusBadge value={p.stage} />
                  </div>

                  {/* Geography */}
                  <div className="px-2">
                    <span className="text-xs text-[#131218]/40 font-medium">
                      {p.geography.join(", ") || "—"}
                    </span>
                  </div>

                  {/* Sources */}
                  <div className="px-2 text-center">
                    <span className="text-sm font-bold text-[#131218]">{p.sourcesCount}</span>
                  </div>

                  {/* Evidence */}
                  <div className="px-2 text-center">
                    <span className="text-sm font-bold text-[#131218]">{p.evidenceCount}</span>
                  </div>

                  {/* Validated */}
                  <div className="px-2 text-center">
                    {p.validatedCount > 0 ? (
                      <span className="inline-block bg-[#B2FF59] text-[#131218] text-xs font-bold px-2 py-0.5 rounded-full">
                        {p.validatedCount}
                      </span>
                    ) : (
                      <span className="text-[#131218]/20 text-sm">—</span>
                    )}
                  </div>

                  {/* Blockers */}
                  <div className="px-2 text-center">
                    {p.blockerCount > 0 ? (
                      <span className="inline-block bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        {p.blockerCount}
                      </span>
                    ) : (
                      <span className="text-[#131218]/15 text-sm">—</span>
                    )}
                  </div>

                  {/* Last update */}
                  <div className="px-2">
                    <span className="text-xs text-[#131218]/35 font-medium">
                      {p.lastUpdate
                        ? new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </span>
                    {p.updateNeeded && (
                      <span className="block text-[9px] font-bold text-amber-500 mt-0.5">⚠ Update needed</span>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="px-2 text-right">
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[#EFEFEA] flex items-center justify-between">
              <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                COUNT {projects.length}
              </p>
              {totalBlockers > 0 && (
                <span className="text-[10px] font-bold text-red-500">
                  ↯ {totalBlockers} active blocker{totalBlockers > 1 ? "s" : ""} across projects
                </span>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
