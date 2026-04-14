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
  if (days < 7)  return { key: "hot",  label: "Hot",  dot: "#ef4444", text: "#dc2626" };
  if (days <= 30) return { key: "warm", label: "Warm", dot: "#f59e0b", text: "#d97706" };
  return              { key: "cold", label: "Cold", dot: "#93c5fd", text: "#3b82f6" };
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

// Map stages to display styles
const STAGE_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  "Prospecting":  { bg: "#f5f5f0", text: "#131218", border: "#d4d4cc" },
  "Qualified":    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  "Proposal":     { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  "Negotiation":  { bg: "#131218", text: "#B2FF59", border: "#131218" },
  "Won":          { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  "Lost":         { bg: "#fff1f2", text: "#be123c", border: "#fecdd3" },
};

export default async function DealFlowPage() {
  await requireAdmin();

  const [allProjects, decisions] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems(),
  ]);

  // All projects — commercial pipeline spans workroom and garage
  const projects = allProjects;

  // Commercial decisions — open items only
  const commercialDecisions = decisions.filter(d =>
    d.category === "Commercial" &&
    d.status !== "Approved" &&
    d.status !== "Rejected" &&
    d.status !== "Executed"
  );

  const urgentDecisions = commercialDecisions.filter(d =>
    d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
  );

  // Group by engagementStage first, fall back to stage
  const byStage = projects.reduce((acc, p) => {
    const s = p.engagementStage || p.stage || "Unknown";
    if (!acc[s]) acc[s] = [];
    acc[s].push(p);
    return acc;
  }, {} as Record<string, typeof projects>);

  // Counts for the header
  const openCount = projects.filter(p => {
    const s = p.engagementStage || p.stage || "";
    return s !== "Won" && s !== "Lost";
  }).length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            CONTROL ROOM · COMMERCIAL
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Deal <em className="font-black italic text-[#c8f55a]">Flow</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Commercial opportunity pipeline. Qualify, advance, and close across every stage.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{openCount}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Open</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${urgentDecisions.length > 0 ? "text-red-400" : "text-[#c8f55a]"}`}>
                  {commercialDecisions.length}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Decisions</p>
              </div>
            </div>
          </div>
        </header>

        <div style={{ padding: "36px 48px", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* P1 alert */}
          {urgentDecisions.length > 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "#fef2f2",
              border: "1.5px solid #fecaca",
              borderRadius: 14,
              padding: "14px 20px",
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#ef4444",
                flexShrink: 0,
              }} />
              <p style={{ fontSize: 14, color: "#0a0a0a", flex: 1 }}>
                <strong>{urgentDecisions.length} urgent commercial decision{urgentDecisions.length !== 1 ? "s" : ""}</strong>
                {" — "}{urgentDecisions[0].title}
              </p>
              <Link
                href="/admin/decisions"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#dc2626",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Review →
              </Link>
            </div>
          )}

          {/* Stage summary strip */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase", color: "rgba(10,10,10,0.3)" }}>
                By stage
              </p>
              <div style={{ flex: 1, height: 1, background: "#d4d4cc" }} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {COMMERCIAL_STAGES.filter(s => (byStage[s]?.length ?? 0) > 0).map(stage => {
                const style = STAGE_STYLE[stage] ?? { bg: "#f5f5f0", text: "rgba(10,10,10,0.5)", border: "#d4d4cc" };
                return (
                  <div
                    key={stage}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 16px",
                      borderRadius: 14,
                      border: `1.5px solid ${style.border}`,
                      background: style.bg,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: style.text }}>
                      {byStage[stage].length}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: style.text, opacity: 0.7 }}>
                      {stage}
                    </span>
                  </div>
                );
              })}
              {/* Any stage not in our list */}
              {Object.entries(byStage)
                .filter(([s]) => !COMMERCIAL_STAGES.includes(s) && s !== "Unknown")
                .map(([stage, items]) => (
                  <div
                    key={stage}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 16px",
                      borderRadius: 14,
                      border: "1.5px solid #d4d4cc",
                      background: "#f5f5f0",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(10,10,10,0.5)" }}>
                      {items.length}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(10,10,10,0.4)" }}>
                      {stage}
                    </span>
                  </div>
                ))}
              {projects.length === 0 && (
                <p style={{ fontSize: 13, color: "rgba(10,10,10,0.25)" }}>No projects in pipeline</p>
              )}
            </div>
          </div>

          {/* Two-column: opportunity table + commercial decisions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

            {/* Opportunity table */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase", color: "rgba(10,10,10,0.3)" }}>
                  All opportunities
                </p>
                <div style={{ flex: 1, height: 1, background: "#d4d4cc" }} />
                <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(10,10,10,0.25)" }}>
                  {projects.length}
                </p>
              </div>

              {projects.length > 0 ? (
                <div style={{
                  background: "#ffffff",
                  borderRadius: 14,
                  border: "1.5px solid #d4d4cc",
                  overflow: "hidden",
                }}>
                  {/* Table header */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 90px 80px 70px 90px 20px",
                    padding: "10px 20px",
                    borderBottom: "1px solid #eeeee8",
                  }}>
                    {["Opportunity", "Stage", "Type", "Update", "Warmth", ""].map(h => (
                      <p key={h} style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "3px",
                        color: "rgba(10,10,10,0.25)",
                        margin: 0,
                      }}>
                        {h}
                      </p>
                    ))}
                  </div>

                  {/* Rows */}
                  <div>
                    {projects.map(p => {
                      const activityDate = [p.lastUpdate, p.lastEvidenceDate].filter(Boolean).sort().pop() ?? null;
                      const days = daysSince(activityDate);
                      const w = warmth(days);
                      const stg = p.engagementStage || p.stage || "";
                      const stageStyle = STAGE_STYLE[stg] ?? { bg: "#f5f5f0", text: "rgba(10,10,10,0.5)", border: "#d4d4cc" };
                      const typeLabel = p.primaryWorkspace === "garage" ? "Garage"
                        : p.primaryWorkspace === "workroom" ? "Room"
                        : "Hall";
                      const typeBg = p.primaryWorkspace === "garage"
                        ? { bg: "#0a0a0a", text: "#B2FF59", border: "#0a0a0a" }
                        : p.primaryWorkspace === "workroom"
                          ? { bg: "#f5f5f0", text: "rgba(10,10,10,0.6)", border: "#d4d4cc" }
                          : { bg: "#f5f5f0", text: "rgba(10,10,10,0.3)", border: "#d4d4cc" };

                      return (
                        <Link
                          key={p.id}
                          href={`/admin/projects/${p.id}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 90px 80px 70px 90px 20px",
                            padding: "12px 20px",
                            borderBottom: "1px solid #eeeee8",
                            alignItems: "center",
                            textDecoration: "none",
                            transition: "background 0.15s",
                          }}
                          className="hover:bg-[#f5f5f0]"
                        >
                          {/* Name */}
                          <div style={{ minWidth: 0 }}>
                            <p style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#0a0a0a",
                              margin: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {p.name}
                            </p>
                            {p.blockerCount > 0 && (
                              <p style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", margin: "2px 0 0" }}>
                                ↯ {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>

                          {/* Stage */}
                          <div>
                            {stg ? (
                              <span style={{
                                display: "inline-block",
                                fontSize: 8,
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: 99,
                                background: stageStyle.bg,
                                color: stageStyle.text,
                                border: `1px solid ${stageStyle.border}`,
                              }}>
                                {stg}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "rgba(10,10,10,0.2)" }}>—</span>
                            )}
                          </div>

                          {/* Type */}
                          <div>
                            <span style={{
                              display: "inline-block",
                              fontSize: 8,
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 99,
                              background: typeBg.bg,
                              color: typeBg.text,
                              border: `1px solid ${typeBg.border}`,
                            }}>
                              {typeLabel}
                            </span>
                          </div>

                          {/* Last update */}
                          <div>
                            {p.lastUpdate ? (
                              <p style={{
                                fontSize: 10,
                                fontWeight: 500,
                                color: days > 30 ? "#f87171" : "rgba(10,10,10,0.4)",
                                margin: 0,
                              }}>
                                {days < 999 ? `${days}d` : "—"}
                              </p>
                            ) : (
                              <span style={{ fontSize: 12, color: "rgba(10,10,10,0.2)" }}>—</span>
                            )}
                          </div>

                          {/* Warmth */}
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            {days < 999 ? (
                              <>
                                <span style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: w.dot,
                                  flexShrink: 0,
                                }} />
                                <span style={{ fontSize: 9, fontWeight: 600, color: w.text }}>
                                  {w.label}
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: 9, color: "rgba(10,10,10,0.2)" }}>No data</span>
                            )}
                          </div>

                          {/* Arrow */}
                          <span style={{ fontSize: 14, color: "rgba(10,10,10,0.2)", textAlign: "right" }}>→</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "#ffffff",
                  borderRadius: 14,
                  border: "1.5px solid #d4d4cc",
                  padding: 40,
                  textAlign: "center",
                }}>
                  <p style={{ fontSize: 13, color: "rgba(10,10,10,0.25)" }}>
                    No active projects found. Create projects in Notion to populate the pipeline.
                  </p>
                </div>
              )}
            </div>

            {/* Commercial decisions sidebar */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase", color: "rgba(10,10,10,0.3)" }}>
                  Commercial decisions
                </p>
                <div style={{ flex: 1, height: 1, background: "#d4d4cc" }} />
                {commercialDecisions.length > 0 && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    background: "#fef3c7",
                    color: "#b45309",
                    padding: "2px 8px",
                    borderRadius: 99,
                  }}>
                    {commercialDecisions.length}
                  </span>
                )}
              </div>

              <div style={{
                background: "#ffffff",
                borderRadius: 14,
                border: "1.5px solid #d4d4cc",
                overflow: "hidden",
              }}>
                <div>
                  {commercialDecisions.slice(0, 10).map(d => {
                    const isUrgent = d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent";
                    return (
                      <Link
                        key={d.id}
                        href="/admin/decisions"
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: "12px 16px",
                          borderBottom: "1px solid #eeeee8",
                          textDecoration: "none",
                        }}
                        className="hover:bg-[#f5f5f0]"
                      >
                        {/* Priority dot */}
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          background: isUrgent ? "#fee2e2" : "#eeeee8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 1,
                        }}>
                          <span style={{
                            fontSize: 8,
                            fontWeight: 700,
                            color: isUrgent ? "#dc2626" : "rgba(10,10,10,0.3)",
                          }}>
                            {isUrgent ? "P1" : "·"}
                          </span>
                        </div>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#0a0a0a",
                            lineHeight: 1.4,
                            margin: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}>
                            {d.title}
                          </p>
                          <p style={{ fontSize: 9, color: "rgba(10,10,10,0.35)", marginTop: 2 }}>
                            {d.decisionType || "Decision"}
                            {d.dueDate && ` · Due ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                          </p>
                        </div>
                      </Link>
                    );
                  })}

                  {commercialDecisions.length === 0 && (
                    <div style={{ padding: "24px 16px", textAlign: "center" }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(10,10,10,0.25)", margin: 0 }}>
                        No open commercial decisions
                      </p>
                      <p style={{ fontSize: 9, color: "rgba(10,10,10,0.2)", marginTop: 4 }}>
                        Tag decisions &ldquo;Commercial&rdquo; in Notion to see them here
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ padding: "10px 16px", borderTop: "1px solid #eeeee8" }}>
                  <Link
                    href="/admin/decisions"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "rgba(10,10,10,0.3)",
                      textDecoration: "none",
                      textTransform: "uppercase",
                      letterSpacing: "3px",
                    }}
                    className="hover:text-black"
                  >
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
