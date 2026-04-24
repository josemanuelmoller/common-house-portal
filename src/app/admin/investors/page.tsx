import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getAllPeople, getProjectsOverview, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function warmthLabel(days: number): { label: string; dot: string; text: string } {
  if (days <= 3)  return { label: "Hot",     dot: "var(--hall-danger)", text: "var(--hall-danger)" };
  if (days <= 14) return { label: "Warm",    dot: "var(--hall-warn)",   text: "var(--hall-warn)" };
  if (days <= 30) return { label: "Active",  dot: "var(--hall-warn)",   text: "var(--hall-warn)" };
  if (days <= 60) return { label: "Cold",    dot: "var(--hall-info)",   text: "var(--hall-info)" };
  return              { label: "Dormant", dot: "var(--hall-muted-3)", text: "var(--hall-muted-3)" };
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

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-[228px]"
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
              INVESTORS · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Investor <em className="hall-flourish">Match</em>
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>{investors.length} INVESTORS</span>
            <span>{garageProjects.length} STARTUPS</span>
          </div>
        </header>

        <div className="px-9 py-6 max-w-7xl space-y-7">

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4">
            <div
              className="px-5 py-4"
              style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
            >
              <p
                className="text-[9px] font-bold tracking-widest uppercase mb-2"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
              >
                Investors
              </p>
              <p className="text-3xl font-bold tracking-tight tabular-nums" style={{color: "var(--hall-ink-0)"}}>{investors.length}</p>
              <p className="text-[11px] font-medium mt-1.5" style={{color: "var(--hall-muted-2)"}}>In CH People network</p>
            </div>
            <div
              className="px-5 py-4"
              style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
            >
              <p
                className="text-[9px] font-bold tracking-widest uppercase mb-2"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
              >
                Portfolio startups
              </p>
              <p className="text-3xl font-bold tracking-tight tabular-nums" style={{color: "var(--hall-ink-0)"}}>{garageProjects.length}</p>
              <p className="text-[11px] font-medium mt-1.5" style={{color: "var(--hall-muted-2)"}}>Raising or investor-ready</p>
            </div>
          </div>

          {/* Two-column: investors + portfolio */}
          <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

            {/* Investors table */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  All <em className="hall-flourish">investors</em>
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  {investors.length} IN NETWORK
                </span>
              </div>

              {investors.length > 0 ? (
                <div style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    className="grid grid-cols-[2fr_1fr_1fr_100px] px-5 py-2.5"
                    style={{
                      borderBottom: "1px solid var(--hall-line-soft)",
                      background: "var(--hall-paper-1)",
                    }}
                  >
                    {["Name", "Role", "Location", "Type"].map(h => (
                      <p
                        key={h}
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                      >
                        {h}
                      </p>
                    ))}
                  </div>

                  <div>
                    {investors.map((p, idx) => {
                      const investorRole = p.roles.find(r => INVESTOR_ROLES.some(ir => r.toLowerCase().includes(ir.toLowerCase())));
                      return (
                        <div
                          key={p.id}
                          className="grid grid-cols-[2fr_1fr_1fr_100px] px-5 py-3 items-center transition-colors"
                          style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                        >
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold truncate" style={{color: "var(--hall-ink-0)"}}>{p.name}</p>
                            {p.jobTitle && (
                              <p className="text-[9.5px] truncate mt-0.5" style={{color: "var(--hall-muted-3)"}}>{p.jobTitle}</p>
                            )}
                          </div>
                          <p className="text-[10px] font-medium truncate" style={{color: "var(--hall-muted-2)"}}>
                            {investorRole || "—"}
                          </p>
                          <p className="text-[10px] truncate" style={{color: "var(--hall-muted-3)"}}>
                            {p.location || "—"}
                          </p>
                          <div>
                            <span
                              className="inline-block text-[8px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                letterSpacing: "0.06em",
                                background: p.classification === "Internal" ? "var(--hall-ink-0)" : "var(--hall-fill-soft)",
                                color: p.classification === "Internal" ? "var(--hall-paper-0)" : "var(--hall-muted-2)",
                              }}
                            >
                              {p.classification || "—"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="px-5 py-2.5"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      {investors.length} investor{investors.length !== 1 ? "s" : ""} in network
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="p-10 text-center"
                  style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
                >
                  <p className="text-sm" style={{color: "var(--hall-muted-3)"}}>
                    No investors found. Add &ldquo;Investor&rdquo; to someone&apos;s Relationship Roles in CH People to see them here.
                  </p>
                </div>
              )}
            </section>

            {/* Portfolio startups sidebar */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Portfolio
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  {garageProjects.length} STARTUPS
                </span>
              </div>

              <ul className="flex flex-col">
                {garageProjects.map((p, idx) => {
                  const days   = daysSince(p.lastUpdate);
                  const warmth = warmthLabel(days);
                  return (
                    <li
                      key={p.id}
                      style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                    >
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="flex items-center gap-3 py-3 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11.5px] font-bold truncate" style={{color: "var(--hall-ink-0)"}}>{p.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{background: warmth.dot}} />
                            <span className="text-[9px] font-semibold" style={{color: warmth.text}}>{warmth.label}</span>
                            {p.stage && (
                              <span className="text-[9px]" style={{color: "var(--hall-muted-3)"}}>· {p.stage}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className="text-[10px] font-bold tabular-nums"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                          >
                            {p.validatedCount} val.
                          </p>
                          {p.blockerCount > 0 && (
                            <p className="text-[8px] font-bold" style={{color: "var(--hall-danger)"}}>↯</p>
                          )}
                        </div>
                        <span className="transition-colors text-sm" style={{color: "var(--hall-muted-3)"}}>→</span>
                      </Link>
                    </li>
                  );
                })}
                {garageProjects.length === 0 && (
                  <li className="py-6 text-center">
                    <p className="text-[11px] font-medium" style={{color: "var(--hall-muted-3)"}}>No garage projects</p>
                  </li>
                )}
              </ul>
              <div className="pt-3 mt-2" style={{borderTop: "1px solid var(--hall-line-soft)"}}>
                <Link
                  href="/admin/garage-view"
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  OPEN GARAGE →
                </Link>
              </div>

            </section>

          </div>

          {/* Investor decisions section */}
          <section>
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{borderBottom: "1px solid var(--hall-ink-0)"}}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
              >
                Investor <em className="hall-flourish">decisions</em>
              </h2>
              {investorDecisions.length > 0 && (
                <span
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    color: urgentInvestorDecisions.length > 0 ? "var(--hall-danger)" : "var(--hall-warn)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {investorDecisions.length} OPEN
                </span>
              )}
            </div>

            <ul className="flex flex-col">
              {investorDecisions.slice(0, 6).map((d, idx) => {
                const isUrgent = d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent";
                return (
                  <li
                    key={d.id}
                    style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <Link href="/admin/decisions" className="flex items-start gap-3 py-3 transition-colors">
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          background: isUrgent ? "var(--hall-danger-soft)" : "var(--hall-fill-soft)",
                        }}
                      >
                        <span
                          className="text-[8px] font-bold"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            color: isUrgent ? "var(--hall-danger)" : "var(--hall-muted-3)",
                          }}
                        >
                          {d.priority?.startsWith("P1") || d.priority === "Urgent" ? "P1" : "·"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold leading-snug line-clamp-2" style={{color: "var(--hall-ink-0)"}}>{d.title}</p>
                        <p
                          className="text-[9px] mt-0.5"
                          style={{fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)", letterSpacing: "0.06em"}}
                        >
                          {d.decisionType || "Decision"}
                          {d.dueDate && ` · Due ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {investorDecisions.length === 0 && (
                <li className="py-6 text-center">
                  <p className="text-[11px] font-medium" style={{color: "var(--hall-muted-3)"}}>No open investor decisions</p>
                  <p className="text-[9px] mt-1" style={{color: "var(--hall-muted-3)"}}>Decisions mentioning investors, raises, or cap table appear here</p>
                </li>
              )}
            </ul>
            <div className="pt-3 mt-2" style={{borderTop: "1px solid var(--hall-line-soft)"}}>
              <Link
                href="/admin/decisions"
                style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
              >
                ALL DECISIONS →
              </Link>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
