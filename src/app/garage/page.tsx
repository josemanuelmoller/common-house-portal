import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { GarageHeader } from "@/components/garage/GarageHeader";
import { GarageSnapshot } from "@/components/garage/GarageSnapshot";
import { GarageBlockers } from "@/components/garage/GarageBlockers";
import { GarageCommitments } from "@/components/garage/GarageCommitments";
import { GarageSessions } from "@/components/garage/GarageSessions";
import { GarageDecisions } from "@/components/garage/GarageDecisions";
import { GarageMaterials } from "@/components/garage/GarageMaterials";
import { GarageDigitalResidents } from "@/components/garage/GarageDigitalResidents";
import {
  getProjectById,
  getEvidenceForProject,
  getDocumentsForProject,
  getSourceActivity,
} from "@/lib/notion";
import { getProjectIdForUser, isAdminUser, isAdminEmail } from "@/lib/clients";
import { WORKSPACE_READY } from "@/types/workroom";
import type {
  GarageProject,
  GarageBlocker,
  GarageCommitment,
  GarageSession,
  GarageDecision,
  GarageMaterial,
} from "@/types/garage";

/**
 * /garage — The Garage (client-facing startup / venture workspace).
 *
 * Visible to clients whose project has Primary Workspace = "garage".
 * Non-garage projects redirect to /hall — The Hall remains their entry layer.
 * Admin users redirect to /admin.
 *
 * Hall ↔ Garage relationship:
 *   The Hall owns: welcome, narrative, What We Heard, team, orientation.
 *   The Garage owns: build focus, commitments, blockers, sessions, decisions, materials.
 *   Both surfaces read the same Notion OS. No data duplication.
 *   The Hall remains accessible via sidebar navigation.
 *
 * Status: BUILT ✓ — waiting for first startup project to be assigned.
 * To activate: set Primary Workspace = "garage" on a CH Projects [OS v2] entry,
 * then add the client email to CLIENT_REGISTRY in src/lib/clients.ts.
 */

const NAV = [
  { label: "The Hall",   href: "/hall",   icon: "◈" },
  { label: "The Garage", href: "/garage", icon: "◧" },
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

export default async function GaragePage() {
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
              <span className="text-[#B2FF59] text-lg">◧</span>
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

  // Workspace gate: only garage projects enter here.
  // Non-garage projects or when garage is not yet ready → show status screen.
  if (project.primaryWorkspace !== "garage" || !WORKSPACE_READY.garage) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg, #eeeee8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 480, textAlign: "center", padding: "2rem" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,0,0,0.38)", marginBottom: "1rem" }}>
            {project.name}
          </p>
          <h1 style={{ fontSize: "2rem", fontWeight: 300, marginBottom: "0.5rem" }}>
            Tu <em style={{ fontWeight: 900, fontStyle: "italic" }}>Garage</em> está en preparación
          </h1>
          <p style={{ color: "rgba(0,0,0,0.55)", marginBottom: "2rem" }}>
            El equipo Common House está configurando tu espacio. Te avisaremos cuando esté listo.
          </p>
          <a href="/hall" style={{ display: "inline-block", background: "#B2FF59", color: "#000", fontWeight: 700, padding: "0.75rem 1.5rem", borderRadius: 8, textDecoration: "none", fontSize: 14 }}>
            Volver al Hall
          </a>
        </div>
      </div>
    )
  }

  // ── GarageProject ────────────────────────────────────────────────────────
  const garageProject: GarageProject = {
    id:           project.id,
    name:         project.name,
    stage:        project.stage || "Active",
    garageMode:   project.workroomMode || "",
    lastUpdated:  formatDate(project.lastUpdate) || "—",
    currentFocus: project.hallCurrentFocus || "",
    draftUpdate:  project.draftUpdate || "",
  };

  // ── Active Blockers ──────────────────────────────────────────────────────
  const blockers: GarageBlocker[] = evidence
    .filter((e) => e.type === "Blocker" && e.validationStatus === "Validated")
    .map((e) => ({
      id:      e.id,
      title:   e.title,
      excerpt: e.excerpt || undefined,
    }));

  // ── Commitments — derived from Action Item evidence ───────────────────────
  // Action Items = things explicitly committed to in sessions, validated by the OS.
  const commitments: GarageCommitment[] = evidence
    .filter((e) => e.type === "Action Item" && e.validationStatus === "Validated")
    .map((e) => ({
      id:      e.id,
      title:   e.title,
      excerpt: e.excerpt || undefined,
      date:    formatDate(e.dateCaptured) || undefined,
    }));

  // ── Sessions ─────────────────────────────────────────────────────────────
  const sessions: GarageSession[] = activity.meetings
    .filter((m) => !!m.processedSummary)
    .map((m) => ({
      id:      m.id,
      title:   cleanSessionTitle(m.title),
      date:    formatDate(m.date) || "—",
      summary: m.processedSummary!,
    }));

  // ── Decisions ────────────────────────────────────────────────────────────
  const decisions: GarageDecision[] = evidence
    .filter((e) => e.type === "Decision" && e.validationStatus === "Validated")
    .map((e) => ({
      id:      e.id,
      title:   e.title,
      date:    formatDate(e.dateCaptured) || "—",
      context: e.excerpt || undefined,
    }));

  // ── Materials ────────────────────────────────────────────────────────────
  const materials: GarageMaterial[] = documents.map((d) => ({
    id:        d.id,
    title:     d.title,
    url:       d.url,
    platform:  d.platform || "Google Drive",
    addedDate: formatDate(d.sourceDate) || undefined,
  }));

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} projectName={project.name} />

      <main className="flex-1 overflow-auto">
        <GarageHeader project={garageProject} />

        <div className="px-8 py-6">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* 60-second truth — where the build is right now */}
            <GarageSnapshot project={garageProject} />

            {/* Active blockers — surface before anything else */}
            <GarageBlockers blockers={blockers} />

            {/* Commitments + Materials — paired side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <GarageCommitments commitments={commitments} />
              <GarageMaterials materials={materials} />
            </div>

            {/* Working sessions — what actually happened */}
            <GarageSessions sessions={sessions} />

            {/* Decisions locked — what the team agreed on */}
            <GarageDecisions decisions={decisions} />

            {/* Digital Residents — capability layer, closes the Garage */}
            <GarageDigitalResidents />

          </div>
        </div>
      </main>
    </div>
  );
}
