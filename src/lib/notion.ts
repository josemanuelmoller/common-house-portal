// ─── Core (client · DB · helpers) ────────────────────────────────────────────
// Extracted to src/lib/notion/core.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
// Re-exported here so all existing imports from "@/lib/notion" keep working.
// Domain modules will be extracted incrementally; this file shrinks over time.
export * from "./notion/core";
import { notion, DB, prop, text, select, multiSelect, num, checkbox, date, relationFirst, relationIds } from "./notion/core";

// ─── Agent Drafts ─────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/drafts.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/drafts";

// ─── Daily Briefings ──────────────────────────────────────────────────────────
// Extracted to src/lib/notion/briefings.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/briefings";

// ─── Insight Briefs ───────────────────────────────────────────────────────────
// Extracted to src/lib/notion/insights.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/insights";

// ─── Knowledge Assets ─────────────────────────────────────────────────────────
// Extracted to src/lib/notion/knowledge.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/knowledge";

// ─── Decision Items ───────────────────────────────────────────────────────────
// Extracted to src/lib/notion/decisions.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/decisions";

// ─── Living Room ──────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/living-room.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/living-room";

// ─── Evidence ─────────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/evidence.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/evidence";

// ─── Sources ──────────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/sources.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
// getAllSources is imported locally because getProjectsOverview (Projects section,
// still in this file) calls it directly.
export * from "./notion/sources";
import { getAllSources } from "./notion/sources";

// ─── Types ───────────────────────────────────────────────────────────────────

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllEvidence(): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: DB.evidence,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    all.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return all;
}

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

// ─── People & Orgs ───────────────────────────────────────────────────────────

export type PersonRecord = {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  classification: "Internal" | "External" | "";
  roles: string[];
  linkedin?: string;   // populated by getAllPeople() — not always set
  location?: string;   // "City, Country" from People DB — not always set
};

export type OrgRecord = {
  id: string;
  name: string;
  category: string;
  relationshipStage: string;
  website: string;
  location: string;
};

export type ProjectPeople = {
  lead: PersonRecord[];
  team: PersonRecord[];
  primaryOrg: OrgRecord[];
  otherOrgs: OrgRecord[];
};

async function resolvePerson(id: string): Promise<PersonRecord | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: id });
    return {
      id: page.id,
      name: text(prop(page, "Full Name")),
      jobTitle: text(prop(page, "Job Title / Role")),
      email: page.properties?.["Email"]?.email ?? "",
      classification: (select(prop(page, "Person Classification")) as PersonRecord["classification"]) ?? "",
      roles: multiSelect(prop(page, "Relationship Roles")),
    };
  } catch {
    return null;
  }
}

async function resolveOrg(id: string): Promise<OrgRecord | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: id });
    return {
      id: page.id,
      name: text(prop(page, "Name")),
      category: select(prop(page, "Organization Category")),
      relationshipStage: select(prop(page, "Relationship Stage")),
      website: page.properties?.["Website"]?.url ?? "",
      location: [
        text(prop(page, "City / HQ City")),
        select(prop(page, "Country")),
      ].filter(Boolean).join(", "),
    };
  } catch {
    return null;
  }
}

export async function getProjectPeople(projectId: string): Promise<ProjectPeople> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: projectId });

    const leadIds      = relationIds(prop(page, "Project Lead"));
    const teamIds      = relationIds(prop(page, "Team"));
    const primaryOrgIds = relationIds(prop(page, "Primary Organization"));
    const otherOrgIds  = relationIds(prop(page, "Other Organizations"));

    const [lead, team, primaryOrg, otherOrgs] = await Promise.all([
      Promise.all(leadIds.map(resolvePerson)),
      Promise.all(teamIds.map(resolvePerson)),
      Promise.all(primaryOrgIds.map(resolveOrg)),
      Promise.all(otherOrgIds.map(resolveOrg)),
    ]);

    return {
      lead:       lead.filter(Boolean)       as PersonRecord[],
      team:       team.filter(Boolean)       as PersonRecord[],
      primaryOrg: primaryOrg.filter(Boolean) as OrgRecord[],
      otherOrgs:  otherOrgs.filter(Boolean)  as OrgRecord[],
    };
  } catch {
    return { lead: [], team: [], primaryOrg: [], otherOrgs: [] };
  }
}

// ─── People — direct DB query (bypasses project-relation dependency) ─────────
//
// Used by The Residents page to surface all CH-network people regardless of
// whether they are linked to an active project. This is the correct source for
// Co-Founders, EIRs, and any people whose primary identity is not project-scoped.
//
// Classification map:
//   Internal + Founder role   → Co-Founders section
//   Internal + other roles    → Core Team section
//   External + Startup Founder → Entrepreneurs in Residence section

export async function getAllPeople(): Promise<PersonRecord[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.people,
      page_size: 100,
    });
    return (res.results as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((page: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const country  = select(prop(page, "Country"));
        const city     = text(prop(page, "City"));
        const location = [city, country].filter(Boolean).join(", ");
        return {
          id:             page.id,
          name:           text(prop(page, "Full Name")),
          jobTitle:       text(prop(page, "Job Title / Role")),
          email:          page.properties?.["Email"]?.email ?? "",
          classification: (select(prop(page, "Person Classification")) as PersonRecord["classification"]) ?? "",
          roles:          multiSelect(prop(page, "Relationship Roles")),
          linkedin:       page.properties?.["LinkedIn"]?.url ?? undefined,
          location:       location || undefined,
        };
      })
      .filter(p => p.name.trim() !== "");
  } catch {
    return [];
  }
}

// ─── Residents — cross-project people aggregation ────────────────────────────

export type ResidentRecord = PersonRecord & {
  projectIds: string[];
  projectNames: string[];
  isLead: boolean;
};

export async function getAllResidents(): Promise<ResidentRecord[]> {
  const projects = await getAllProjects();

  // Fetch each project page to extract person relation IDs (parallel)
  const projectPersonMaps = await Promise.all(
    projects.map(async (project) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page: any = await notion.pages.retrieve({ page_id: project.id });
        const leadIds = relationIds(prop(page, "Project Lead"));
        const teamIds = relationIds(prop(page, "Team"));
        return { projectId: project.id, projectName: project.name, leadIds, teamIds };
      } catch {
        return { projectId: project.id, projectName: project.name, leadIds: [], teamIds: [] };
      }
    })
  );

  // Build personId → project affiliation map
  const personMap = new Map<string, { projectIds: string[]; projectNames: string[]; isLead: boolean }>();
  for (const { projectId, projectName, leadIds, teamIds } of projectPersonMaps) {
    const allIds = [...new Set([...leadIds, ...teamIds])];
    for (const personId of allIds) {
      if (!personMap.has(personId)) {
        personMap.set(personId, { projectIds: [], projectNames: [], isLead: false });
      }
      const entry = personMap.get(personId)!;
      if (!entry.projectIds.includes(projectId)) {
        entry.projectIds.push(projectId);
        entry.projectNames.push(projectName);
      }
      if (leadIds.includes(personId)) entry.isLead = true;
    }
  }

  // Resolve all unique people in parallel
  const uniqueIds = Array.from(personMap.keys());
  const resolved = await Promise.all(uniqueIds.map(resolvePerson));

  return resolved
    .filter(Boolean)
    .map((person) => {
      const aff = personMap.get(person!.id) ?? { projectIds: [], projectNames: [], isLead: false };
      return { ...person!, ...aff };
    })
    .sort((a, b) => {
      if (a.classification === "Internal" && b.classification !== "Internal") return -1;
      if (b.classification === "Internal" && a.classification !== "Internal") return 1;
      return a.name.localeCompare(b.name);
    });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getDashboardStats(projectId?: string): Promise<DashboardStats> {
  const evidenceFilter = projectId
    ? { property: "Project", relation: { contains: projectId } }
    : undefined;

  const [projectsRes, evidenceRes] = await Promise.all([
    notion.databases.query({ database_id: DB.projects, page_size: 100 }),
    notion.databases.query({
      database_id: DB.evidence,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter: evidenceFilter as any,
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

// ─── Content Pipeline ─────────────────────────────────────────────────────────

export type StyleProfile = {
  id: string;
  name: string;
  styleType: string;    // Voice / Tone | Deck Style | Proposal Style | etc.
  scope: string;        // Common House | JMM | Portfolio Startup | Cross-entity
  status: string;       // Active | Draft | Archived
  masterPrompt: string;
  toneSummary: string;
  structuralRules: string;
  vocabularyPatterns: string;
  forbiddenPatterns: string;
  ctaStyle: string;
  firstPersonAllowed: boolean;
};

export type ContentPipelineItem = {
  id: string;
  title: string;
  status: string;       // Draft | Review | Approved | Published | Archived
  contentType: string;  // Post | Newsletter | Article | Report | Investor Update | Proposal
  channel: string;      // LinkedIn | Newsletter | Internal | etc.
  desk: string;         // Comms | Design | Insights | Grants | ""
  projectId: string | null;
  projectName: string;
  draftDate: string | null;
  publishDate: string | null;
  notionUrl: string;
  draftText: string;    // AI-generated draft (Draft Text property, multi-chunk rich_text)
  slideHtml: string;    // HTML slide deck for Deck/One-pager/Proposal content types
};

export async function getContentPipeline(statusFilter?: string): Promise<ContentPipelineItem[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = statusFilter
      ? { property: "Status", select: { equals: statusFilter } }
      : undefined;

    const res = await notion.databases.query({
      database_id: DB.contentPipeline,
      filter,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:          page.id,
      title:       text(prop(page, "Title")) || text(prop(page, "Name")) || "Untitled",
      status:      select(prop(page, "Status")),
      contentType: select(prop(page, "Content Type")),
      channel:     select(prop(page, "Channel")),
      desk:        select(prop(page, "Desk")),
      projectId:   relationFirst(prop(page, "Projects")) ?? relationFirst(prop(page, "Project")),
      projectName: text(prop(page, "Project Name")) || "",
      draftDate:   date(prop(page, "Draft Date")) ?? date(prop(page, "Created Date")),
      publishDate: date(prop(page, "Publish Date")) ?? date(prop(page, "Published Date")),
      notionUrl:   page.url ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftText:   (prop(page, "Draft Text")?.rich_text ?? []).map((r: any) => r.plain_text).join(""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideHtml:   (prop(page, "Slide HTML")?.rich_text ?? []).map((r: any) => r.plain_text).join(""),
    }));
  } catch {
    return [];
  }
}

// ─── Style Profiles ───────────────────────────────────────────────────────────

export async function getStyleProfiles(): Promise<StyleProfile[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.styleProfiles,
      filter: { property: "Status", select: { equals: "Active" } },
      sorts: [{ property: "Scope", direction: "ascending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:                  page.id,
      name:                text(prop(page, "Name")) || "Untitled",
      styleType:           select(prop(page, "Style Type")),
      scope:               select(prop(page, "Scope")),
      status:              select(prop(page, "Status")),
      masterPrompt:        text(prop(page, "Master Prompt")),
      toneSummary:         text(prop(page, "Tone Summary")),
      structuralRules:     text(prop(page, "Structural Rules")),
      vocabularyPatterns:  text(prop(page, "Vocabulary Patterns")),
      forbiddenPatterns:   text(prop(page, "Forbidden Patterns")),
      ctaStyle:            text(prop(page, "CTA Style")),
      firstPersonAllowed:  prop(page, "First Person Allowed")?.checkbox ?? false,
    }));
  } catch {
    return [];
  }
}

// ─── Garage financial layer ───────────────────────────────────────────────────
//
// Architecture: Valuations, Cap Table, and Data Room relate to CH Organizations
// (not CH Projects) via a "Startup" relation field. Financial Snapshots can link
// to CH Projects directly via "Scope Project". The bridge is the project's
// "Primary Organization" relation field.

async function getPrimaryOrgIds(projectId: string): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: projectId });
    const ids = relationIds(prop(page, "Primary Organization"));
    if (ids.length) return ids;

    // Fallback: if "Primary Organization" is not filled, search CH Organizations by
    // project name. Normalise both sides (lowercase, strip spaces/hyphens) so
    // "Way Out" matches "Wayout", "Fair Cycle" matches "faircycle", etc.
    const projectName: string = text(prop(page, "Project Name")) ?? "";
    if (!projectName) return [];

    const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");
    const needle = normalize(projectName);

    // Notion title `contains` filter is case-insensitive — get candidates, then fuzzy-match
    const res = await notion.databases.query({
      database_id: DB.organizations,
      filter: { property: "Name", title: { contains: projectName.split(" ")[0] } },
      page_size: 10,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const org of res.results as any[]) {
      const orgName = text(prop(org, "Name")) ?? "";
      const hay = normalize(orgName);
      if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
        return [org.id];
      }
    }

    return [];
  } catch {
    return [];
  }
}

export type StartupOrgData = {
  id: string;
  name: string;
  mrr: string;
  fundingRound: string;
  investmentStatus: string;
  teamSize: string;
  website: string;
  stage: string;
};

export async function getStartupOrgData(projectId: string): Promise<StartupOrgData | null> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);
    if (!orgIds.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: orgIds[0] });
    return {
      id:               page.id,
      name:             text(prop(page, "Name")),
      mrr:              text(prop(page, "Startup MRR")),
      fundingRound:     select(prop(page, "Startup Funding Round")),
      investmentStatus: select(prop(page, "Startup Investment Status")),
      teamSize:         text(prop(page, "Startup Team Size")),
      website:          page.properties?.["Website"]?.url ?? "",
      stage:            select(prop(page, "Startup Stage")),
    };
  } catch {
    return null;
  }
}

export type FinancialSnapshot = {
  id: string;
  name: string;
  revenue: number | null;
  cost: number | null;
  grossMargin: number | null;
  burn: number | null;
  cash: number | null;
  ar: number | null;
  ap: number | null;
  runway: number | null;
  period: string | null;
};

export async function getFinancialsForProject(projectId: string): Promise<FinancialSnapshot[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.financialSnapshots,
      filter: { property: "Scope Project", relation: { contains: projectId } },
      sorts: [{ property: "Period", direction: "descending" }],
      page_size: 12,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:          page.id,
      name:        text(prop(page, "Snapshot Name")),
      revenue:     prop(page, "Revenue")?.number ?? null,
      cost:        prop(page, "Cost")?.number ?? null,
      grossMargin: prop(page, "Gross Margin")?.number ?? null,
      burn:        prop(page, "Burn")?.number ?? null,
      cash:        prop(page, "Cash")?.number ?? null,
      ar:          prop(page, "AR")?.number ?? null,
      ap:          prop(page, "AP")?.number ?? null,
      runway:      prop(page, "Runway")?.number ?? null,
      period:      date(prop(page, "Period")),
    }));
  } catch {
    return [];
  }
}

export type ValuationRecord = {
  id: string;
  name: string;
  method: string;
  status: string;
  preMoneyMin: number | null;
  preMoneyMax: number | null;
  confidence: string;
  period: string | null;
  keyAssumptions: string;
};

export async function getValuationsForProject(projectId: string): Promise<ValuationRecord[]> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);
    if (!orgIds.length) return [];
    const res = await notion.databases.query({
      database_id: DB.valuations,
      filter: { property: "Startup", relation: { contains: orgIds[0] } },
      sorts: [{ property: "Period", direction: "descending" }],
      page_size: 20,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:             page.id,
      name:           text(prop(page, "Valuation Name")),
      method:         select(prop(page, "Method")),
      status:         select(prop(page, "Status")),
      preMoneyMin:    prop(page, "Pre-money Min (£)")?.number ?? null,
      preMoneyMax:    prop(page, "Pre-money Max (£)")?.number ?? null,
      confidence:     select(prop(page, "Confidence")),
      period:         date(prop(page, "Period")),
      keyAssumptions: text(prop(page, "Key Assumptions")),
    }));
  } catch {
    return [];
  }
}

export type CapTableEntry = {
  id: string;
  name: string;
  shareholderName: string;
  shareholderType: string;
  shareClass: string;
  round: string;
  shares: number | null;
  ownershipPct: number | null;
  dilutedPct: number | null;
  investedAmount: number | null;
  investmentDate: string | null;
};

export async function getCapTableForProject(projectId: string): Promise<CapTableEntry[]> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);
    if (!orgIds.length) return [];
    const res = await notion.databases.query({
      database_id: DB.capTable,
      filter: { property: "Startup", relation: { contains: orgIds[0] } },
      sorts: [{ property: "Investment Date", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:              page.id,
      name:            text(prop(page, "Entry Name")),
      shareholderName: text(prop(page, "Shareholder Name")),
      shareholderType: select(prop(page, "Shareholder Type")),
      shareClass:      select(prop(page, "Share Class")),
      round:           select(prop(page, "Round")),
      shares:          prop(page, "Shares")?.number ?? null,
      ownershipPct:    prop(page, "Ownership Pct")?.number ?? null,
      dilutedPct:      prop(page, "Diluted Pct")?.number ?? null,
      investedAmount:  prop(page, "Invested Amount (£)")?.number ?? null,
      investmentDate:  date(prop(page, "Investment Date")),
    }));
  } catch {
    return [];
  }
}

export type DataRoomItem = {
  id: string;
  name: string;
  category: string;
  documentType: string;
  fileUrl: string;
  status: string;
  priority: string;
  vcRelevance: string;
  notes: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDataRoomPage(page: any): DataRoomItem {
  return {
    id:           page.id,
    name:         text(prop(page, "Item Name")),
    category:     select(prop(page, "Category")),
    documentType: select(prop(page, "Document Type")),
    fileUrl:      page.properties?.["File URL"]?.url ?? "",
    status:       select(prop(page, "Status")),
    priority:     select(prop(page, "Priority")),
    vcRelevance:  select(prop(page, "VC Relevance")),
    notes:        text(prop(page, "Notes")),
  };
}

export async function getDataRoomForProject(projectId: string): Promise<DataRoomItem[]> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);

    // Run both queries in parallel: items linked via Startup relation AND items
    // uploaded before the org was linked (stored by projectId in Notes). This
    // ensures legacy records are never lost when the org relation is later set.
    const [orgRes, notesRes] = await Promise.all([
      orgIds.length
        ? notion.databases.query({
            database_id: DB.dataRoom,
            filter: { property: "Startup", relation: { contains: orgIds[0] } },
            sorts: [{ property: "Priority", direction: "ascending" }],
            page_size: 50,
          })
        : Promise.resolve({ results: [] }),
      notion.databases.query({
        database_id: DB.dataRoom,
        filter: { property: "Notes", rich_text: { contains: projectId } },
        sorts: [{ property: "Priority", direction: "ascending" }],
        page_size: 50,
      }),
    ]);

    // Merge and deduplicate by page id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: any[] = [];
    for (const page of [...orgRes.results, ...notesRes.results]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!seen.has((page as any).id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seen.add((page as any).id);
        merged.push(page);
      }
    }

    return merged.map(mapDataRoomPage);
  } catch {
    return [];
  }
}

// ─── Commercial: Proposals & Offers ──────────────────────────────────────────

export type ProposalBrief = {
  id: string;
  title: string;
  status: string;        // Draft | In Review | Approved | Sent | Won | Lost | Archived
  proposalType: string;  // Exploratory | Scoped | Phased | etc.
  budgetRange: string;   // Under £5k | £5k–£15k | £30k–£75k | etc.
  clientName: string;    // from related project or free text
  geography: string;
  createdDate: string | null;
  notionUrl: string;
};

export type CommercialOffer = {
  id: string;
  title: string;
  offerStatus: string;   // Active | In Development | Deprecated
  offerCategory: string;
  notionUrl: string;
};

export async function getProposalBriefs(): Promise<ProposalBrief[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.proposalBriefs,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:           page.id,
      title:        text(prop(page, "Title")) || text(prop(page, "Name")) || "Untitled",
      status:       select(prop(page, "Status")),
      proposalType: select(prop(page, "Proposal Type")),
      budgetRange:  select(prop(page, "Budget Range")),
      clientName:   text(prop(page, "Client Name")) || text(prop(page, "Client")) || "",
      geography:    select(prop(page, "Geography")) || select(prop(page, "Region")) || "",
      createdDate:  date(prop(page, "Created Date")) ?? (page.created_time?.slice(0, 10) ?? null),
      notionUrl:    page.url ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getCommercialOffers(): Promise<CommercialOffer[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.offers,
      filter: { property: "Offer Status", select: { does_not_equal: "Deprecated" } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:           page.id,
      title:        text(prop(page, "Offer Name")) || text(prop(page, "Name")) || "Untitled",
      offerStatus:  select(prop(page, "Offer Status")),
      offerCategory: select(prop(page, "Offer Category")),
      notionUrl:    page.url ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── Hall v2 — Opportunities by scope ────────────────────────────────────────

export type OpportunityItem = {
  id: string;
  name: string;
  stage: string;               // New | Exploring | Qualifying | Active | Proposal Sent | Negotiation | Won | Lost | Archived
  scope: string;               // CH | Portfolio | Both
  followUpStatus: string;      // None | Needed | Sent | Waiting
  type: string;                // CH Sale | Grant | Partnership | Investor Match
  orgName: string;
  lastEdited: string | null;
  notionUrl: string;
  score: number | null;        // 0–100 qualification score
  qualificationStatus: string; // Qualified | Needs Review | Below Threshold | Not Scored
};

export async function getOpportunitiesByScope(): Promise<{ ch: OpportunityItem[]; portfolio: OpportunityItem[] }> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        and: [
          { property: "Stage", select: { does_not_equal: "Won" } },
          { property: "Stage", select: { does_not_equal: "Lost" } },
          { property: "Stage", select: { does_not_equal: "Archived" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (res.results as any[]).map(page => ({
      id:                   page.id,
      name:                 text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:                select(prop(page, "Stage")),
      scope:                select(prop(page, "Scope")),
      followUpStatus:       select(prop(page, "Follow-up Status")),
      type:                 select(prop(page, "Type")) || select(prop(page, "Opportunity Type")) || "",
      orgName:              text(prop(page, "Organization")) || "",
      lastEdited:           page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:            page.url ?? "",
      score:                num(prop(page, "Opportunity Score")),
      qualificationStatus:  select(prop(page, "Qualification Status")) || "Not Scored",
    }));

    return {
      ch:        all.filter(o => o.scope === "CH" || o.scope === "Both"),
      portfolio: all.filter(o => o.scope === "Portfolio" || o.scope === "Both"),
    };
  } catch {
    return { ch: [], portfolio: [] };
  }
}

// Opportunities where follow-up is needed (opted-in, active pipeline)
export async function getFollowUpOpportunities(): Promise<OpportunityItem[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        and: [
          { property: "Follow-up Status", select: { equals: "Needed" } },
          { property: "Stage", select: { does_not_equal: "Won" } },
          { property: "Stage", select: { does_not_equal: "Lost" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: 20,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:                   page.id,
      name:                 text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:                select(prop(page, "Stage")),
      scope:                select(prop(page, "Scope")),
      followUpStatus:       select(prop(page, "Follow-up Status")),
      type:                 select(prop(page, "Type")) || select(prop(page, "Opportunity Type")) || "",
      orgName:              text(prop(page, "Organization")) || "",
      lastEdited:           page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:            page.url ?? "",
      score:                num(prop(page, "Opportunity Score")),
      qualificationStatus:  select(prop(page, "Qualification Status")) || "Not Scored",
    }));
  } catch {
    return [];
  }
}

// ─── Commercial Pipeline — active pursuit only ───────────────────────────────
// Stages shown: Active | Proposal Sent | Negotiation
// Won/Lost/Archived are excluded (Won → Workroom, Lost/Archived → done)

export type PipelineOpportunity = OpportunityItem & {
  daysInStage: number | null;
};

export async function getPipelineOpportunities(): Promise<{
  active:       PipelineOpportunity[];
  proposalSent: PipelineOpportunity[];
  negotiation:  PipelineOpportunity[];
  recentlyClosed: PipelineOpportunity[]; // Won or Lost in last 30 days
}> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        or: [
          { property: "Stage", select: { equals: "Active" } },
          { property: "Stage", select: { equals: "Proposal Sent" } },
          { property: "Stage", select: { equals: "Negotiation" } },
          { property: "Stage", select: { equals: "Won" } },
          { property: "Stage", select: { equals: "Lost" } },
        ],
      },
      sorts: [{ property: "Opportunity Score", direction: "descending" }],
      page_size: 100,
    });

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: PipelineOpportunity[] = (res.results as any[]).map(page => ({
      id:                  page.id,
      name:                text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:               select(prop(page, "Stage")),
      scope:               select(prop(page, "Scope")),
      followUpStatus:      select(prop(page, "Follow-up Status")),
      type:                select(prop(page, "Type")) || select(prop(page, "Opportunity Type")) || "",
      orgName:             text(prop(page, "Organization")) || "",
      lastEdited:          page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:           page.url ?? "",
      score:               num(prop(page, "Opportunity Score")),
      qualificationStatus: select(prop(page, "Qualification Status")) || "Not Scored",
      daysInStage:         page.last_edited_time
        ? Math.floor((Date.now() - new Date(page.last_edited_time).getTime()) / 86400000)
        : null,
    }));

    return {
      active:         all.filter(o => o.stage === "Active"),
      proposalSent:   all.filter(o => o.stage === "Proposal Sent"),
      negotiation:    all.filter(o => o.stage === "Negotiation"),
      recentlyClosed: all.filter(o =>
        (o.stage === "Won" || o.stage === "Lost") &&
        page_last_edited_after(res.results, o.id, cutoff)
      ),
    };
  } catch {
    return { active: [], proposalSent: [], negotiation: [], recentlyClosed: [] };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page_last_edited_after(results: any[], id: string, cutoff: string): boolean {
  const page = results.find((p: any) => p.id === id);
  return page ? page.last_edited_time >= cutoff : false;
}

// ─── Hall v2 — Relationship warmth ───────────────────────────────────────────

export type WarmthRecord = {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  warmth: string;          // Hot | Warm | Cold | Dormant
  lastContactDate: string | null;
  notionUrl: string;
};

export async function getColdRelationships(): Promise<WarmthRecord[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.people,
      filter: {
        or: [
          { property: "Contact Warmth", select: { equals: "Cold" } },
          { property: "Contact Warmth", select: { equals: "Dormant" } },
        ],
      },
      sorts: [{ property: "Last Contact Date", direction: "ascending" }],
      page_size: 20,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[])
      .map(page => ({
        id:              page.id,
        name:            text(prop(page, "Full Name")),
        jobTitle:        text(prop(page, "Job Title / Role")),
        email:           page.properties?.["Email"]?.email ?? "",
        warmth:          select(prop(page, "Contact Warmth")),
        lastContactDate: date(prop(page, "Last Contact Date")),
        notionUrl:       page.url ?? "",
      }))
      .filter(p => p.name.trim() !== "");
  } catch {
    return [];
  }
}

// ─── Hall v2 — Content ready to publish ──────────────────────────────────────

export type ReadyContent = {
  id: string;
  title: string;
  platform: string;
  contentType: string;
  publishWindow: string;
  notionUrl: string;
};

export async function getReadyContent(): Promise<ReadyContent[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.contentPipeline,
      filter: { property: "Status", select: { equals: "Ready to Publish" } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 10,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:            page.id,
      title:         text(prop(page, "Title")) || text(prop(page, "Name")) || "Untitled",
      platform:      select(prop(page, "Platform")) || select(prop(page, "Channel")) || "",
      contentType:   select(prop(page, "Content Type")),
      publishWindow: text(prop(page, "Publish Window")) || date(prop(page, "Publish Date")) || "",
      notionUrl:     page.url ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── Garage — Portfolio opportunities for a startup ──────────────────────────

export async function getPortfolioOpportunities(orgName?: string): Promise<OpportunityItem[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        and: [
          {
            or: [
              { property: "Scope", select: { equals: "Portfolio" } },
              { property: "Scope", select: { equals: "Both" } },
            ],
          },
          { property: "Stage", select: { does_not_equal: "Archived" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: OpportunityItem[] = (res.results as any[]).map(page => ({
      id:                   page.id,
      name:                 text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:                select(prop(page, "Stage")),
      scope:                select(prop(page, "Scope")),
      followUpStatus:       select(prop(page, "Follow-up Status")),
      type:                 select(prop(page, "Type")) || select(prop(page, "Opportunity Type")) || "",
      orgName:              text(prop(page, "Organization")) || "",
      lastEdited:           page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:            page.url ?? "",
      score:                num(prop(page, "Opportunity Score")),
      qualificationStatus:  select(prop(page, "Qualification Status")) || "Not Scored",
    }));

    // If orgName provided, prefer matches — show matched first, then all if none match
    if (orgName) {
      const lower = orgName.toLowerCase();
      const matched = all.filter(o =>
        o.orgName.toLowerCase().includes(lower) ||
        o.name.toLowerCase().includes(lower)
      );
      return matched.length > 0 ? matched : all;
    }
    return all;
  } catch {
    return [];
  }
}

