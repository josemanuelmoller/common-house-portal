import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Sidebar } from "@/components/Sidebar";
import { HallHero } from "@/components/hall/HallHero";
import { WhatsHappeningNow } from "@/components/hall/WhatsHappeningNow";
import { WhatWeHeard } from "@/components/hall/WhatWeHeard";
import { SharedMaterials } from "@/components/hall/SharedMaterials";
import { Conversations } from "@/components/hall/Conversations";
import { HallDecisions } from "@/components/hall/HallDecisions";
import { HallTeam } from "@/components/hall/HallTeam";
import { WorkspaceActivation } from "@/components/hall/WorkspaceActivation";
import { GarageActivation } from "@/components/hall/GarageActivation";
import { DigitalResidents } from "@/components/hall/DigitalResidents";
import {
  getProjectById,
  getEvidenceForProject,
  getProjectPeople,
  getDocumentsForProject,
  getSourceActivity,
} from "@/lib/notion";
import { getProjectIdForUser, isAdminUser, isAdminEmail } from "@/lib/clients";
import type {
  HallProject,
  HallMaterial,
  HallConversation,
  HallDecision,
  HallTeamMember,
} from "@/types/hall";
import { WORKSPACE_READY } from "@/types/workroom";

// Cache Notion data at the Data Cache layer — works even though the route is
// dynamically rendered (Clerk auth uses cookies, which opts out of static ISR).
// Keyed by projectId so each project gets its own cache slot. TTL: 30 min.
const getHallData = unstable_cache(
  async (projectId: string) => {
    const [project, evidence, people, documents, activity] = await Promise.all([
      getProjectById(projectId),
      getEvidenceForProject(projectId),
      getProjectPeople(projectId),
      getDocumentsForProject(projectId),
      getSourceActivity(projectId),
    ]);
    return { project, evidence, people, documents, activity };
  },
  ["hall-data"],
  { revalidate: 1800 }
);

function formatHallDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// Strips internal prefixes from meeting titles for client display.
// e.g. "[Meeting] Auto Mercado — Reunión TI" → "Reunión TI"
function cleanConversationTitle(raw: string): string {
  return raw
    .replace(/^\[(?:Meeting|Email|Call|Workshop)\]\s*/i, "")
    .replace(/^[^—–-]+[—–-]\s*/, "")
    .trim() || raw;
}

// Splits a processed summary into a main body + optional takeaway.
// If the summary has multiple paragraphs and the last one is concise (≤200 chars),
// the last paragraph surfaces as the takeaway callout in Conversations.
function splitSummary(raw: string): { summary: string; takeaway?: string } {
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length < 2) return { summary: raw };
  const last = paragraphs[paragraphs.length - 1];
  if (last.length > 200) return { summary: raw };
  return { summary: paragraphs.slice(0, -1).join("\n\n"), takeaway: last };
}

// Maps evidence confidence to a decision display status.
function decisionStatus(confidence: string): HallDecision["status"] {
  if (confidence === "High") return "confirmed";
  if (confidence === "Low")  return "revisited";
  return "pending";
}

export default async function HallPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  if (isAdminUser(user.id) || isAdminEmail(email)) redirect("/admin");
  const projectId = getProjectIdForUser(email);

  if (!projectId) {
    const fallbackNav = [{ label: "The Hall", href: "/hall", icon: "◈" }];
    return (
      <div className="flex min-h-screen bg-[#EFEFEA]">
        <Sidebar items={fallbackNav} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center bg-white rounded-2xl border border-[#E0E0D8] p-10 max-w-sm">
            <div className="w-12 h-12 bg-[#131218] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-[#B2FF59] text-lg">◈</span>
            </div>
            <h2 className="text-lg font-bold text-[#131218] tracking-tight">
              No project linked
            </h2>
            <p className="text-sm text-[#131218]/40 mt-2 leading-relaxed">
              Your account hasn&apos;t been linked to a project yet. Reach out
              to your Common House contact.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const { project, evidence, people, documents, activity } = await getHallData(projectId);

  if (!project) redirect("/sign-in");

  // ── Navigation ───────────────────────────────────────────────────────────
  // Show workspace link only when this project's primary workspace is ready.
  // Hall always appears as the first item.
  const NAV = [
    { label: "The Hall",     href: "/hall",      icon: "◈" },
    ...(project.primaryWorkspace === "workroom" && WORKSPACE_READY.workroom
      ? [{ label: "The Workroom", href: "/workroom", icon: "◻" }]
      : []),
    ...(project.primaryWorkspace === "garage" && WORKSPACE_READY.garage
      ? [{ label: "The Garage", href: "/garage", icon: "◧" }]
      : []),
    { label: "Overview",    href: "/dashboard", icon: "◫" },
  ];

  // ── Workspace routing ────────────────────────────────────────────────────
  // The Hall is the universal entry layer. It ALWAYS renders for all clients.
  // It is NEVER replaced by a redirect — workspace navigation is additive
  // (sidebar link + threshold block) not a forced redirect.
  //
  // WORKSPACE_READY controls whether a workspace link appears in the sidebar.
  // Workroom is live (WORKSPACE_READY.workroom = true).
  // Garage is built (WORKSPACE_READY.garage = true) — activate by assigning
  // Primary Workspace = "garage" in CH Projects [OS v2].

  // ── Mode ─────────────────────────────────────────────────────────────────
  // Driven by "Hall Mode" select property on CH Projects [OS v2].
  const hallMode = project.hallMode ?? "explore";
  const isLive = hallMode === "live";

  // ── HallProject ──────────────────────────────────────────────────────────
  // Real fields now: hallWelcomeNote, hallCurrentFocus, hallNextMilestone
  // Fallback chain: Hall field → statusSummary first paragraph → empty
  const currentFocus = project.hallCurrentFocus || "";

  const hallProject: HallProject = {
    id:           project.id,
    name:         project.name,
    stage:        project.stage || "Active",
    lastUpdated:  formatHallDate(project.lastUpdate) || "—",
    welcomeNote:  project.hallWelcomeNote ||
      (isLive
        ? "The work is underway. This is your home base — where you'll find what's happened, what's next, and anything that needs your attention."
        : "We've spent time with what you shared and put together a first view of the space. This is where we'll keep the thread of the work."),
    preparedNote: "Prepared by Common House",
    currentFocus,
    nextMilestone: project.hallNextMilestone || "",
    statusLine:    undefined,
    // WhatWeHeard — editorial narrative fields from Notion
    theChallenge:             project.hallChallenge,
    whatMattersMost:          project.hallMattersMost,
    whatMayBeInTheWay:        project.hallObstacles,
    whatSuccessCouldLookLike: project.hallSuccess,
  };

  // ── Materials ────────────────────────────────────────────────────────────
  const materials: HallMaterial[] = documents.map((d) => ({
    id:          d.id,
    title:       d.title,
    url:         d.url,
    platform:    d.platform || "Google Drive",
    addedDate:   formatHallDate(d.sourceDate) || undefined,
    description: undefined,
  }));

  // ── Conversations ────────────────────────────────────────────────────────
  // Only show meetings that have a processed summary — hide engine-only records.
  const conversations: HallConversation[] = activity.meetings
    .filter((m) => !!m.processedSummary)
    .slice(0, 5)
    .map((m) => {
      const { summary, takeaway } = splitSummary(m.processedSummary!);
      return {
        id:    m.id,
        title: cleanConversationTitle(m.title),
        date:  formatHallDate(m.date) || "—",
        summary,
        takeaway,
      };
    });

  // ── Decisions ────────────────────────────────────────────────────────────
  const decisions: HallDecision[] = evidence
    .filter((e) => e.type === "Decision" && e.validationStatus === "Validated")
    .map((e) => ({
      id:      e.id,
      title:   e.title,
      date:    formatHallDate(e.dateCaptured) || "—",
      context: e.excerpt || undefined,
      status:  decisionStatus(e.confidence),
    }));

  // ── Team ─────────────────────────────────────────────────────────────────
  const chPeople = [...people.lead, ...people.team].filter(
    (p) => p.classification === "Internal"
  );
  const team: HallTeamMember[] = chPeople.map((p) => ({
    id:       p.id,
    name:     p.name,
    role:     p.jobTitle || "Common House",
    bio:      p.roles.length > 0 ? p.roles.join(" · ") : "",
    initials: getInitials(p.name),
  }));

  // ── Visibility gates ─────────────────────────────────────────────────────
  const showWhatWeHeard =
    !!(hallProject.theChallenge || hallProject.whatMattersMost ||
       hallProject.whatMayBeInTheWay || hallProject.whatSuccessCouldLookLike);

  // Onboarding: workroom_activation moment — show threshold block when this project
  // has graduated to Workroom delivery (live mode + workroom workspace + ready flag).
  const showWorkspaceActivation =
    isLive &&
    project.primaryWorkspace === "workroom" &&
    WORKSPACE_READY.workroom;

  // Onboarding: garage_activation moment — show threshold block when this project
  // has activated to The Garage (live mode + garage workspace + built flag).
  const showGarageActivation =
    isLive &&
    project.primaryWorkspace === "garage" &&
    WORKSPACE_READY.garage;

  // Digital Residents — show capability layer when project is live and has real signals.
  const showDigitalResidents = isLive;

  // Live signal strings shown inside each Digital Resident row.
  // Falls back to static tagline text if a role has no data yet.
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;
  const blockerCount = evidence.filter(
    (e) => e.type === "Blocker" && e.validationStatus === "Validated"
  ).length;
  const outcomeCount = evidence.filter(
    (e) => e.type === "Outcome" && e.validationStatus === "Validated"
  ).length;
  const residentSignals = {
    memory_keeper: [
      conversations.length > 0 && `${plural(conversations.length, "session")} on record`,
      materials.length > 0   && `${plural(materials.length, "document")} shared`,
    ].filter(Boolean).join(" · ") || undefined,
    decision_keeper: decisions.length > 0
      ? `${plural(decisions.length, "decision")} captured`
      : undefined,
    progress_keeper: [
      blockerCount > 0  && `${plural(blockerCount, "blocker")} flagged`,
      outcomeCount > 0  && `${plural(outcomeCount, "outcome")} tracked`,
    ].filter(Boolean).join(" · ") || undefined,
  };

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} projectName={project.name} />

      <main className="flex-1 overflow-auto">
        <HallHero project={hallProject} />

        <div className="px-8 py-6">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Onboarding: workroom_activation — threshold block, first in content area.
                Pass the most recent session as a "something is already moving" signal. */}
            {showWorkspaceActivation && (
              <WorkspaceActivation
                project={hallProject}
                lastSession={conversations[0] ?? undefined}
              />
            )}

            {/* Onboarding: garage_activation — startup workspace threshold block. */}
            {showGarageActivation && (
              <GarageActivation
                project={hallProject}
                lastSession={conversations[0] ?? undefined}
              />
            )}

            {/* What's Happening Now (2/3) + Team (1/3) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <WhatsHappeningNow project={hallProject} />
              </div>
              {team.length > 0 && (
                <HallTeam team={team} />
              )}
            </div>

            {/* What We Heard — hidden until editorial fields are populated */}
            {showWhatWeHeard && <WhatWeHeard project={hallProject} />}

            {/* Materials + Decisions — pair side-by-side when both present */}
            {materials.length > 0 && isLive && decisions.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <SharedMaterials materials={materials} />
                <HallDecisions decisions={decisions} />
              </div>
            ) : (
              <>
                {materials.length > 0 && <SharedMaterials materials={materials} />}
                {isLive && decisions.length > 0 && <HallDecisions decisions={decisions} />}
              </>
            )}

            {/* Conversations */}
            {conversations.length > 0 && (
              <Conversations conversations={conversations} />
            )}

            {/* Digital Residents — capability layer, closes the Hall */}
            {showDigitalResidents && <DigitalResidents liveSignals={residentSignals} />}

          </div>
        </div>
      </main>
    </div>
  );
}
