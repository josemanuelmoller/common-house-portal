import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { HallSection } from "@/components/HallSection";
import { getProjectById, getEvidenceForProject, getSourcesForProject, getDashboardStats, getProjectPeople, getDocumentsForProject, getSourceActivity } from "@/lib/notion";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import { DraftUpdateCard } from "@/components/DraftUpdateCard";
import { ApproveProjectUpdateButton } from "@/components/ApproveProjectUpdateButton";
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

  const id8 = project.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 md:ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] uppercase whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PROJECT · <b style={{ color: "var(--hall-ink-0)" }}>{id8}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {project.name}
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            {project.stage && <span>{project.stage.toUpperCase()}</span>}
            {project.geography.map(g => (
              <span key={g} style={{ color: "var(--hall-muted-3)" }}>{g.toUpperCase()}</span>
            ))}
            {project.updateNeeded && (
              <span style={{ color: "var(--hall-warn)" }}>! UPDATE NEEDED</span>
            )}
            <Link
              href="/admin"
              className="uppercase tracking-widest"
              style={{ color: "var(--hall-muted-2)" }}
            >
              ← Back
            </Link>
          </div>
        </header>

        <div className="px-9 py-6 space-y-7">

          {/* Meta row — last updated */}
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>LAST UPDATED · <b style={{ color: "var(--hall-ink-0)" }}>{lastUpdated.toUpperCase()}</b></span>
          </div>

          {/* ── Review Banner — shown when OS flagged this project for update ── */}
          {project.updateNeeded && (
            <div
              className="px-5 py-4"
              style={{
                background: "var(--hall-warn-paper)",
                border: "1px solid var(--hall-warn)",
                borderRadius: 3,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest mb-1"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                  >
                    Flagged for update
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>
                    {project.draftUpdate
                      ? "New validated evidence was recorded since the last status update. The OS drafted an update — review it below."
                      : "New validated evidence was recorded since the last status update. No draft generated yet — run update-project-status to create one."}
                  </p>
                  {evidence.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <p
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
                      >
                        Recent signals:
                      </p>
                      {evidence.slice(0, 3).map(e => (
                        <span
                          key={e.id}
                          className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                          style={{
                            background: "var(--hall-paper-0)",
                            border: "1px solid var(--hall-warn)",
                            color: "var(--hall-ink-3)",
                          }}
                        >
                          {e.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ApproveProjectUpdateButton
                  projectId={project.id}
                  draftText={project.draftUpdate || undefined}
                />
              </div>
            </div>
          )}

          {/* Draft update — surfaced immediately when flagged, not buried below */}
          {project.updateNeeded && project.draftUpdate && (
            <DraftUpdateCard text={project.draftUpdate} />
          )}

          {/* House Configuration — workspace assignment */}
          <HallSection
            title="House"
            flourish="configuration"
            meta="WORKSPACE ASSIGNMENT · SET IN NOTION"
          >
            <div className="flex items-center justify-end mb-3">
              <a
                href={`https://www.notion.so/${project.id.replace(/-/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                Edit in Notion ↗
              </a>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {/* Primary Workspace */}
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  Primary Workspace
                </p>
                <span
                  className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: project.primaryWorkspace === "garage"
                      ? "var(--hall-warn-soft)"
                      : project.primaryWorkspace === "workroom"
                      ? "var(--hall-fill-soft)"
                      : "var(--hall-ink-0)",
                    color: project.primaryWorkspace === "garage"
                      ? "var(--hall-warn)"
                      : project.primaryWorkspace === "workroom"
                      ? "var(--hall-muted-2)"
                      : "var(--hall-paper-0)",
                  }}
                >
                  {project.primaryWorkspace || "hall"}
                </span>
              </div>
              {/* Engagement Stage */}
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  Engagement Stage
                </p>
                <span
                  className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: project.engagementStage === "active"
                      ? "var(--hall-ok-soft)"
                      : project.engagementStage === "pre-sale"
                      ? "var(--hall-warn-soft)"
                      : "var(--hall-fill-soft)",
                    color: project.engagementStage === "active"
                      ? "var(--hall-ok)"
                      : project.engagementStage === "pre-sale"
                      ? "var(--hall-warn)"
                      : "var(--hall-muted-3)",
                  }}
                >
                  {project.engagementStage || "—"}
                </span>
              </div>
              {/* Engagement Model */}
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  Engagement Model
                </p>
                <span
                  className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: project.engagementModel === "startup"
                      ? "var(--hall-warn-soft)"
                      : project.engagementModel === "delivery"
                      ? "var(--hall-fill-soft)"
                      : "var(--hall-fill-soft)",
                    color: project.engagementModel === "startup"
                      ? "var(--hall-warn)"
                      : project.engagementModel === "delivery"
                      ? "var(--hall-muted-2)"
                      : "var(--hall-muted-3)",
                  }}
                >
                  {project.engagementModel || "—"}
                </span>
              </div>
              {/* Workroom Mode */}
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  Workroom Mode
                </p>
                <span
                  className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: "var(--hall-fill-soft)",
                    color: project.workroomMode ? "var(--hall-muted-2)" : "var(--hall-muted-3)",
                  }}
                >
                  {project.workroomMode || (project.primaryWorkspace === "workroom" ? "not set" : "—")}
                </span>
              </div>
            </div>
          </HallSection>

          {/* Blockers alert */}
          {blockers.length > 0 && (
            <div
              className="px-5 py-4"
              style={{
                border: "1px solid var(--hall-danger)",
                background: "var(--hall-danger-soft)",
                borderRadius: 3,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: "var(--hall-danger)" }}
                ></span>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
                >
                  {blockers.length} Active Blocker{blockers.length > 1 ? "s" : ""}
                </p>
              </div>
              {blockers.map(b => (
                <p
                  key={b.id}
                  className="text-sm py-1.5 last:border-0"
                  style={{
                    color: "var(--hall-ink-3)",
                    borderBottom: "1px solid var(--hall-line-soft)",
                  }}
                >
                  {b.title}
                </p>
              ))}
            </div>
          )}

          {/* Admin-only internal stats — compact, not prominent */}
          <div
            className="flex items-center gap-6 px-5 py-3"
            style={{
              border: "1px solid var(--hall-line-soft)",
              borderRadius: 3,
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-widest shrink-0"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
            >
              Internal
            </p>
            {[
              { label: "Sources",   value: sources.length },
              { label: "Evidence",  value: stats.totalEvidence },
              { label: "Validated", value: stats.validatedEvidence },
              { label: "Pending",   value: stats.pendingEvidence },
              { label: "Reusable",  value: reusable.length },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-1.5">
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                >
                  {m.value}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  {m.label}
                </span>
              </div>
            ))}
            <p
              className="text-[10px] ml-auto"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
            >
              → Full detail in Operation System
            </p>
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

          {/* Status Summary */}
          {project.statusSummary && (
            <HallSection title="Status" flourish="summary">
              <p className="text-sm leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>
                {project.statusSummary}
              </p>
            </HallSection>
          )}

          {/* Draft update — shown here only when project is NOT flagged (not shown at top) */}
          {!project.updateNeeded && project.draftUpdate && (
            <DraftUpdateCard text={project.draftUpdate} />
          )}

          {/* Documents */}
          <DocumentsSection documents={documents} />

          {/* Meetings */}
          <MeetingsSection meetings={activity.meetings} />

          {/* Quick intel summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Decisions",    items: decisions    },
              { label: "Dependencies", items: dependencies },
              { label: "Requirements", items: requirements },
              { label: "Outcomes",     items: outcomes     },
            ].map(({ label, items }) => (
              <div
                key={label}
                className="p-4"
                style={{
                  border: "1px solid var(--hall-line-soft)",
                  borderRadius: 3,
                }}
              >
                <p
                  className="text-2xl font-bold tabular-nums"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}
                >
                  {items.length}
                </p>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  {label}
                </p>
                {items.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {items.slice(0, 2).map(e => (
                      <p
                        key={e.id}
                        className="text-[10px] font-semibold px-2 py-1 rounded-lg line-clamp-1"
                        style={{
                          background: "var(--hall-ink-0)",
                          color: "var(--hall-paper-0)",
                        }}
                      >
                        {e.title}
                      </p>
                    ))}
                    {items.length > 2 && (
                      <p
                        className="text-[10px] font-medium px-1"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                      >
                        +{items.length - 2} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Full evidence table */}
          <HallSection title="All" flourish="evidence" meta={`COUNT ${evidence.length}`}>
            <div
              className="flex gap-6 mb-3"
              style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
            >
              {[
                { label: "All",           count: evidence.length },
                { label: "Validated",     count: stats.validatedEvidence },
                { label: "Blockers",      count: blockers.length },
                { label: "Decisions",     count: decisions.length },
                { label: "Dependencies",  count: dependencies.length },
              ].map((tab, i) => (
                <button
                  key={tab.label}
                  className="pb-3 text-xs font-semibold flex items-center gap-1.5 -mb-px transition-colors"
                  style={{
                    borderBottom: "2px solid",
                    borderBottomColor: i === 0 ? "var(--hall-ink-0)" : "transparent",
                    color: i === 0 ? "var(--hall-ink-0)" : "var(--hall-muted-3)",
                  }}
                >
                  {tab.label}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      background: i === 0 ? "var(--hall-ink-0)" : "var(--hall-fill-soft)",
                      color: i === 0 ? "var(--hall-paper-0)" : "var(--hall-muted-2)",
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Evidence
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Type
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Confidence
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Reusable
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Captured
                  </th>
                </tr>
              </thead>
              <tbody>
                {evidence.map(e => (
                  <tr
                    key={e.id}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
                  >
                    <td className="px-3 py-3">
                      <p className="font-semibold text-sm tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{e.title}</p>
                      {e.excerpt && (
                        <p
                          className="text-xs mt-0.5 line-clamp-1 max-w-sm leading-relaxed"
                          style={{ color: "var(--hall-muted-3)" }}
                        >
                          {e.excerpt}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3"><StatusBadge value={e.type} /></td>
                    <td className="px-3 py-3"><StatusBadge value={e.validationStatus} /></td>
                    <td className="px-3 py-3"><StatusBadge value={e.confidence} /></td>
                    <td className="px-3 py-3">
                      {e.reusability === "Reusable"
                        ? (
                          <span
                            className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              background: "var(--hall-ok-soft)",
                              color: "var(--hall-ok)",
                            }}
                          >
                            Reusable
                          </span>
                        )
                        : <span className="text-xs" style={{ color: "var(--hall-muted-3)" }}>—</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-xs font-medium" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}>
                      {e.dateCaptured
                        ? new Date(e.dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {evidence.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm" style={{ color: "var(--hall-muted-3)" }}>
                      No evidence recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </HallSection>

          {/* Sources */}
          <HallSection title="Sources" flourish="processed" meta={`COUNT ${sources.length}`}>
            <p
              className="mb-3"
              style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
            >
              Emails y documentos ingestados para este proyecto
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Source
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Type
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                  >
                    Ingested
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr
                    key={s.id}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
                  >
                    <td className="px-3 py-3 font-semibold text-sm" style={{ color: "var(--hall-ink-0)" }}>{s.title || "—"}</td>
                    <td className="px-3 py-3"><StatusBadge value={s.sourceType} /></td>
                    <td className="px-3 py-3"><StatusBadge value={s.status} /></td>
                    <td
                      className="px-3 py-3 text-xs font-medium"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      {s.dateIngested
                        ? new Date(s.dateIngested).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm" style={{ color: "var(--hall-muted-3)" }}>
                      No sources ingested for this project yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </HallSection>

        </div>
      </main>
    </div>
  );
}
