import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Notion database PAGE IDs — used by the @notionhq/client SDK (databases.query, pages.create, etc.)
// These differ from the collection/data-source IDs used by Notion MCP tools (collection://...).
// Both ID formats resolve to the same live databases in the "Common House Notion" workspace.
//   SDK page ID   ↔  MCP collection ID
//   49d59b18...   ↔  collection://5ef16ab9-e762-4548-b6c9-f386da4f6b29  (CH Projects [OS v2])
//   fa281249...   ↔  collection://ed78f965-d6e5-47ee-b60c-d7056d381454  (CH Evidence [OS v2])
//   d88aff1b...   ↔  collection://6f804e20-834c-4de2-a746-f6343fc75451  (CH Sources [OS v2])
//   0f4bfe95...   ↔  collection://e7d711a5-f441-4cc8-96c1-bd33151c09b8  (CH Knowledge Assets [OS v2])
export const DB = {
  projects:  "49d59b18095f46588960f2e717832c5f",
  evidence:  "fa28124978d043039d8932ac9964ccf5",
  sources:   "d88aff1b019d4110bcefab7f5bfbd0ae",
  knowledge: "0f4bfe95549d4710a3a9ab6e119a9b04",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type Project = {
  id: string;
  name: string;
  status: string;
  stage: string;
  statusSummary: string;
  draftUpdate: string;
  lastUpdate: string | null;
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
};

export type EvidenceItem = {
  id: string;
  title: string;
  type: string;
  validationStatus: string;
  confidence: string;
  reusability: string;
  dateCaptured: string | null;
  excerpt: string;
  projectId: string | null;
  projectName?: string;
};

export type SourceItem = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  dateIngested: string | null;
  projectId: string | null;
};

export type DocumentItem = {
  id: string;
  title: string;
  url: string;
  platform: string;
  sourceDate: string | null;
};

export type KnowledgeAsset = {
  id: string;
  name: string;
  category: string;
  assetType: string;
  status: string;
  lastUpdated: string | null;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prop(page: any, key: string): any {
  return page.properties?.[key];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function text(p: any): string {
  return p?.rich_text?.[0]?.plain_text ?? p?.title?.[0]?.plain_text ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function select(p: any): string {
  return p?.select?.name ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function multiSelect(p: any): string[] {
  return p?.multi_select?.map((s: any) => s.name) ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkbox(p: any): boolean {
  return p?.checkbox ?? false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function date(p: any): string | null {
  return p?.date?.start ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function relationFirst(p: any): string | null {
  return p?.relation?.[0]?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function relationIds(p: any): string[] {
  return p?.relation?.map((r: any) => r.id) ?? [];
}

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
  const [projects, evidenceRes, allSrcs] = await Promise.all([
    getAllProjects(),
    notion.databases.query({ database_id: DB.evidence, page_size: 100 }),
    getAllSources(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence = evidenceRes.results as any[];

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
    };
  });
}

// ─── Evidence queries ─────────────────────────────────────────────────────────

export async function getEvidenceForProject(projectPageId: string): Promise<EvidenceItem[]> {
  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter: { property: "Project", relation: { contains: projectPageId } },
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    title: text(prop(page, "Evidence Title")),
    type: select(prop(page, "Evidence Type")),
    validationStatus: select(prop(page, "Validation Status")),
    confidence: select(prop(page, "Confidence Level")),
    reusability: select(prop(page, "Reusability Level")),
    dateCaptured: date(prop(page, "Date Captured")),
    excerpt: text(prop(page, "Source Excerpt")),
    projectId: relationFirst(prop(page, "Project")),
  }));
}

// All evidence — for OS queue, with optional validation status filter
export async function getAllEvidence(validationStatus?: string): Promise<EvidenceItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = validationStatus
    ? { property: "Validation Status", select: { equals: validationStatus } }
    : undefined;

  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter,
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    title: text(prop(page, "Evidence Title")),
    type: select(prop(page, "Evidence Type")),
    validationStatus: select(prop(page, "Validation Status")),
    confidence: select(prop(page, "Confidence Level")),
    reusability: select(prop(page, "Reusability Level")),
    dateCaptured: date(prop(page, "Date Captured")),
    excerpt: text(prop(page, "Source Excerpt")),
    projectId: relationFirst(prop(page, "Project")),
  }));
}

// Reusable + Canonical validated evidence — for Knowledge System.
// Includes both "Reusable" and "Canonical" tiers (Canonical = highest reusability level;
// produced by the OS engine's triage-knowledge skill). Filtering only "Reusable" would
// silently omit the most important cross-cutting knowledge items.
export async function getReusableEvidence(): Promise<EvidenceItem[]> {
  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter: {
      and: [
        {
          or: [
            { property: "Reusability Level", select: { equals: "Reusable" } },
            { property: "Reusability Level", select: { equals: "Canonical" } },
          ],
        },
        { property: "Validation Status", select: { equals: "Validated" } },
      ],
    },
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    title: text(prop(page, "Evidence Title")),
    type: select(prop(page, "Evidence Type")),
    validationStatus: select(prop(page, "Validation Status")),
    confidence: select(prop(page, "Confidence Level")),
    reusability: select(prop(page, "Reusability Level")),
    dateCaptured: date(prop(page, "Date Captured")),
    excerpt: text(prop(page, "Source Excerpt")),
    projectId: relationFirst(prop(page, "Project")),
  }));
}

// ─── Sources queries ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSource(page: any): SourceItem {
  return {
    id: page.id,
    title: text(prop(page, "Source Title")) || "Untitled",
    sourceType: select(prop(page, "Source Type")),
    status: select(prop(page, "Processing Status")),
    dateIngested: (page.created_time as string) ?? null,
    projectId: relationFirst(prop(page, "Linked Projects")),
  };
}

export async function getSourcesForProject(projectPageId: string): Promise<SourceItem[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: { property: "Linked Projects", relation: { contains: projectPageId } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.results.map((page: any) => parseSource(page));
  } catch {
    return [];
  }
}

export async function getAllSources(): Promise<SourceItem[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.results.map((page: any) => ({
      ...parseSource(page),
      projectId: relationFirst(prop(page, "Linked Projects")),
    }));
  } catch {
    return [];
  }
}

export async function getDocumentsForProject(projectPageId: string): Promise<DocumentItem[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: {
        and: [
          { property: "Linked Projects", relation: { contains: projectPageId } },
          {
            or: [
              { property: "Source Type",     select: { equals: "Document" }     },
              { property: "Source Platform", select: { equals: "Google Drive" } },
            ],
          },
        ],
      },
      sorts: [{ property: "Source Date", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[])
      .map(page => ({
        id:         page.id,
        title:      text(prop(page, "Source Title")) || "Untitled document",
        url:        (page.properties?.["Source URL"]?.url as string) ?? "",
        platform:   select(prop(page, "Source Platform")),
        sourceDate: date(prop(page, "Source Date")),
      }))
      .filter(d => d.url); // only show docs with an actual URL
  } catch {
    return [];
  }
}

// ─── People & Orgs ───────────────────────────────────────────────────────────

export type PersonRecord = {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  classification: "Internal" | "External" | "";
  roles: string[];
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

// ─── Knowledge queries ────────────────────────────────────────────────────────

export async function getKnowledgeAssets(): Promise<KnowledgeAsset[]> {
  const res = await notion.databases.query({
    database_id: DB.knowledge,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    name: text(prop(page, "Asset Name")) || "Untitled",
    // "Domain / Theme" is the canonical field (multi_select). "Category"/"Asset Category" don't exist in the schema.
    category: multiSelect(prop(page, "Domain / Theme")).join(", "),
    assetType: select(prop(page, "Asset Type")) || "",
    status: select(prop(page, "Status")) || "",
    lastUpdated: page.last_edited_time ?? null,
  }));
}

// ─── Source Activity ──────────────────────────────────────────────────────────

export type MeetingItem = {
  id: string;
  title: string;
  date: string | null;
  url: string;
  platform: string;
  // "Processed Summary" field from CH Sources [OS v2] — populated by the OS engine after meeting intake
  processedSummary?: string;
};

export type SourceActivity = {
  meetings: MeetingItem[];
  emailCount: number;
  documentCount: number;
  otherCount: number;
  totalCount: number;
};

export async function getSourceActivity(projectId: string): Promise<SourceActivity> {
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: { property: "Linked Projects", relation: { contains: projectId } },
      sorts: [{ property: "Source Date", direction: "descending" }],
      page_size: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = res.results as any[];

    const meetings: MeetingItem[] = [];
    let emailCount = 0;
    let documentCount = 0;
    let otherCount = 0;

    for (const page of pages) {
      const sourceType = select(prop(page, "Source Type"));
      const platform   = select(prop(page, "Source Platform"));

      const isMeeting  = sourceType.includes("Meeting") || platform === "Fireflies";
      const isEmail    = sourceType.includes("Email")   || platform === "Gmail";
      const isDocument = sourceType === "Document"      || platform === "Google Drive";

      if (isMeeting) {
        meetings.push({
          id:               page.id,
          title:            text(prop(page, "Source Title")) || "Untitled",
          date:             date(prop(page, "Source Date")),
          url:              page.properties?.["Source URL"]?.url ?? "",
          platform,
          // "Processed Summary" is written by the OS engine after meeting intake.
          // It may be empty for older sources that were ingested before the field was populated.
          processedSummary: text(prop(page, "Processed Summary")) || undefined,
        });
      } else if (isEmail) {
        emailCount++;
      } else if (isDocument) {
        documentCount++;
      } else {
        otherCount++;
      }
    }

    return {
      meetings,
      emailCount,
      documentCount,
      otherCount,
      totalCount: pages.length,
    };
  } catch {
    return { meetings: [], emailCount: 0, documentCount: 0, otherCount: 0, totalCount: 0 };
  }
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
