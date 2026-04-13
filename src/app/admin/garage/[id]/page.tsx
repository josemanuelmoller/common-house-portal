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
} from "@/lib/notion";
import { GarageDetailClient } from "./GarageDetailClient";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function warmthLabel(days: number): { label: string; dot: string; text: string } {
  if (days <= 3)  return { label: "Hot",     dot: "bg-red-500",      text: "text-red-600"        };
  if (days <= 10) return { label: "Warm",    dot: "bg-amber-400",    text: "text-amber-600"      };
  if (days <= 21) return { label: "Active",  dot: "bg-amber-300",    text: "text-amber-500"      };
  if (days <= 35) return { label: "Cold",    dot: "bg-blue-400",     text: "text-blue-500"       };
  return               { label: "Dormant", dot: "bg-[#131218]/15", text: "text-[#131218]/35"   };
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

  const [project, evidence, sources, allDecisions, orgData, financials, valuations, capTable, dataRoom] = await Promise.all([
    getProjectById(id),
    getEvidenceForProject(id),
    getSourcesForProject(id),
    getDecisionItems("Open"),
    getStartupOrgData(id),
    getFinancialsForProject(id),
    getValuationsForProject(id),
    getCapTableForProject(id),
    getDataRoomForProject(id),
  ]);

  if (!project) notFound();

  // Filter decisions that belong to this project if they have a category matching
  // the project name (best-effort; Decision Items don't have a direct project relation)
  const decisions = allDecisions.filter(d => {
    const haystack = (d.title + " " + (d.notes ?? "") + " " + (d.category ?? "")).toLowerCase();
    return haystack.includes(project.name.toLowerCase());
  });

  // Stats derived from evidence
  const validatedCount = evidence.filter(e => e.validationStatus === "Validated").length;

  const days   = daysSince(project.lastUpdate);
  const warmth = warmthLabel(days);
  const { prefix, em } = splitName(project.name);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* ── Dark header ─────────────────────────────────────────────────── */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">

          {/* Eyebrow + back link */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20">
              Portfolio · Garage · {project.name}
            </p>
            <Link
              href="/admin/garage-view"
              className="text-[10px] font-bold text-white/25 hover:text-white/60 transition-colors"
            >
              ← Back to Garage
            </Link>
          </div>

          {/* Title */}
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none mb-3">
            {prefix}<em className="font-black italic text-[#c8f55a] not-italic"
              style={{ fontStyle: "italic" }}>{em}</em>
          </h1>

          {/* Subtitle row */}
          <div className="flex items-center gap-4 flex-wrap">
            {project.stage && (
              <span className="text-[11px] font-semibold text-white/50">{project.stage}</span>
            )}
            {project.geography.length > 0 && (
              <>
                <span className="text-white/15">·</span>
                <span className="text-[11px] text-white/35">{project.geography.slice(0, 2).join(", ")}</span>
              </>
            )}
            <span className="text-white/15">·</span>
            <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${warmth.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${warmth.dot}`} />
              {warmth.label}
            </span>
            {project.engagementStage && (
              <>
                <span className="text-white/15">·</span>
                <span className="text-[11px] text-white/35">{project.engagementStage}</span>
              </>
            )}
          </div>
        </header>

        {/* ── Stats bar ────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-[#E0E0D8] px-12 py-4">
          <div className="grid grid-cols-6 gap-4">
            {[
              { label: "Stage",       value: project.stage    || "—"                                    },
              { label: "Evidence",    value: evidence.length                                            },
              { label: "Validated",   value: validatedCount                                             },
              { label: "Decisions",   value: decisions.length                                           },
              { label: "Sources",     value: sources.length                                             },
              { label: "Last update", value: project.lastUpdate
                  ? new Date(project.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : "—"                                                                                 },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-[8px] font-bold tracking-widest uppercase text-[#131218]/25 mb-0.5">{stat.label}</p>
                <p className="text-[15px] font-bold text-[#131218] tracking-tight">{stat.value}</p>
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
        />

      </main>
    </div>
  );
}
