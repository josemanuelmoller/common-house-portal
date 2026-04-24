import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
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
      <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
        <Sidebar items={NAV} />
        <main className="flex-1 flex items-center justify-center" style={{ fontFamily: "var(--font-hall-sans)" }}>
          <div className="text-center p-10 max-w-sm" style={{ border: "1px solid var(--hall-ink-0)", borderRadius: 3 }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--hall-ink-0)" }}>
              <span className="text-lg" style={{ color: "var(--hall-lime)" }}>◧</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>
              No project linked
            </h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>
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
      <div
        style={{
          minHeight: "100vh",
          background: "var(--hall-paper-0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-hall-sans)",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center", padding: "2rem" }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--hall-muted-2)",
              marginBottom: "1rem",
              fontFamily: "var(--font-hall-mono)",
            }}
          >
            {project.name}
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, marginBottom: "0.5rem", color: "var(--hall-ink-0)", letterSpacing: "-0.01em" }}>
            Tu{" "}
            <em
              style={{
                fontFamily: "var(--font-hall-display)",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              Garage
            </em>{" "}
            está en preparación
          </h1>
          <p style={{ color: "var(--hall-muted-2)", marginBottom: "2rem", fontSize: 14 }}>
            El equipo Common House está configurando tu espacio. Te avisaremos cuando esté listo.
          </p>
          <a href="/hall" className="hall-btn-primary">
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
              COMMON HOUSE · GARAGE ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{garageProject.name}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              The{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                garage
              </em>
              .
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className="text-[10px] uppercase tracking-[0.08em]"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              {garageProject.stage}
              {garageProject.garageMode ? ` · ${garageProject.garageMode}` : ""}
            </span>
            <span
              className="text-[10px]"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
            >
              {garageProject.lastUpdated}
            </span>
          </div>
        </header>

        <div className="px-9 py-7">
          <div className="max-w-4xl mx-auto">

            {/* 60-second truth — where the build is right now */}
            <div className="mb-7">
              <GarageSnapshot project={garageProject} />
            </div>

            {/* Active blockers — surface before anything else */}
            <div className="mb-7">
              <GarageBlockers blockers={blockers} />
            </div>

            {/* Commitments + Materials — paired side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 items-start mb-7">
              <GarageCommitments commitments={commitments} />
              <GarageMaterials materials={materials} />
            </div>

            {/* Working sessions — what actually happened */}
            <div className="mb-7">
              <GarageSessions sessions={sessions} />
            </div>

            {/* Decisions locked — what the team agreed on */}
            <div className="mb-7">
              <GarageDecisions decisions={decisions} />
            </div>

            {/* Digital Residents — capability layer, closes the Garage */}
            <GarageDigitalResidents />

          </div>
        </div>
      </main>
    </div>
  );
}
