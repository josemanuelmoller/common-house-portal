import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { HallHero } from "@/components/hall/HallHero";
import { WhatsHappeningNow } from "@/components/hall/WhatsHappeningNow";
import { WhatWeHeard } from "@/components/hall/WhatWeHeard";
import { SharedMaterials } from "@/components/hall/SharedMaterials";
import { Conversations } from "@/components/hall/Conversations";
import { HallDecisions } from "@/components/hall/HallDecisions";
import { HallTeam } from "@/components/hall/HallTeam";
import {
  getProjectById,
  getEvidenceForProject,
  getProjectPeople,
  getDocumentsForProject,
  getSourceActivity,
} from "@/lib/notion";
import { getProjectIdForUser, isAdminUser } from "@/lib/clients";
import type {
  HallMode,
  HallProject,
  HallMaterial,
  HallConversation,
  HallDecision,
  HallTeamMember,
} from "@/types/hall";
import { WORKSPACE_READY } from "@/types/workroom";

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

// Strips HTML line-break tags left by the Notion rich_text renderer
// and trims to the first logical paragraph for use as a short status line.
function firstParagraph(raw: string): string {
  return raw.replace(/<br\s*\/?>/gi, "\n").split(/\n{2,}/)[0].trim();
}

// Strips internal prefixes from meeting titles for client display.
// e.g. "[Meeting] Auto Mercado — Reunión TI" → "Reunión TI"
function cleanConversationTitle(raw: string): string {
  return raw
    .replace(/^\[(?:Meeting|Email|Call|Workshop)\]\s*/i, "")
    .replace(/^[^—–-]+[—–-]\s*/, "")
    .trim() || raw;
}

export default async function HallPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (isAdminUser(userId)) redirect("/admin");

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
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

  const [project, evidence, people, documents, activity] = await Promise.all([
    getProjectById(projectId),
    getEvidenceForProject(projectId),
    getProjectPeople(projectId),
    getDocumentsForProject(projectId),
    getSourceActivity(projectId),
  ]);

  if (!project) redirect("/sign-in");

  // ── Navigation ───────────────────────────────────────────────────────────
  // Show Workroom link only when this project's primary workspace is workroom
  // AND the Workroom is client-ready. Hall always appears as the first item.
  const NAV = [
    { label: "The Hall",     href: "/hall",      icon: "◈" },
    ...(project.primaryWorkspace === "workroom" && WORKSPACE_READY.workroom
      ? [{ label: "The Workroom", href: "/workroom", icon: "◻" }]
      : []),
    { label: "Overview",    href: "/dashboard", icon: "◫" },
  ];

  // ── Workspace routing ────────────────────────────────────────────────────
  // The Hall is the universal entry layer. It ALWAYS renders for all clients.
  // It is NEVER replaced by a redirect — workspace navigation is additive
  // (sidebar link) not a forced redirect.
  //
  // WORKSPACE_READY controls whether a workspace link appears in the sidebar.
  // Workroom is live (WORKSPACE_READY.workroom = true). Garage is not yet built.
  //
  // Future: once Garage is built, flip WORKSPACE_READY.garage = true and add
  // the garage link to the NAV block above. No other routing change needed.

  // ── Mode ─────────────────────────────────────────────────────────────────
  // Derive from stage. Discovery/Scoping → explore; everything actively underway → live.
  // TODO: override with "Hall Mode" select property on CH Projects [OS v2] once added.
  const mode: HallMode =
    project.stage === "Discovery" || project.stage === "Scoping"
      ? "explore"
      : "live";
  const isLive = mode === "live";

  // ── HallProject ──────────────────────────────────────────────────────────
  // Real fields now: hallWelcomeNote, hallCurrentFocus, hallNextMilestone
  // Fallback chain: Hall field → statusSummary first paragraph → empty
  const currentFocus =
    project.hallCurrentFocus ||
    firstParagraph(project.statusSummary) ||
    "";

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
    .map((m) => ({
      id:       m.id,
      title:    cleanConversationTitle(m.title),
      date:     formatHallDate(m.date) || "—",
      summary:  m.processedSummary!,
      takeaway: undefined,
    }));

  // ── Decisions ────────────────────────────────────────────────────────────
  const decisions: HallDecision[] = evidence
    .filter((e) => e.type === "Decision" && e.validationStatus === "Validated")
    .map((e) => ({
      id:      e.id,
      title:   e.title,
      date:    formatHallDate(e.dateCaptured) || "—",
      context: e.excerpt || undefined,
      status:  "confirmed" as const,
    }));

  // ── Team ─────────────────────────────────────────────────────────────────
  const chPeople = [...people.lead, ...people.team].filter(
    (p) => p.classification === "Internal"
  );
  const team: HallTeamMember[] = chPeople.map((p) => ({
    id:       p.id,
    name:     p.name,
    role:     p.jobTitle || "Common House",
    bio:      "",
    initials: getInitials(p.name),
  }));

  // ── Visibility gates ─────────────────────────────────────────────────────
  const showWhatWeHeard =
    !!(hallProject.theChallenge || hallProject.whatMattersMost ||
       hallProject.whatMayBeInTheWay || hallProject.whatSuccessCouldLookLike);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} projectName={project.name} />

      <main className="flex-1 overflow-auto">
        <HallHero project={hallProject} />

        <div className="px-8 py-6 space-y-6">

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

          {/* Shared Materials */}
          {materials.length > 0 && <SharedMaterials materials={materials} />}

          {/* Conversations */}
          {conversations.length > 0 && (
            <Conversations conversations={conversations} />
          )}

          {/* Decisions — live only */}
          {isLive && decisions.length > 0 && (
            <HallDecisions decisions={decisions} />
          )}

        </div>
      </main>
    </div>
  );
}
