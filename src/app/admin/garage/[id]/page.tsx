import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import {
  getProjectById,
  getEvidenceForProject,
  getSourcesForProject,
  getDecisionItems,
  getStartupOrgData,
  getFinancialsForProject,
  getValuationsForProject,
  getCapTableForProject,
  getDataRoomForProject,
  getPortfolioOpportunities,
  getSourceActivity,
} from "@/lib/notion";
import { GarageDetailClient } from "./GarageDetailClient";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function warmthLabel(days: number): { label: string; dot: string; text: string } {
  if (days <= 3)  return { label: "Hot",     dot: "var(--hall-danger)",  text: "var(--hall-danger)"  };
  if (days <= 10) return { label: "Warm",    dot: "var(--hall-warn)",    text: "var(--hall-warn)"    };
  if (days <= 21) return { label: "Active",  dot: "var(--hall-warn)",    text: "var(--hall-warn)"    };
  if (days <= 35) return { label: "Cold",    dot: "var(--hall-info)",    text: "var(--hall-info)"    };
  return               { label: "Dormant", dot: "var(--hall-muted-3)", text: "var(--hall-muted-3)" };
}

// Split a name so the last word is wrapped in <em> (e.g. "Fair Cycle" → "Fair <em>Cycle</em>")
function splitName(name: string): { prefix: string; em: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { prefix: "", em: parts[0] };
  return { prefix: parts.slice(0, -1).join(" ") + " ", em: parts[parts.length - 1] };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function GarageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [project, evidence, sources, allDecisions, orgData, financials, valuations, capTable, dataRoom, activity] = await Promise.all([
    getProjectById(id),
    getEvidenceForProject(id),
    getSourcesForProject(id),
    getDecisionItems("Open"),
    getStartupOrgData(id),
    getFinancialsForProject(id),
    getValuationsForProject(id),
    getCapTableForProject(id),
    getDataRoomForProject(id),
    getSourceActivity(id),
  ]);

  // Fetch portfolio opportunities after project resolves so we can filter by org name
  const opportunities = await getPortfolioOpportunities(orgData?.name || project?.name);

  if (!project) notFound();

  // Filter decisions that belong to this project if they have a category matching
  // the project name (best-effort; Decision Items don't have a direct project relation)
  const decisions = allDecisions.filter(d => {
    const haystack = (d.title + " " + (d.notes ?? "") + " " + (d.category ?? "")).toLowerCase();
    return haystack.includes(project.name.toLowerCase());
  });

  // Stats derived from evidence
  const validatedCount = evidence.filter(e => e.validationStatus === "Validated" || e.validationStatus === "Reviewed").length;

  const days   = daysSince(project.lastUpdate);
  const warmth = warmthLabel(days);
  const { prefix, em } = splitName(project.name);

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
              PORTFOLIO · GARAGE ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{project.name}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {prefix}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--hall-ink-0)",
                }}
              >
                {em}
              </em>
            </h1>
          </div>
          <Link
            href="/admin/garage-view"
            className="hall-btn-ghost"
            style={{ fontSize: 11 }}
          >
            ← Back to Garage
          </Link>
        </header>

        {/* Subtitle row */}
        <div
          className="flex items-center gap-4 flex-wrap px-9 py-3"
          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
        >
          {project.stage && (
            <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}>
              {project.stage}
            </span>
          )}
          {project.geography.length > 0 && (
            <>
              <span style={{ color: "var(--hall-muted-3)" }}>·</span>
              <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}>
                {project.geography.slice(0, 2).join(", ")}
              </span>
            </>
          )}
          <span style={{ color: "var(--hall-muted-3)" }}>·</span>
          <span
            className="flex items-center gap-1.5"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10.5,
              fontWeight: 700,
              color: warmth.text,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: warmth.dot }} />
            {warmth.label}
          </span>
          {project.engagementStage && (
            <>
              <span style={{ color: "var(--hall-muted-3)" }}>·</span>
              <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}>
                {project.engagementStage}
              </span>
            </>
          )}
        </div>

        {/* ── Stats bar ────────────────────────────────────────────────────── */}
        <div
          className="px-9 py-4"
          style={{ borderBottom: "1px solid var(--hall-line-soft)", background: "var(--hall-paper-0)" }}
        >
          <div className="grid grid-cols-6 gap-4">
            {[
              { label: "Stage",       value: project.stage    || "—"                                    },
              { label: "Evidence",    value: evidence.length                                            },
              { label: "Validated",   value: validatedCount                                             },
              { label: "Meetings",    value: activity.meetings.length                                   },
              { label: "Sources",     value: sources.length                                             },
              { label: "Last update", value: project.lastUpdate
                  ? new Date(project.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : "—"                                                                                 },
            ].map(stat => (
              <div key={stat.label}>
                <p
                  className="mb-0.5"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  {stat.label}
                </p>
                <p className="text-[15px] font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab nav + tab content (client) ──────────────────────────────── */}
        <GarageDetailClient
          project={project}
          evidence={evidence}
          sources={sources}
          decisions={decisions}
          orgData={orgData}
          financials={financials}
          valuations={valuations}
          capTable={capTable}
          dataRoom={dataRoom}
          orgId={orgData?.id}
          opportunities={opportunities}
          meetings={activity.meetings}
        />

      </main>
    </div>
  );
}
