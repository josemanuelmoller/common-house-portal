import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { getProjectById, getEvidenceForProject, getSourcesForProject, getDashboardStats, getProjectPeople, getDocumentsForProject, getSourceActivity } from "@/lib/notion";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import { DraftUpdateCard } from "@/components/DraftUpdateCard";
import { ProjectPeople } from "@/components/ProjectPeople";
import { DocumentsSection } from "@/components/DocumentsSection";
import { ActivityBar } from "@/components/ActivityBar";
import { MeetingsSection } from "@/components/MeetingsSection";
import { CollapsibleSection } from "@/components/CollapsibleSection";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;

  const [project, evidence, sources, stats, people, documents, activity] = await Promise.all([
    getProjectById(id),
    getEvidenceForProject(id),
    getSourcesForProject(id),
    getDashboardStats(id),
    getProjectPeople(id),
    getDocumentsForProject(id),
    getSourceActivity(id),
  ]);

  if (!project) redirect("/admin");

  const blockers     = evidence.filter(e => e.type === "Blocker"     && e.validationStatus === "Validated");
  const decisions    = evidence.filter(e => e.type === "Decision"    && e.validationStatus === "Validated");
  const dependencies = evidence.filter(e => e.type === "Dependency"  && e.validationStatus === "Validated");
  const requirements = evidence.filter(e => e.type === "Requirement" && e.validationStatus === "Validated");
  const outcomes     = evidence.filter(e => e.type === "Outcome"     && e.validationStatus === "Validated");
  const reusable     = evidence.filter(e => e.reusability === "Reusable" && e.validationStatus === "Validated");

  const lastUpdated = project.lastUpdate
    ? new Date(project.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 ml-[228px] overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          {/* Back */}
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#131218]/30 hover:text-[#131218]/70 uppercase tracking-widest mb-4 transition-colors">
            ← Back to Projects
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">{project.name}</h1>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <StatusBadge value={project.status} />
                <StatusBadge value={project.stage} />
                {project.geography.map(g => (
                  <span key={g} className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">{g}</span>
                ))}
                {project.themes.map(t => (
                  <span key={t} className="text-[9px] bg-[#EFEFEA] text-[#131218]/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">{t}</span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[#131218]/25 uppercase tracking-widest font-bold">Last update</p>
              <p className="text-sm font-semibold text-[#131218]/50 mt-0.5">{lastUpdated}</p>
              {project.updateNeeded && (
                <span className="mt-2 inline-block text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                  ! Update needed
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* House Configuration — workspace assignment */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#131218]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">House Configuration</p>
                <p className="text-xs text-[#131218]/30 mt-0.5">Workspace assignment · set in Notion</p>
              </div>
              <a
                href={`https://www.notion.so/${project.id.replace(/-/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold text-[#131218]/30 hover:text-[#131218]/70 uppercase tracking-widest transition-colors"
              >
                Edit in Notion ↗
              </a>
            </div>
            <div className="px-6 py-4 grid grid-cols-4 gap-4">
              {/* Primary Workspace */}
              <div>
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-1.5">Primary Workspace</p>
                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                  project.primaryWorkspace === "garage"   ? "bg-yellow-100 text-yellow-700" :
                  project.primaryWorkspace === "workroom" ? "bg-blue-100 text-blue-700" :
                  "bg-[#131218] text-[#B2FF59]"
                }`}>
                  {project.primaryWorkspace || "hall"}
                </span>
              </div>
              {/* Engagement Stage */}
              <div>
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-1.5">Engagement Stage</p>
                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                  project.engagementStage === "active"   ? "bg-green-100 text-green-700" :
                  project.engagementStage === "pre-sale" ? "bg-orange-100 text-orange-700" :
                  "bg-[#EFEFEA] text-[#131218]/30"
                }`}>
                  {project.engagementStage || "—"}
                </span>
              </div>
              {/* Engagement Model */}
              <div>
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-1.5">Engagement Model</p>
                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                  project.engagementModel === "startup"  ? "bg-yellow-100 text-yellow-700" :
                  project.engagementModel === "delivery" ? "bg-blue-100 text-blue-700" :
                  "bg-[#EFEFEA] text-[#131218]/30"
                }`}>
                  {project.engagementModel || "—"}
                </span>
              </div>
              {/* Workroom Mode */}
              <div>
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-1.5">Workroom Mode</p>
                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                  project.workroomMode ? "bg-[#EFEFEA] text-[#131218]/60" : "bg-[#EFEFEA] text-[#131218]/20"
                }`}>
                  {project.workroomMode || (project.primaryWorkspace === "workroom" ? "not set" : "—")}
                </span>
              </div>
            </div>
          </div>

          {/* Blockers alert */}
          {blockers.length > 0 && (
            <div className="bg-white border border-red-200 rounded-2xl px-6 py-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">
                  {blockers.length} Active Blocker{blockers.length > 1 ? "s" : ""}
                </p>
              </div>
              {blockers.map(b => (
                <p key={b.id} className="text-sm text-[#131218]/70 py-1.5 border-b border-[#EFEFEA] last:border-0">{b.title}</p>
              ))}
            </div>
          )}

          {/* Admin-only internal stats — compact, not prominent */}
          <div className="flex items-center gap-6 bg-white rounded-2xl border border-[#E0E0D8] px-6 py-3">
            <p className="text-[10px] font-bold text-[#131218]/20 uppercase tracking-widest shrink-0">Internal</p>
            {[
              { label: "Sources",   value: sources.length },
              { label: "Evidence",  value: stats.totalEvidence },
              { label: "Validated", value: stats.validatedEvidence },
              { label: "Pending",   value: stats.pendingEvidence },
              { label: "Reusable",  value: reusable.length },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#131218]/50">{m.value}</span>
                <span className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">{m.label}</span>
              </div>
            ))}
            <p className="text-[10px] text-[#131218]/20 ml-auto">→ Full detail in Operation System</p>
          </div>

          {/* Activity bar */}
          <ActivityBar activity={activity} />

          {/* People & Organizations */}
          <CollapsibleSection
            title="People & Organizations"
            count={people.lead.length + people.team.length + people.primaryOrg.length + people.otherOrgs.length}
            defaultOpen={true}
          >
            <ProjectPeople
              lead={people.lead}
              team={people.team}
              primaryOrg={people.primaryOrg}
              otherOrgs={people.otherOrgs}
            />
          </CollapsibleSection>

          {/* Status + draft — full width single column */}
          <div className="space-y-4">
            {project.statusSummary && (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="h-1 bg-[#B2FF59]" />
                <div className="px-6 py-5">
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-3">Status Summary</p>
                  <p className="text-[#131218]/70 text-sm leading-relaxed">{project.statusSummary}</p>
                </div>
              </div>
            )}
            {project.draftUpdate && (
              <DraftUpdateCard text={project.draftUpdate} />
            )}
          </div>

          {/* Documents */}
          <DocumentsSection documents={documents} />

          {/* Meetings */}
          <MeetingsSection meetings={activity.meetings} />

          {/* Quick intel summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Decisions",    items: decisions,    color: "bg-[#131218] text-white" },
              { label: "Dependencies", items: dependencies, color: "bg-[#131218] text-white" },
              { label: "Requirements", items: requirements, color: "bg-[#131218] text-white" },
              { label: "Outcomes",     items: outcomes,     color: "bg-[#B2FF59] text-[#131218]" },
            ].map(({ label, items, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-[#E0E0D8] p-4">
                <p className="text-2xl font-bold text-[#131218]">{items.length}</p>
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-0.5">{label}</p>
                {items.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {items.slice(0, 2).map(e => (
                      <p key={e.id} className={`text-[10px] font-semibold px-2 py-1 rounded-lg line-clamp-1 ${color}`}>
                        {e.title}
                      </p>
                    ))}
                    {items.length > 2 && (
                      <p className="text-[10px] text-[#131218]/25 font-medium px-1">+{items.length - 2} more</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Full evidence table */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">All Evidence</h2>
              <div className="flex gap-6 mt-3 border-b border-[#E0E0D8] -mx-6 px-6">
                {[
                  { label: "All",           count: evidence.length },
                  { label: "Validated",     count: stats.validatedEvidence },
                  { label: "Blockers",      count: blockers.length },
                  { label: "Decisions",     count: decisions.length },
                  { label: "Dependencies",  count: dependencies.length },
                ].map((tab, i) => (
                  <button key={tab.label}
                    className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                      i === 0
                        ? "border-[#131218] text-[#131218]"
                        : "border-transparent text-[#131218]/30 hover:text-[#131218]/60"
                    }`}>
                    {tab.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      i === 0 ? "bg-[#131218] text-white" : "bg-[#131218]/8 text-[#131218]/50"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Evidence</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Confidence</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Reusable</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {evidence.map(e => (
                  <tr key={e.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-[#131218] text-sm tracking-tight">{e.title}</p>
                      {e.excerpt && (
                        <p className="text-xs text-[#131218]/35 mt-0.5 line-clamp-1 max-w-sm leading-relaxed">{e.excerpt}</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={e.type} /></td>
                    <td className="px-4 py-3"><StatusBadge value={e.validationStatus} /></td>
                    <td className="px-4 py-3"><StatusBadge value={e.confidence} /></td>
                    <td className="px-4 py-3">
                      {e.reusability === "Reusable"
                        ? <span className="inline-block bg-[#B2FF59] text-[#131218] text-[10px] font-bold px-2 py-0.5 rounded-full">Reusable</span>
                        : <span className="text-[#131218]/15 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-[#131218]/35 font-medium">
                      {e.dateCaptured
                        ? new Date(e.dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {evidence.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-[#131218]/30">
                      No evidence recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-6 py-3 border-t border-[#EFEFEA]">
              <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">COUNT {evidence.length}</p>
            </div>
          </div>

          {/* Sources */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">Sources Processed</h2>
              <p className="text-xs text-[#131218]/40 mt-0.5">Emails y documentos ingestados para este proyecto</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Source</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Ingested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {sources.map(s => (
                  <tr key={s.id} className="hover:bg-[#EFEFEA]/60 transition-colors">
                    <td className="px-6 py-3 font-semibold text-[#131218] text-sm">{s.title || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge value={s.sourceType} /></td>
                    <td className="px-4 py-3"><StatusBadge value={s.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#131218]/35 font-medium">
                      {s.dateIngested
                        ? new Date(s.dateIngested).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-[#131218]/30">
                      No sources ingested for this project yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-6 py-3 border-t border-[#EFEFEA]">
              <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">COUNT {sources.length}</p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
