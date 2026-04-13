import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getAllPeople, getProjectsOverview, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function warmthLabel(days: number): { label: string; dot: string; text: string } {
  if (days <= 3)  return { label: "Hot",     dot: "bg-red-500",        text: "text-red-600" };
  if (days <= 14) return { label: "Warm",    dot: "bg-amber-400",      text: "text-amber-600" };
  if (days <= 30) return { label: "Active",  dot: "bg-amber-300",      text: "text-amber-500" };
  if (days <= 60) return { label: "Cold",    dot: "bg-blue-400",       text: "text-blue-500" };
  return              { label: "Dormant", dot: "bg-[#131218]/15",   text: "text-[#131218]/35" };
}

const INVESTOR_ROLES = ["Investor", "Angel", "VC", "LP", "Fund", "Funder", "Backer", "Grant Funder", "Grant Maker", "Impact Investor"];

export default async function InvestorsPage() {
  await requireAdmin();

  const [people, allProjects, decisions] = await Promise.all([
    getAllPeople(),
    getProjectsOverview(),
    getDecisionItems(),
  ]);

  // Filter people with investor-type roles
  const investors = people.filter(p =>
    p.roles.some(r => INVESTOR_ROLES.some(ir => r.toLowerCase().includes(ir.toLowerCase())))
  );

  // Garage projects = fundraising-relevant
  const garageProjects = allProjects.filter(p => p.primaryWorkspace === "garage");

  // Categorise investors
  const activeCount  = investors.filter(p => p.classification === "External").length;
  const internalInvestors = investors.filter(p => p.classification === "Internal");

  // Investor-related open decisions (category or keyword match)
  const investorDecisions = decisions.filter(d => {
    const combined = `${d.title} ${d.notes} ${d.category ?? ""}`.toLowerCase();
    return (
      d.status !== "Approved" && d.status !== "Rejected" && d.status !== "Executed" &&
      (d.category === "Investment" ||
       combined.includes("investor") || combined.includes("cap table") ||
       combined.includes("raise") || combined.includes("valuation") ||
       combined.includes("term sheet") || combined.includes("safe") ||
       combined.includes("pitch") || combined.includes("vc"))
    );
  });

  const urgentInvestorDecisions = investorDecisions.filter(d =>
    d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
  );

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Investor relations
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Investor <em className="font-black italic text-[#c8f55a]">Match</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Active investors, funders y angels en la red CH — matched a portfolio startups.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{investors.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Investors</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-[#B2FF59] tracking-tight leading-none">{garageProjects.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Startups</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-7xl space-y-6">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Network investors</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{investors.length}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Investors + funders in CH People</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">External investors</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{activeCount}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Outside network</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Portfolio startups</p>
              <p className="text-3xl font-bold text-[#B2FF59] bg-[#131218] w-fit px-3 py-0.5 rounded-xl tracking-tight">{garageProjects.length}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Raising or investor-ready</p>
            </div>
          </div>

          {/* Two-column: investors + portfolio */}
          <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

            {/* Investors table */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">All investors</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{investors.length}</p>
              </div>

              {investors.length > 0 ? (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="grid grid-cols-[2fr_1fr_1fr_100px] px-5 py-2.5 border-b border-[#EFEFEA]">
                    {["Name", "Role", "Location", "Type"].map(h => (
                      <p key={h} className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">{h}</p>
                    ))}
                  </div>

                  <div className="divide-y divide-[#EFEFEA]">
                    {investors.map(p => {
                      const investorRole = p.roles.find(r => INVESTOR_ROLES.some(ir => r.toLowerCase().includes(ir.toLowerCase())));
                      return (
                        <div key={p.id} className="grid grid-cols-[2fr_1fr_1fr_100px] px-5 py-3 items-center hover:bg-[#EFEFEA]/50 transition-colors">
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[#131218] truncate">{p.name}</p>
                            {p.jobTitle && (
                              <p className="text-[9.5px] text-[#131218]/40 truncate mt-0.5">{p.jobTitle}</p>
                            )}
                          </div>
                          <p className="text-[10px] text-[#131218]/50 font-medium truncate">
                            {investorRole || "—"}
                          </p>
                          <p className="text-[10px] text-[#131218]/40 truncate">
                            {p.location || "—"}
                          </p>
                          <div>
                            <span className={`inline-block text-[8px] font-bold px-2 py-0.5 rounded-full ${
                              p.classification === "Internal"
                                ? "bg-[#131218] text-[#B2FF59]"
                                : "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]"
                            }`}>
                              {p.classification || "—"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-5 py-2.5 border-t border-[#EFEFEA]">
                    <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">
                      {investors.length} investor{investors.length !== 1 ? "s" : ""} in network
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] p-10 text-center">
                  <p className="text-sm text-[#131218]/25">
                    No investors found. Add &ldquo;Investor&rdquo; to someone&apos;s Relationship Roles in CH People to see them here.
                  </p>
                </div>
              )}
            </div>

            {/* Portfolio startups sidebar */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Portfolio</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{garageProjects.length}</p>
              </div>

              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="divide-y divide-[#EFEFEA]">
                  {garageProjects.map(p => {
                    const days   = daysSince(p.lastUpdate);
                    const warmth = warmthLabel(days);
                    return (
                      <Link
                        key={p.id}
                        href={`/admin/projects/${p.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[#EFEFEA]/40 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11.5px] font-bold text-[#131218] truncate">{p.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${warmth.dot}`} />
                            <span className={`text-[9px] font-semibold ${warmth.text}`}>{warmth.label}</span>
                            {p.stage && (
                              <span className="text-[9px] text-[#131218]/30">· {p.stage}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-bold text-[#131218]/40">{p.validatedCount} val.</p>
                          {p.blockerCount > 0 && (
                            <p className="text-[8px] font-bold text-red-500">↯</p>
                          )}
                        </div>
                        <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                      </Link>
                    );
                  })}
                  {garageProjects.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-[11px] text-[#131218]/25 font-medium">No garage projects</p>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-[#EFEFEA]">
                  <Link href="/admin/garage-view" className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 transition-colors uppercase tracking-widest">
                    Open Garage →
                  </Link>
                </div>
              </div>

              {/* Internal investors note */}
              {internalInvestors.length > 0 && (
                <div className="mt-4 bg-white rounded-2xl border border-[#E0E0D8] px-4 py-3">
                  <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">CH Internal</p>
                  {internalInvestors.map(p => (
                    <div key={p.id} className="flex items-center gap-2 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B2FF59] shrink-0" />
                      <p className="text-[11px] font-semibold text-[#131218]">{p.name}</p>
                      <p className="text-[9px] text-[#131218]/40 truncate">{p.jobTitle}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Cap table placeholder */}
              <div className="mt-4 bg-white rounded-2xl border border-[#E0E0D8] px-4 py-4">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Cap Table</p>
                <p className="text-[11px] text-[#131218]/50 leading-snug mb-3">
                  Cap table data is maintained in Notion. Entries added via the{" "}
                  <code className="text-[10px] bg-[#EFEFEA] px-1 rounded">upsert-captable-entry</code> skill.
                </p>
                <a
                  href="https://notion.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[9px] font-bold bg-[#131218] text-[#B2FF59] px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Open Cap Table in Notion →
                </a>
                <p className="text-[8.5px] text-[#131218]/25 mt-2">
                  Investor-matching pipeline: deal-flow-agent
                </p>
              </div>
            </div>

          </div>

          {/* Investor decisions section */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Investor decisions</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              {investorDecisions.length > 0 && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${urgentInvestorDecisions.length > 0 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                  {investorDecisions.length}
                </span>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="divide-y divide-[#EFEFEA]">
                {investorDecisions.slice(0, 6).map(d => (
                  <Link key={d.id} href="/admin/decisions" className="flex items-start gap-3 px-5 py-3 hover:bg-[#EFEFEA]/40 transition-colors">
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
                        {d.dueDate && ` · Due ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                      </p>
                    </div>
                  </Link>
                ))}
                {investorDecisions.length === 0 && (
                  <div className="px-5 py-6 text-center">
                    <p className="text-[11px] text-[#131218]/25 font-medium">No open investor decisions</p>
                    <p className="text-[9px] text-[#131218]/20 mt-1">Decisions mentioning investors, raises, or cap table appear here</p>
                  </div>
                )}
              </div>
              <div className="px-5 py-2.5 border-t border-[#EFEFEA]">
                <Link href="/admin/decisions" className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 transition-colors uppercase tracking-widest">
                  All decisions →
                </Link>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
