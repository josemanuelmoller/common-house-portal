import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { DraftUpdateCard } from "@/components/DraftUpdateCard";
import { DocumentsSection } from "@/components/DocumentsSection";
import { UploadZone } from "@/components/UploadZone";
import { getProjectById, getEvidenceForProject, getProjectPeople, getDocumentsForProject, getSourceActivity } from "@/lib/notion";
import { getProjectIdForUser, isAdminUser, isAdminEmail, getClientConfig } from "@/lib/clients";
import { ActivityBar } from "@/components/ActivityBar";
import { MeetingsSection } from "@/components/MeetingsSection";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { HallSection } from "@/components/HallSection";

const NAV = [
  { label: "The Hall", href: "/hall",      icon: "◈" },
  { label: "Overview", href: "/dashboard", icon: "◫" },
];

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  if (isAdminUser(user.id) || isAdminEmail(email)) redirect("/admin");
  const projectId = getProjectIdForUser(email);
  const clientConfig = getClientConfig(email);

  if (!projectId) {
    return (
      <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
        <Sidebar items={NAV} />
        <main className="flex-1 flex items-center justify-center" style={{ fontFamily: "var(--font-hall-sans)" }}>
          <div className="text-center p-10 max-w-sm" style={{ border: "1px solid var(--hall-ink-0)", borderRadius: 3 }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--hall-ink-0)" }}>
              <span className="text-lg" style={{ color: "var(--hall-lime)" }}>↯</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>No project linked</h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>
              Your account hasn&apos;t been linked to a project yet. Contact your Common House team.
            </p>
            <p className="text-xs mt-4" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>{email}</p>
          </div>
        </main>
      </div>
    );
  }

  const [project, evidence, people, documents, activity] = await Promise.all([
    getProjectById(projectId),
    getEvidenceForProject(projectId),
    getProjectPeople(projectId),
    getDocumentsForProject(projectId),
    getSourceActivity(projectId),
  ]);

  if (!project) redirect("/sign-in");

  // What matters to the client
  const blockers      = evidence.filter(e => e.type === "Blocker"    && e.validationStatus === "Validated");
  const decisions     = evidence.filter(e => e.type === "Decision"   && e.validationStatus === "Validated");
  const dependencies  = evidence.filter(e => e.type === "Dependency" && e.validationStatus === "Validated");
  const outcomes      = evidence.filter(e => e.type === "Outcome"    && e.validationStatus === "Validated");

  const lastUpdated = project.lastUpdate
    ? new Date(project.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  // CH team visible to client
  const allPeople = [...people.lead, ...people.team];
  const chTeam  = allPeople.filter(p => p.classification === "Internal");

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} projectName={project.name} />

      <main className="flex-1 overflow-auto" style={{ fontFamily: "var(--font-hall-sans)" }}>

        {/* K-v2 thin header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              COMMON HOUSE · CLIENT ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{project.name}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Your{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                dashboard
              </em>
              .
            </h1>
          </div>
          <div className="text-right shrink-0">
            <p
              className="text-[10px] uppercase tracking-[0.08em]"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              Last update
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}
            >
              {lastUpdated}
            </p>
          </div>
        </header>

        <div className="px-9 py-7">
          <div className="max-w-4xl mx-auto">

          {/* Status summary at top */}
          <div className="mb-7 flex items-center gap-2 flex-wrap">
            <StatusBadge value={project.status} />
            <StatusBadge value={project.stage} />
            {project.geography.map(g => (
              <span
                key={g}
                className="text-[10px] uppercase tracking-[0.08em]"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
              >
                {g}
              </span>
            ))}
          </div>

          {/* Active blockers — top priority */}
          {blockers.length > 0 && (
            <HallSection
              title="Active"
              flourish="blockers"
              meta={`${blockers.length} REQUIRES ATTENTION`}
            >
              <ul className="flex flex-col">
                {blockers.map(b => (
                  <li
                    key={b.id}
                    className="py-3"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="w-2 h-2 rounded-full inline-block mt-1.5 shrink-0"
                        style={{ background: "var(--hall-danger)" }}
                      />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>{b.title}</p>
                        {b.excerpt && <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>{b.excerpt}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </HallSection>
          )}

          {/* Status summary */}
          {project.statusSummary && (
            <HallSection title="Where we" flourish="are">
              <p className="text-sm leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>
                {project.statusSummary}
              </p>
            </HallSection>
          )}

          {/* Activity bar */}
          <div className="mb-7">
            <ActivityBar activity={activity} />
          </div>

          {/* Draft / latest update */}
          {project.draftUpdate && (
            <div className="mb-7">
              <DraftUpdateCard text={project.draftUpdate} />
            </div>
          )}

          {/* Documents */}
          <div className="mb-7">
            <DocumentsSection
              documents={documents}
              folderUrl={clientConfig?.driveUrl}
            />
          </div>

          {/* Meetings */}
          <div className="mb-7">
            <MeetingsSection meetings={activity.meetings} />
          </div>

          {/* Upload — only show if Drive folder is configured */}
          {clientConfig?.driveFolderId && (
            <div className="mb-7">
              <UploadZone />
            </div>
          )}

          {/* Key achievements / Decisions */}
          {decisions.length > 0 && (
            <HallSection
              title="Agreements &"
              flourish="decisions"
              meta={`${decisions.length} REACHED`}
            >
              <ul className="flex flex-col">
                {decisions.map(d => (
                  <li
                    key={d.id}
                    className="py-3 flex gap-3"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <span
                      className="rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                      style={{ background: "var(--hall-ink-0)", color: "var(--hall-lime)" }}
                    >
                      ✓
                    </span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>{d.title}</p>
                      {d.excerpt && <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>{d.excerpt}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </HallSection>
          )}

          {/* Open dependencies */}
          {dependencies.length > 0 && (
            <HallSection
              title="Open"
              flourish="dependencies"
              meta="PENDING EXTERNAL"
            >
              <ul className="flex flex-col">
                {dependencies.map(d => (
                  <li
                    key={d.id}
                    className="py-3 flex gap-3"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <span className="text-sm shrink-0 mt-0.5" style={{ color: "var(--hall-warn)" }}>◷</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>{d.title}</p>
                      {d.excerpt && <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>{d.excerpt}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </HallSection>
          )}

          {/* Outcomes */}
          {outcomes.length > 0 && (
            <HallSection title="Outcomes">
              <ul className="flex flex-col">
                {outcomes.map(o => (
                  <li
                    key={o.id}
                    className="py-3"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>{o.title}</p>
                    {o.excerpt && <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>{o.excerpt}</p>}
                  </li>
                ))}
              </ul>
            </HallSection>
          )}

          {/* Your Common House team */}
          {chTeam.length > 0 && (
            <CollapsibleSection title="Tu Equipo Common House" count={chTeam.length} defaultOpen={true}>
              <ul className="flex flex-col">
                {chTeam.map(p => {
                  const words = p.name.trim().split(/\s+/);
                  const initials = words.length >= 2
                    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                    : p.name.slice(0, 2).toUpperCase();
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 py-3"
                      style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                    >
                      <div
                        className="w-9 h-9 flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          background: "var(--hall-ink-0)",
                          color: "var(--hall-lime)",
                          borderRadius: 3,
                        }}
                      >
                        {initials}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>{p.name}</p>
                        {p.jobTitle && <p className="text-xs" style={{ color: "var(--hall-muted-2)" }}>{p.jobTitle}</p>}
                      </div>
                      {p.email && (
                        <a
                          href={`mailto:${p.email}`}
                          className="text-xs font-medium transition-colors"
                          style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                        >
                          {p.email}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CollapsibleSection>
          )}

          </div>
        </div>
      </main>
    </div>
  );
}
