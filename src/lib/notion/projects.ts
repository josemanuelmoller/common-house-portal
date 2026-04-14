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
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: id });
    return parseProject(page);
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
      validatedCount: projEvidence.filter(e =>
        select(prop(e, "Validation Status")) === "Validated"
      ).length,
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

export async function getDashboardStats(projectId?: string): Promise<DashboardStats> {
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
