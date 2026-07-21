import { fetchAllEvidence } from "./evidence";
import { getAllSources } from "./sources";

// ─── Projects (Supabase-backed) ───────────────────────────────────────────────
//
// This module reads exclusively from Supabase (public.projects). No Notion.
// The `id` field on every returned record is the row's `notion_id` — the stable
// id used by call sites and for URL reconstruction.

export type Project = {
  id: string;
  name: string;
  status: string;
  stage: string;
  statusSummary: string;
  draftUpdate: string;
  lastUpdate: string | null;
  lastMeetingDate: string | null;
  updateNeeded: boolean;
  geography: string[];
  themes: string[];
  // Hall editorial fields — written by CH team, read by /hall
  hallWelcomeNote: string;
  hallCurrentFocus: string;
  hallNextMilestone: string;
  hallChallenge: string;
  hallMattersMost: string;
  hallObstacles: string;
  hallSuccess: string;
  // House architecture fields — drive workspace routing and room configuration
  // Source of truth: CH Projects [OS v2] select properties
  // primaryWorkspace: "hall" | "garage" | "workroom" — default "hall"
  // See src/types/house.ts for full architecture documentation
  primaryWorkspace: string;
  engagementStage: string;
  engagementModel: string;
  workroomMode: string;
  hallMode?: string;
  grantEligible?: boolean;
};

export type ProjectCard = Project & {
  evidenceCount: number;
  validatedCount: number;
  blockerCount: number;
  sourcesCount: number;
  emailCount: number;
  meetingCount: number;
  documentCount: number;
  decisionCount: number;
  dependencyCount: number;
  outcomeCount: number;
  newEvidenceCount: number;
  reusableCount: number;
  lastEvidenceDate: string | null;  // most recent evidence Date Captured for this project
  grantEligible?: boolean;
};

export type DashboardStats = {
  totalProjects: number;
  activeProjects: number;
  totalEvidence: number;
  validatedEvidence: number;
  pendingEvidence: number;
  blockers: number;
  dependencies: number;
  knowledgeCandidates: number;
};

const PROJECT_COLUMNS =
  "notion_id, name, project_status, current_stage, status_summary, draft_status_update, last_status_update, last_meeting_date, update_needed, geography, themes, hall_welcome_note, hall_current_focus, hall_next_milestone, hall_challenge, hall_matters_most, hall_obstacles, hall_success, primary_workspace, engagement_stage, engagement_model, workroom_mode, hall_mode, grant_eligible";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// themes / geography are stored as TEXT and may be JSON-encoded arrays,
// comma-separated strings, or a single plain value. Parse defensively.
function parseTextList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return (v as unknown[]).map(x => String(x));
  if (typeof v !== "string") return [];
  const s = v.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(x => String(x));
    } catch {
      // not valid JSON — fall through to string handling
    }
  }
  if (s.includes(",")) return s.split(",").map(t => t.trim()).filter(Boolean);
  return [s];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseProjectRow(data: any): Project {
  return {
    id:                 (data.notion_id as string) ?? "",
    name:               (data.name as string) ?? "",
    status:             (data.project_status as string) ?? "",
    stage:              (data.current_stage as string) ?? "",
    statusSummary:      (data.status_summary as string) ?? "",
    draftUpdate:        (data.draft_status_update as string) ?? "",
    lastUpdate:         (data.last_status_update as string | null) ?? null,
    lastMeetingDate:    (data.last_meeting_date as string | null) ?? null,
    updateNeeded:       Boolean(data.update_needed),
    geography:          parseTextList(data.geography),
    themes:             parseTextList(data.themes),
    hallWelcomeNote:    (data.hall_welcome_note as string) ?? "",
    hallCurrentFocus:   (data.hall_current_focus as string) ?? "",
    hallNextMilestone:  (data.hall_next_milestone as string) ?? "",
    hallChallenge:      (data.hall_challenge as string) ?? "",
    hallMattersMost:    (data.hall_matters_most as string) ?? "",
    hallObstacles:      (data.hall_obstacles as string) ?? "",
    hallSuccess:        (data.hall_success as string) ?? "",
    primaryWorkspace:   (data.primary_workspace as string) || "hall",
    engagementStage:    (data.engagement_stage as string) ?? "",
    engagementModel:    (data.engagement_model as string) ?? "",
    workroomMode:       (data.workroom_mode as string) ?? "",
    hallMode:           (data.hall_mode as string | undefined) ?? "explore",
    grantEligible:      Boolean(data.grant_eligible),
  };
}

// ─── Project queries ──────────────────────────────────────────────────────────

export async function getAllProjects(): Promise<Project[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("project_status", "Active")
      .order("last_status_update", { ascending: false, nullsFirst: false });
    if (error || !data) return [];
    return data.map(parseProjectRow);
  } catch {
    return [];
  }
}

export async function getProjectById(id: string): Promise<Project | null> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("notion_id", id)
      .maybeSingle();
    if (error || !data) return null;
    return parseProjectRow(data);
  } catch {
    return null;
  }
}

// Projects enriched with evidence + sources counts (for home cards)
export async function getProjectsOverview(): Promise<ProjectCard[]> {
  const [projects, evidence, allSrcs] = await Promise.all([
    getAllProjects(),
    fetchAllEvidence(),
    getAllSources(),
  ]);

  return projects.map(project => {
    const projEvidence = evidence.filter(e => e.project_notion_id === project.id);
    const projSources = allSrcs.filter(s => s.projectId === project.id);

    const emailCount    = projSources.filter(s => s.sourceType.includes("Email")   || s.sourceType === "Gmail").length;
    const meetingCount  = projSources.filter(s => s.sourceType.includes("Meeting") || s.sourceType === "Fireflies").length;
    const documentCount = projSources.filter(s => s.sourceType === "Document"      || s.sourceType === "Google Drive").length;

    return {
      ...project,
      evidenceCount: projEvidence.length,
      validatedCount: projEvidence.filter(e => {
        const vs = e.validation_status;
        return vs === "Validated" || vs === "Reviewed";
      }).length,
      blockerCount: projEvidence.filter(e =>
        e.evidence_type === "Blocker" && e.validation_status === "Validated"
      ).length,
      sourcesCount: projSources.length,
      emailCount,
      meetingCount,
      documentCount,
      decisionCount: projEvidence.filter(e =>
        e.evidence_type === "Decision" && e.validation_status === "Validated"
      ).length,
      dependencyCount: projEvidence.filter(e =>
        e.evidence_type === "Dependency" && e.validation_status === "Validated"
      ).length,
      outcomeCount: projEvidence.filter(e =>
        e.evidence_type === "Outcome" && e.validation_status === "Validated"
      ).length,
      newEvidenceCount: projEvidence.filter(e =>
        e.validation_status === "New"
      ).length,
      // Include both Reusable and Canonical tiers (Canonical is the higher tier)
      reusableCount: projEvidence.filter(e =>
        (e.reusability_level === "Reusable" || e.reusability_level === "Canonical") &&
        e.validation_status === "Validated"
      ).length,
      lastEvidenceDate: projEvidence.reduce<string | null>((latest, e) => {
        const d = (e.date_captured as string | null) ?? null;
        if (!d) return latest;
        if (!latest) return d;
        return d > latest ? d : latest;
      }, null),
    };
  });
}

async function getDashboardStatsFromSupabase(projectId: string): Promise<DashboardStats> {
  const { getSupabaseServerClient } = await import("../supabase-server");
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("evidence")
    .select("evidence_type, validation_status, reusability_level")
    .eq("project_notion_id", projectId)
    .limit(500);
  if (error || !data) {
    return {
      totalProjects: 0, activeProjects: 0, totalEvidence: 0, validatedEvidence: 0,
      pendingEvidence: 0, blockers: 0, dependencies: 0, knowledgeCandidates: 0,
    };
  }
  const isValidated = (e: typeof data[number]) => e.validation_status === "Validated";
  return {
    totalProjects:       0,
    activeProjects:      0,
    totalEvidence:       data.length,
    validatedEvidence:   data.filter(isValidated).length,
    pendingEvidence:     data.filter(e => e.validation_status === "New").length,
    blockers:            data.filter(e => e.evidence_type === "Blocker"    && isValidated(e)).length,
    dependencies:        data.filter(e => e.evidence_type === "Dependency" && isValidated(e)).length,
    knowledgeCandidates: data.filter(e => (e.reusability_level === "Reusable" || e.reusability_level === "Canonical") && isValidated(e)).length,
  };
}

export async function getDashboardStats(projectId?: string): Promise<DashboardStats> {
  // Supabase-only project — count from Supabase evidence only.
  if (projectId?.startsWith("local-")) {
    return getDashboardStatsFromSupabase(projectId);
  }
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    let evidenceQuery = sb
      .from("evidence")
      .select("evidence_type, validation_status, reusability_level");
    if (projectId) evidenceQuery = evidenceQuery.eq("project_notion_id", projectId);

    const [projectsRes, evidenceRes] = await Promise.all([
      sb.from("projects").select("project_status").limit(100),
      evidenceQuery.limit(100),
    ]);

    const projects = projectsRes.data ?? [];
    const evidence = evidenceRes.data ?? [];

    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.project_status === "Active").length,
      totalEvidence: evidence.length,
      validatedEvidence: evidence.filter(e => e.validation_status === "Validated").length,
      pendingEvidence: evidence.filter(e => e.validation_status === "New").length,
      blockers: evidence.filter(e =>
        e.evidence_type === "Blocker" && e.validation_status === "Validated"
      ).length,
      dependencies: evidence.filter(e =>
        e.evidence_type === "Dependency" && e.validation_status === "Validated"
      ).length,
      // Include both Reusable and Canonical tiers
      knowledgeCandidates: evidence.filter(e =>
        (e.reusability_level === "Reusable" || e.reusability_level === "Canonical") &&
        e.validation_status === "Validated"
      ).length,
    };
  } catch {
    return {
      totalProjects: 0, activeProjects: 0, totalEvidence: 0, validatedEvidence: 0,
      pendingEvidence: 0, blockers: 0, dependencies: 0, knowledgeCandidates: 0,
    };
  }
}
