import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { WorkroomHeader } from "@/components/workroom/WorkroomHeader";
import { ExecutiveSnapshot } from "@/components/workroom/ExecutiveSnapshot";
import { ActiveBlockers } from "@/components/workroom/ActiveBlockers";
import { WorkroomDelta } from "@/components/workroom/WorkroomDelta";
import { WhatsInMotion } from "@/components/workroom/WhatsInMotion";
import { DocumentsSection } from "@/components/DocumentsSection";
import { SessionLog } from "@/components/workroom/SessionLog";
import { AgreementsReached } from "@/components/workroom/AgreementsReached";
import { WorkroomDigitalResidents } from "@/components/workroom/WorkroomDigitalResidents";
import {
  getProjectById,
  getEvidenceForProject,
  getDocumentsForProject,
  getSourceActivity,
} from "@/lib/notion";
import { getProjectIdForUser, isAdminUser, isAdminEmail } from "@/lib/clients";
import { WORKSPACE_READY } from "@/types/workroom";
import type {
  WorkroomProject,
  WorkroomBlocker,
  WorkroomSession,
  WorkroomDecision,
} from "@/types/workroom";
import type { WorkroomActivitySummary } from "@/components/workroom/WorkroomDelta";

/**
 * /workroom — The Workroom (client-facing delivery workspace).
 *
 * Visible to clients whose project has Primary Workspace = "workroom".
 * Non-workroom projects redirect to /hall — The Hall remains their entry layer.
 * Admin users redirect to /admin.
 *
 * Hall ↔ Workroom relationship:
 *   The Hall owns: welcome, narrative, What We Heard, team, orientation.
 *   The Workroom owns: live status, blockers, motion, sessions, decisions.
 *   Both surfaces read the same Notion OS. No data duplication.
 *   The Hall remains accessible via sidebar navigation.
 */

const NAV = [
  { label: "The Hall",     href: "/hall",     icon: "◈" },
  { label: "The Workroom", href: "/workroom", icon: "◻" },
];

function formatDate(iso: string | null | undefined): string {
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

function cleanSessionTitle(raw: string): string {
  return (
    raw
      .replace(/^\[(?:Meeting|Email|Call|Workshop)\]\s*/i, "")
      .replace(/^[^—–-]+[—–-]\s*/, "")
      .trim() || raw
  );
}

export default async function WorkroomPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  if (isAdminUser(user.id) || isAdminEmail(email)) redirect("/admin");
  const projectId = getProjectIdForUser(email);

  if (!projectId) {
    return (
      <div className="flex min-h-screen bg-[#EFEFEA]">
        <Sidebar items={NAV} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center bg-white rounded-2xl border border-[#E0E0D8] p-10 max-w-sm">
            <div className="w-12 h-12 bg-[#131218] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-[#B2FF59] text-lg">◻</span>
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

  const [project, evidence, documents, activity] = await Promise.all([
    getProjectById(projectId),
    getEvidenceForProject(projectId),
    getDocumentsForProject(projectId),
    getSourceActivity(projectId),
  ]);

  if (!project) redirect("/sign-in");

  // Workspace gate: only workroom projects enter here.
  if (project.primaryWorkspace !== "workroom" || !WORKSPACE_READY.workroom) {
    redirect("/hall");
  }

  // ── WorkroomProject ──────────────────────────────────────────────────────
  const workroomProject: WorkroomProject = {
    id:           project.id,
    name:         project.name,
    stage:        project.stage || "Active",
    workroomMode: project.workroomMode || "",
    lastUpdated:  formatDate(project.lastUpdate) || "—",
    currentFocus: project.hallCurrentFocus || "",
    draftUpdate:  project.draftUpdate || "",
  };

  // ── Active Blockers ──────────────────────────────────────────────────────
  const blockers: WorkroomBlocker[] = evidence
    .filter((e) => e.type === "Blocker" && e.validationStatus === "Validated")
    .map((e) => ({
      id:      e.id,
      title:   e.title,
      excerpt: e.excerpt || undefined,
    }));

  // ── Session Log ──────────────────────────────────────────────────────────
  const sessions: WorkroomSession[] = activity.meetings
    .filter((m) => !!m.processedSummary)
    .map((m) => ({
      id:      m.id,
      title:   cleanSessionTitle(m.title),
      date:    formatDate(m.date) || "—",
      summary: m.processedSummary!,
    }));

  // ── Agreements ───────────────────────────────────────────────────────────
  const decisions: WorkroomDecision[] = evidence
    .filter((e) => e.type === "Decision" && e.validationStatus === "Validated")
    .map((e) => ({
      id:      e.id,
      title:   e.title,
      date:    formatDate(e.dateCaptured) || "—",
      context: e.excerpt || undefined,
    }));

  // ── Activity Delta ────────────────────────────────────────────────────────
  // Derived entirely from already-loaded data — no extra fetches.
  const activitySummary: WorkroomActivitySummary = {
    sessionCount:  sessions.length,
    decisionCount: decisions.length,
    blockerCount:  blockers.length,
    lastSession:   sessions[0]
      ? { title: sessions[0].title, date: sessions[0].date }
      : undefined,
  };

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} projectName={project.name} />

      <main className="flex-1 overflow-auto">
        <WorkroomHeader project={workroomProject} />

        <div className="px-8 py-6">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Latest OS status — distinct from editorial currentFocus */}
            <ExecutiveSnapshot project={workroomProject} />

            {/* Active blockers — surface before anything else */}
            <ActiveBlockers blockers={blockers} />

            {/* Activity pulse — sessions, decisions, blocker count */}
            <WorkroomDelta activity={activitySummary} />

            {/* What's in motion + Operational materials */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <WhatsInMotion project={workroomProject} />
              <DocumentsSection documents={documents} />
            </div>

            {/* Session log — working session recaps */}
            <SessionLog sessions={sessions} />

            {/* Agreements reached — validated decisions */}
            <AgreementsReached decisions={decisions} />

            {/* Digital Residents — capability layer, closes the Workroom */}
            <WorkroomDigitalResidents />

          </div>
        </div>
      </main>
    </div>
  );
}
