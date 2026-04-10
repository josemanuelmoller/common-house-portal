import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { DraftUpdateCard } from "@/components/DraftUpdateCard";
import { DocumentsSection } from "@/components/DocumentsSection";
import { UploadZone } from "@/components/UploadZone";
import { getProjectById, getEvidenceForProject, getProjectPeople, getDocumentsForProject, getSourceActivity } from "@/lib/notion";
import { getProjectIdForUser, isAdminUser, getClientConfig } from "@/lib/clients";
import { ActivityBar } from "@/components/ActivityBar";
import { MeetingsSection } from "@/components/MeetingsSection";
import { CollapsibleSection } from "@/components/CollapsibleSection";

const NAV = [
  { label: "Overview",  href: "/dashboard",           icon: "◈" },
  { label: "Decisions", href: "/dashboard/decisions",  icon: "⚡" },
  { label: "Contacts",  href: "/dashboard/contacts",   icon: "◎" },
];

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (isAdminUser(userId)) redirect("/admin");

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
  const projectId = getProjectIdForUser(email);
  const clientConfig = getClientConfig(email);

  if (!projectId) {
    return (
      <div className="flex min-h-screen bg-[#EFEFEA]">
        <Sidebar items={NAV} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center bg-white rounded-2xl border border-[#E0E0D8] p-10 max-w-sm">
            <div className="w-12 h-12 bg-[#131218] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-[#B2FF59] text-lg">↯</span>
            </div>
            <h2 className="text-lg font-bold text-[#131218] tracking-tight">No project linked</h2>
            <p className="text-sm text-[#131218]/40 mt-2 leading-relaxed">
              Your account hasn&apos;t been linked to a project yet. Contact your Common House team.
            </p>
            <p className="text-xs text-[#131218]/20 mt-4 font-mono">{email}</p>
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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} projectName={project.name} />

      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-[#B2FF59] bg-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest inline-block mb-3">
                Project Dashboard
              </p>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">{project.name}</h1>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <StatusBadge value={project.status} />
                <StatusBadge value={project.stage} />
                {project.geography.map(g => (
                  <span key={g} className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">{g}</span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[#131218]/25 uppercase tracking-widest font-bold">Last update</p>
              <p className="text-sm font-semibold text-[#131218]/50 mt-0.5">{lastUpdated}</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Active blockers — top priority */}
          {blockers.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="h-1 bg-red-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
                    {blockers.length} Active Blocker{blockers.length > 1 ? "s" : ""} — Requires Attention
                  </p>
                </div>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {blockers.map(b => (
                  <div key={b.id} className="px-6 py-4">
                    <p className="text-sm font-semibold text-[#131218]">{b.title}</p>
                    {b.excerpt && <p className="text-xs text-[#131218]/40 mt-1 leading-relaxed">{b.excerpt}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status summary */}
          {project.statusSummary && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-5">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-3">Where We Are</p>
                <p className="text-[#131218]/70 text-sm leading-relaxed">{project.statusSummary}</p>
              </div>
            </div>
          )}

          {/* Activity bar */}
          <ActivityBar activity={activity} />

          {/* Draft / latest update */}
          {project.draftUpdate && (
            <DraftUpdateCard text={project.draftUpdate} />
          )}

          {/* Documents */}
          <DocumentsSection
            documents={documents}
            folderUrl={clientConfig?.driveUrl}
          />

          {/* Meetings */}
          <MeetingsSection meetings={activity.meetings} />

          {/* Upload — only show if Drive folder is configured */}
          {clientConfig?.driveFolderId && (
            <UploadZone />
          )}

          {/* Key achievements / Decisions */}
          {decisions.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
                  Agreements & Decisions Reached
                </p>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {decisions.map(d => (
                  <div key={d.id} className="px-6 py-4 flex gap-3">
                    <span className="text-[#B2FF59] bg-[#131218] rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">✓</span>
                    <div>
                      <p className="text-sm font-semibold text-[#131218]">{d.title}</p>
                      {d.excerpt && <p className="text-xs text-[#131218]/40 mt-1 leading-relaxed">{d.excerpt}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 border-t border-[#EFEFEA]">
                <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">{decisions.length} decisions</p>
              </div>
            </div>
          )}

          {/* Open dependencies */}
          {dependencies.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-amber-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                  Open Dependencies
                </p>
                <p className="text-xs text-[#131218]/30 mt-0.5">Items pending from external parties</p>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {dependencies.map(d => (
                  <div key={d.id} className="px-6 py-4 flex gap-3">
                    <span className="text-amber-500 text-sm shrink-0 mt-0.5">◷</span>
                    <div>
                      <p className="text-sm font-semibold text-[#131218]">{d.title}</p>
                      {d.excerpt && <p className="text-xs text-[#131218]/40 mt-1 leading-relaxed">{d.excerpt}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outcomes */}
          {outcomes.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Outcomes</p>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {outcomes.map(o => (
                  <div key={o.id} className="px-6 py-4">
                    <p className="text-sm font-semibold text-[#131218]">{o.title}</p>
                    {o.excerpt && <p className="text-xs text-[#131218]/40 mt-1 leading-relaxed">{o.excerpt}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Your Common House team */}
          {chTeam.length > 0 && (
            <CollapsibleSection title="Tu Equipo Common House" count={chTeam.length} defaultOpen={true}>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="h-1 bg-[#131218]" />
                <div className="px-6 divide-y divide-[#EFEFEA]">
                  {chTeam.map(p => {
                    const words = p.name.trim().split(/\s+/);
                    const initials = words.length >= 2
                      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                      : p.name.slice(0, 2).toUpperCase();
                    return (
                      <div key={p.id} className="flex items-center gap-3 py-3">
                        <div className="w-9 h-9 rounded-xl bg-[#131218] flex items-center justify-center text-xs font-bold text-[#B2FF59] shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[#131218]">{p.name}</p>
                          {p.jobTitle && <p className="text-xs text-[#131218]/40">{p.jobTitle}</p>}
                        </div>
                        {p.email && (
                          <a href={`mailto:${p.email}`}
                            className="text-xs text-[#131218]/30 hover:text-[#131218]/70 transition-colors font-medium">
                            {p.email}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleSection>
          )}

        </div>
      </main>
    </div>
  );
}
