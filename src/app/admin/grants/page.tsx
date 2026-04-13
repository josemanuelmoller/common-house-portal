import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

const GRANT_THEMES = ["Grant", "Funding", "Innovation Fund", "EU", "Public Funding", "Impact Finance", "Impact Investing", "Green Finance"];

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default async function GrantsPage() {
  await requireAdmin();

  const [allProjects, decisions] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems(),
  ]);

  // Projects explicitly marked as grant-eligible in Notion
  const grantProjects = allProjects.filter(p => p.grantEligible === true);

  // Decisions categorised as Grants in Notion
  const grantDecisions = decisions.filter(d => d.category === "Grants");

  const urgentGrant = grantDecisions.filter(d =>
    d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
  );
  const withDeadlines = grantDecisions.filter(d => d.dueDate);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Funding
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Grants &amp; <em className="font-black not-italic text-[#B2FF59]">Funding</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Grant opportunities, applications, and public funding pipeline.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{grantProjects.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Eligible</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${urgentGrant.length > 0 ? "text-red-400" : "text-[#B2FF59]"}`}>
                  {grantDecisions.length}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Open items</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-6xl space-y-6">

          {/* P1 deadline banner */}
          {(urgentGrant.length > 0 || withDeadlines.length > 0) && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                {urgentGrant.length > 0 && (
                  <><strong>{urgentGrant.length} urgent</strong>{" — "}{urgentGrant[0].title}</>
                )}
                {withDeadlines.length > 0 && (
                  <>{urgentGrant.length > 0 ? " · " : ""}
                  <strong>{withDeadlines.length} deadline{withDeadlines.length !== 1 ? "s" : ""}</strong>
                  {" — "}{withDeadlines[0].dueDate
                    ? `${withDeadlines[0].title} closes ${new Date(withDeadlines[0].dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                    : withDeadlines[0].title
                  }</>
                )}
              </p>
              <Link href="/admin/decisions" className="text-[11px] font-bold text-red-600 shrink-0 hover:text-red-800 transition-colors whitespace-nowrap">
                Review →
              </Link>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Projects with funding scope</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{grantProjects.length}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Eligible for grant applications</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Open decisions</p>
              {grantDecisions.length > 0
                ? <p className="text-3xl font-bold text-amber-500 tracking-tight">{grantDecisions.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Applications / approvals pending</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">With deadlines</p>
              {withDeadlines.length > 0
                ? <p className="text-3xl font-bold text-red-500 tracking-tight">{withDeadlines.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Time-sensitive applications</p>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* Grant-eligible projects */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Eligible projects</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{grantProjects.length}</p>
              </div>

              {grantProjects.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {grantProjects.map(p => {
                    const days = daysSince(p.lastUpdate);
                    return (
                      <Link
                        key={p.id}
                        href={`/admin/projects/${p.id}`}
                        className="group bg-white rounded-xl border border-[#E0E0D8] px-5 py-3.5 hover:border-[#131218]/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-bold text-[#131218] truncate">{p.name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {p.themes.filter(t => GRANT_THEMES.some(g => t.toLowerCase().includes(g.toLowerCase()))).slice(0, 3).map(t => (
                              <span key={t} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#B2FF59]/20 text-green-800">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-semibold text-[#131218]/50">
                            {p.stage || "—"}
                          </p>
                          <p className="text-[9px] text-[#131218]/25 mt-0.5">
                            {days < 999
                              ? `${days}d ago`
                              : "No update"
                            }
                          </p>
                        </div>
                        <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors">→</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] p-8 text-center">
                  <p className="text-sm text-[#131218]/25">
                    No grant-eligible projects found. Enable the &ldquo;Grant Eligible&rdquo; checkbox on a project in Notion to include it here.
                  </p>
                </div>
              )}
            </div>

            {/* Grant decisions */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Open items</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                {grantDecisions.length > 0 && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{grantDecisions.length}</span>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="divide-y divide-[#EFEFEA]">
                  {grantDecisions.slice(0, 8).map(d => (
                    <Link key={d.id} href="/admin/decisions" className="flex items-start gap-3 px-4 py-3 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                          ? "bg-red-100" : "bg-[#EFEFEA]"
                      }`}>
                        <span className={`text-[8px] font-bold ${
                          d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                            ? "text-red-600" : "text-[#131218]/30"
                        }`}>
                          {d.priority?.startsWith("P1") || d.priority === "Urgent" ? "P1" : "·"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-[#131218] leading-snug line-clamp-2">{d.title}</p>
                        <p className="text-[9px] text-[#131218]/35 mt-0.5">
                          {d.decisionType || "Decision"}
                          {d.dueDate && ` · Closes ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {grantDecisions.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-[11px] text-[#131218]/25 font-medium">No open grant decisions</p>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-[#EFEFEA]">
                  <Link href="/admin/decisions" className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 transition-colors uppercase tracking-widest">
                    All decisions →
                  </Link>
                </div>
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
