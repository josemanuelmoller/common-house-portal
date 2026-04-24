import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

type WarmthKey = "hot" | "warm" | "cold";

function warmth(days: number): { key: WarmthKey; label: string; dot: string; text: string } {
  if (days < 7)  return { key: "hot",  label: "Hot",  dot: "var(--hall-danger)", text: "var(--hall-danger)" };
  if (days <= 30) return { key: "warm", label: "Warm", dot: "var(--hall-warn)",  text: "var(--hall-warn)" };
  return              { key: "cold", label: "Cold", dot: "var(--hall-info)",   text: "var(--hall-info)" };
}

// Commercial pipeline stages in funnel order
const COMMERCIAL_STAGES = [
  "Prospecting",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
];

// Map stages to display styles — tokenized to K-v2 palette
const STAGE_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  "Prospecting":  { bg: "var(--hall-fill-soft)", text: "var(--hall-ink-3)",   border: "var(--hall-line-soft)" },
  "Qualified":    { bg: "var(--hall-info-soft)", text: "var(--hall-info)",    border: "var(--hall-info-soft)" },
  "Proposal":     { bg: "var(--hall-warn-soft)", text: "var(--hall-warn)",    border: "var(--hall-warn-soft)" },
  "Negotiation":  { bg: "var(--hall-ink-0)",     text: "var(--hall-paper-0)", border: "var(--hall-ink-0)" },
  "Won":          { bg: "var(--hall-ok-soft)",   text: "var(--hall-ok)",      border: "var(--hall-ok-soft)" },
  "Lost":         { bg: "var(--hall-danger-soft)", text: "var(--hall-danger)", border: "var(--hall-danger-soft)" },
};

export default async function DealFlowPage() {
  await requireAdmin();

  const [allProjects, decisions] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems(),
  ]);

  const projects = allProjects;

  const commercialDecisions = decisions.filter(d =>
    d.category === "Commercial" &&
    d.status !== "Approved" &&
    d.status !== "Rejected" &&
    d.status !== "Executed"
  );

  const urgentDecisions = commercialDecisions.filter(d =>
    d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
  );

  const byStage = projects.reduce((acc, p) => {
    const s = p.engagementStage || p.stage || "Unknown";
    if (!acc[s]) acc[s] = [];
    acc[s].push(p);
    return acc;
  }, {} as Record<string, typeof projects>);

  const openCount = projects.filter(p => {
    const s = p.engagementStage || p.stage || "";
    return s !== "Won" && s !== "Lost";
  }).length;

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px]"
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
              DEAL FLOW · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Deal <em className="hall-flourish">Flow</em>
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>{openCount} OPEN</span>
            <span style={{color: urgentDecisions.length > 0 ? "var(--hall-danger)" : "var(--hall-muted-3)"}}>
              {commercialDecisions.length} DECISIONS
            </span>
          </div>
        </header>

        <div className="px-9 py-6 max-w-[1200px] space-y-7">

          {/* P1 alert */}
          {urgentDecisions.length > 0 && (
            <div
              className="flex items-center gap-3 px-5 py-3.5"
              style={{ border: "1px solid var(--hall-danger)", background: "var(--hall-danger-soft)", borderRadius: 3 }}
            >
              <span
                className="shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--hall-danger)",
                }}
              />
              <p className="text-sm flex-1" style={{color: "var(--hall-ink-0)"}}>
                <strong>{urgentDecisions.length} urgent commercial decision{urgentDecisions.length !== 1 ? "s" : ""}</strong>
                {" — "}{urgentDecisions[0].title}
              </p>
              <Link
                href="/admin/decisions"
                className="text-[11px] font-bold whitespace-nowrap"
                style={{ color: "var(--hall-danger)" }}
              >
                Review →
              </Link>
            </div>
          )}

          {/* Stage summary strip */}
          <section>
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{borderBottom: "1px solid var(--hall-ink-0)"}}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
              >
                By <em className="hall-flourish">stage</em>
              </h2>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              {COMMERCIAL_STAGES.filter(s => (byStage[s]?.length ?? 0) > 0).map(stage => {
                const style = STAGE_STYLE[stage] ?? { bg: "var(--hall-fill-soft)", text: "var(--hall-muted-2)", border: "var(--hall-line-soft)" };
                return (
                  <div
                    key={stage}
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{
                      border: `1px solid ${style.border}`,
                      background: style.bg,
                      borderRadius: 3,
                    }}
                  >
                    <span className="text-sm font-bold tabular-nums" style={{color: style.text}}>
                      {byStage[stage].length}
                    </span>
                    <span
                      className="text-[11px] font-semibold"
                      style={{ fontFamily: "var(--font-hall-mono)", letterSpacing: "0.06em", color: style.text }}
                    >
                      {stage}
                    </span>
                  </div>
                );
              })}
              {Object.entries(byStage)
                .filter(([s]) => !COMMERCIAL_STAGES.includes(s) && s !== "Unknown")
                .map(([stage, items]) => (
                  <div
                    key={stage}
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{
                      border: "1px solid var(--hall-line-soft)",
                      background: "var(--hall-fill-soft)",
                      borderRadius: 3,
                    }}
                  >
                    <span className="text-sm font-bold tabular-nums" style={{color: "var(--hall-muted-2)"}}>
                      {items.length}
                    </span>
                    <span
                      className="text-[11px] font-semibold"
                      style={{ fontFamily: "var(--font-hall-mono)", letterSpacing: "0.06em", color: "var(--hall-muted-3)" }}
                    >
                      {stage}
                    </span>
                  </div>
                ))}
              {projects.length === 0 && (
                <p className="text-sm" style={{color: "var(--hall-muted-3)"}}>No projects in pipeline</p>
              )}
            </div>
          </section>

          {/* Two-column: opportunity table + commercial decisions */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* Opportunity table */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  All <em className="hall-flourish">opportunities</em>
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  {projects.length} TOTAL
                </span>
              </div>

              {projects.length > 0 ? (
                <div style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3, overflow: "hidden" }}>
                  {/* Table header */}
                  <div
                    className="grid grid-cols-[2fr_90px_80px_70px_90px_20px] px-5 py-2.5"
                    style={{
                      borderBottom: "1px solid var(--hall-line-soft)",
                      background: "var(--hall-paper-1)",
                    }}
                  >
                    {["Opportunity", "Stage", "Type", "Update", "Warmth", ""].map(h => (
                      <p
                        key={h}
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                      >
                        {h}
                      </p>
                    ))}
                  </div>

                  {/* Rows */}
                  <div>
                    {projects.map((p, idx) => {
                      const activityDate = [p.lastUpdate, p.lastEvidenceDate, p.lastMeetingDate].filter(Boolean).sort().pop() ?? null;
                      const days = daysSince(activityDate);
                      const w = warmth(days);
                      const stg = p.engagementStage || p.stage || "";
                      const stageStyle = STAGE_STYLE[stg] ?? { bg: "var(--hall-fill-soft)", text: "var(--hall-muted-2)", border: "var(--hall-line-soft)" };
                      const typeLabel = p.primaryWorkspace === "garage" ? "Garage"
                        : p.primaryWorkspace === "workroom" ? "Room"
                        : "Hall";
                      const typeBg = p.primaryWorkspace === "garage"
                        ? { bg: "var(--hall-ink-0)", text: "var(--hall-paper-0)", border: "var(--hall-ink-0)" }
                        : { bg: "var(--hall-fill-soft)", text: "var(--hall-muted-2)", border: "var(--hall-line-soft)" };

                      return (
                        <Link
                          key={p.id}
                          href={`/admin/projects/${p.id}`}
                          className="grid grid-cols-[2fr_90px_80px_70px_90px_20px] items-center px-5 py-3 transition-colors"
                          style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                        >
                          {/* Name */}
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold truncate" style={{color: "var(--hall-ink-0)"}}>{p.name}</p>
                            {p.blockerCount > 0 && (
                              <p
                                className="text-[9px] font-bold mt-0.5"
                                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)", letterSpacing: "0.06em" }}
                              >
                                ↯ {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>

                          {/* Stage */}
                          <div>
                            {stg ? (
                              <span
                                className="inline-block text-[8px] font-bold px-2 py-0.5 rounded-full"
                                style={{
                                  fontFamily: "var(--font-hall-mono)",
                                  letterSpacing: "0.06em",
                                  background: stageStyle.bg,
                                  color: stageStyle.text,
                                  border: `1px solid ${stageStyle.border}`,
                                }}
                              >
                                {stg}
                              </span>
                            ) : (
                              <span className="text-[12px]" style={{color: "var(--hall-muted-3)"}}>—</span>
                            )}
                          </div>

                          {/* Type */}
                          <div>
                            <span
                              className="inline-block text-[8px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                letterSpacing: "0.06em",
                                background: typeBg.bg,
                                color: typeBg.text,
                                border: `1px solid ${typeBg.border}`,
                              }}
                            >
                              {typeLabel}
                            </span>
                          </div>

                          {/* Last update */}
                          <div>
                            {p.lastUpdate ? (
                              <p
                                className="text-[10px] font-medium tabular-nums"
                                style={{
                                  fontFamily: "var(--font-hall-mono)",
                                  color: days > 30 ? "var(--hall-danger)" : "var(--hall-muted-2)",
                                }}
                              >
                                {days < 999 ? `${days}d` : "—"}
                              </p>
                            ) : (
                              <span className="text-[12px]" style={{color: "var(--hall-muted-3)"}}>—</span>
                            )}
                          </div>

                          {/* Warmth */}
                          <div className="flex items-center gap-1.5">
                            {days < 999 ? (
                              <>
                                <span
                                  className="shrink-0"
                                  style={{ width: 6, height: 6, borderRadius: "50%", background: w.dot }}
                                />
                                <span
                                  className="text-[9px] font-semibold"
                                  style={{ fontFamily: "var(--font-hall-mono)", color: w.text, letterSpacing: "0.06em" }}
                                >
                                  {w.label}
                                </span>
                              </>
                            ) : (
                              <span className="text-[9px]" style={{color: "var(--hall-muted-3)"}}>No data</span>
                            )}
                          </div>

                          {/* Arrow */}
                          <span className="text-right text-sm" style={{color: "var(--hall-muted-3)"}}>→</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div
                  className="p-10 text-center"
                  style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
                >
                  <p className="text-sm" style={{color: "var(--hall-muted-3)"}}>
                    No active projects found. Create projects in Notion to populate the pipeline.
                  </p>
                </div>
              )}
            </section>

            {/* Commercial decisions sidebar */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Commercial <em className="hall-flourish">decisions</em>
                </h2>
                {commercialDecisions.length > 0 && (
                  <span
                    style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-warn)", letterSpacing: "0.06em"}}
                  >
                    {commercialDecisions.length} OPEN
                  </span>
                )}
              </div>

              <ul className="flex flex-col">
                {commercialDecisions.slice(0, 10).map((d, idx) => {
                  const isUrgent = d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent";
                  return (
                    <li
                      key={d.id}
                      style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                    >
                      <Link
                        href="/admin/decisions"
                        className="flex items-start gap-3 py-3 transition-colors"
                      >
                        <div
                          className="shrink-0 flex items-center justify-center"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 3,
                            background: isUrgent ? "var(--hall-danger-soft)" : "var(--hall-fill-soft)",
                            marginTop: 1,
                          }}
                        >
                          <span
                            className="text-[8px] font-bold"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              color: isUrgent ? "var(--hall-danger)" : "var(--hall-muted-3)",
                            }}
                          >
                            {isUrgent ? "P1" : "·"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[11px] font-semibold leading-snug line-clamp-2"
                            style={{color: "var(--hall-ink-0)"}}
                          >
                            {d.title}
                          </p>
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

                {commercialDecisions.length === 0 && (
                  <li className="py-6 text-center">
                    <p className="text-[11px] font-medium" style={{color: "var(--hall-muted-3)"}}>
                      No open commercial decisions
                    </p>
                    <p className="text-[9px] mt-1" style={{color: "var(--hall-muted-3)"}}>
                      Tag decisions &ldquo;Commercial&rdquo; in Notion to see them here
                    </p>
                  </li>
                )}
              </ul>

              <div className="pt-3 mt-2" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                <Link
                  href="/admin/decisions"
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  ALL DECISIONS →
                </Link>
              </div>
            </section>

          </div>

        </div>
      </main>
    </div>
  );
}
