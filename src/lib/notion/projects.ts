import { notion, DB, prop, text, select, multiSelect, checkbox, date, relationIds } from "./core";
import { fetchAllEvidence } from "./evidence";
import { getAllSources } from "./sources";

// ─── Projects ─────────────────────────────────────────────────────────────────

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
  // Hall editorial fields — written by CH team in Notion, read by /hall
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

// ─── Project queries ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseProject(page: any): Project {
  return {
    id: page.id,
    name: text(prop(page, "Project Name")),
    status: select(prop(page, "Project Status")),
    stage: select(prop(page, "Current Stage")),
    statusSummary: text(prop(page, "Status Summary")),
    draftUpdate: text(prop(page, "Draft Status Update")),
    lastUpdate: date(prop(page, "Last Status Update")),
    updateNeeded: checkbox(prop(page, "Project Update Needed?")),
    geography: multiSelect(prop(page, "Geography")),
    themes: multiSelect(prop(page, "Themes / Topics")),
    hallWelcomeNote:    text(prop(page, "Hall Welcome Note")),
    hallCurrentFocus:   text(prop(page, "Hall Current Focus")),
    hallNextMilestone:  text(prop(page, "Hall Next Milestone")),
    hallChallenge:      text(prop(page, "Hall Challenge")),
    hallMattersMost:    text(prop(page, "Hall Matters Most")),
    hallObstacles:      text(prop(page, "Hall Obstacles")),
    hallSuccess:        text(prop(page, "Hall Success")),
    // House architecture — workspace routing and room configuration
    // See src/types/house.ts for full model documentation
    primaryWorkspace:  select(prop(page, "Primary Workspace"))  || "hall",
    engagementStage:   select(prop(page, "Engagement Stage")),
    engagementModel:   select(prop(page, "Engagement Model")),
    workroomMode:      select(prop(page, "Workroom Mode")),
    hallMode:          page.properties["Hall Mode"]?.select?.name ?? "explore",
    grantEligible:     page.properties["Grant Eligible"]?.checkbox ?? false,
    lastMeetingDate:   date(prop(page, "Last Meeting Date")),
  };
}

export async function getAllProjects(): Promise<Project[]> {
  const res = await notion.databases.query({
    database_id: DB.projects,
    filter: { property: "Project Status", select: { equals: "Active" } },
    sorts: [{ property: "Last Status Update", direction: "descending" }],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => parseProject(page));
}

export async function getProjectById(id: string): Promise<Project | null> {
  // Supabase-only projects (born from workroom-bridge auto-creation) carry a
  // synthetic notion_id like `local-<uuid>`. Skip Notion entirely for those.
  if (id.startsWith("local-")) {
    return getProjectFromSupabase(id);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: id });
    return parseProject(page);
  } catch {
    // Final fallback — if Notion errors, try Supabase mirror.
    return getProjectFromSupabase(id);
  }
}

async function getProjectFromSupabase(notionId: string): Promise<Project | null> {
  const { getSupabaseServerClient } = await import("../supabase-server");
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("projects")
    .select("notion_id, name, project_status, current_stage, status_summary, draft_status_update, last_status_update, last_meeting_date, update_needed, geography, themes, hall_welcome_note, hall_current_focus, hall_next_milestone, hall_challenge, hall_matters_most, hall_obstacles, hall_success, primary_workspace, engagement_stage, engagement_model, workroom_mode, hall_mode, grant_eligible")
    .eq("notion_id", notionId)
    .maybeSingle();
  if (!data) return null;
  return {
    id:                 data.notion_id as string,
    name:               (data.name as string) ?? "",
    status:             (data.project_status as string) ?? "",
    stage:              (data.current_stage as string) ?? "",
    statusSummary:      (data.status_summary as string) ?? "",
    draftUpdate:        (data.draft_status_update as string) ?? "",
    lastUpdate:         (data.last_status_update as string | null) ?? null,
    lastMeetingDate:    (data.last_meeting_date as string | null) ?? null,
    updateNeeded:       Boolean(data.update_needed),
    geography:          data.geography ? [data.geography as string] : [],
    themes:             data.themes ? [data.themes as string] : [],
    hallWelcomeNote:    (data.hall_welcome_note as string) ?? "",
    hallCurrentFocus:   (data.hall_current_focus as string) ?? "",
    hallNextMilestone:  (data.hall_next_milestone as string) ?? "",
    hallChallenge:      (data.hall_challenge as string) ?? "",
    hallMattersMost:    (data.hall_matters_most as string) ?? "",
    hallObstacles:      (data.hall_obstacles as string) ?? "",
    hallSuccess:        (data.hall_success as string) ?? "",
    primaryWorkspace:   (data.primary_workspace as string) ?? "hall",
    engagementStage:    (data.engagement_stage as string) ?? "",
    engagementModel:    (data.engagement_model as string) ?? "",
    workroomMode:       (data.workroom_mode as string) ?? "",
    hallMode:           (data.hall_mode as string | undefined) ?? "explore",
    grantEligible:      Boolean(data.grant_eligible),
  };
}

// Projects enriched with evidence + sources counts (for home cards)
export async function getProjectsOverview(): Promise<ProjectCard[]> {
  const [projects, evidence, allSrcs] = await Promise.all([
    getAllProjects(),
    fetchAllEvidence(),
    getAllSources(),
  ]);

  return projects.map(project => {
    const projEvidence = evidence.filter(e =>
      relationIds(prop(e, "Project")).includes(project.id)
    );
    const projSources = allSrcs.filter(s => s.projectId === project.id);

    const emailCount    = projSources.filter(s => s.sourceType.includes("Email")   || s.sourceType === "Gmail").length;
    const meetingCount  = projSources.filter(s => s.sourceType.includes("Meeting") || s.sourceType === "Fireflies").length;
    const documentCount = projSources.filter(s => s.sourceType === "Document"      || s.sourceType === "Google Drive").length;

    return {
      ...project,
      evidenceCount: projEvidence.length,
      validatedCount: projEvidence.filter(e => {
        const vs = select(prop(e, "Validation Status"));
        return vs === "Validated" || vs === "Reviewed";
      }).length,
      blockerCount: projEvidence.filter(e =>
        select(prop(e, "Evidence Type")) === "Blocker" &&
        select(prop(e, "Validation Status")) === "Validated"
      ).length,
      sourcesCount: projSources.length,
      emailCount,
      meetingCount,
      documentCount,
      decisionCount: projEvidence.filter(e =>
        select(prop(e, "Evidence Type")) === "Decision" &&
        select(prop(e, "Validation Status")) === "Validated"
      ).length,
      dependencyCount: projEvidence.filter(e =>
        select(prop(e, "Evidence Type")) === "Dependency" &&
        select(prop(e, "Validation Status")) === "Validated"
      ).length,
      outcomeCount: projEvidence.filter(e =>
        select(prop(e, "Evidence Type")) === "Outcome" &&
        select(prop(e, "Validation Status")) === "Validated"
      ).length,
      newEvidenceCount: projEvidence.filter(e =>
        select(prop(e, "Validation Status")) === "New"
      ).length,
      // Include both Reusable and Canonical tiers (Canonical is the higher tier)
      reusableCount: projEvidence.filter(e =>
        (select(prop(e, "Reusability Level")) === "Reusable" ||
         select(prop(e, "Reusability Level")) === "Canonical") &&
        select(prop(e, "Validation Status")) === "Validated"
      ).length,
      lastEvidenceDate: projEvidence.reduce<string | null>((latest, e) => {
        const d = date(prop(e, "Date Captured"));
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
  // Supabase-only project — count from Supabase evidence.
  if (projectId?.startsWith("local-")) {
    return getDashboardStatsFromSupabase(projectId);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidenceFilter: any = projectId
    ? { property: "Project", relation: { contains: projectId } }
    : undefined;

  const [projectsRes, evidenceRes] = await Promise.all([
    notion.databases.query({ database_id: DB.projects, page_size: 100 }),
    notion.databases.query({
      database_id: DB.evidence,
      filter: evidenceFilter,
      page_size: 100,
    }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = projectsRes.results as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence = evidenceRes.results as any[];

  return {
    totalProjects: projects.length,
    activeProjects: projects.filter(p => select(prop(p, "Project Status")) === "Active").length,
    totalEvidence: evidence.length,
    validatedEvidence: evidence.filter(e => select(prop(e, "Validation Status")) === "Validated").length,
    pendingEvidence: evidence.filter(e => select(prop(e, "Validation Status")) === "New").length,
    blockers: evidence.filter(e =>
      select(prop(e, "Evidence Type")) === "Blocker" &&
      select(prop(e, "Validation Status")) === "Validated"
    ).length,
    dependencies: evidence.filter(e =>
      select(prop(e, "Evidence Type")) === "Dependency" &&
      select(prop(e, "Validation Status")) === "Validated"
    ).length,
    // Include both Reusable and Canonical tiers
    knowledgeCandidates: evidence.filter(e =>
      (select(prop(e, "Reusability Level")) === "Reusable" ||
       select(prop(e, "Reusability Level")) === "Canonical") &&
      select(prop(e, "Validation Status")) === "Validated"
    ).length,
  };
}
