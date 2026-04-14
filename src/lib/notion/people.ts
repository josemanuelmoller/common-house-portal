import { notion, DB, prop, text, select, multiSelect, date, relationIds } from "./core";
import { getAllProjects } from "./projects";

// ─── People & Orgs ────────────────────────────────────────────────────────────

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

// ─── Residents — cross-project people aggregation ────────────────────────────

export type ResidentRecord = PersonRecord & {
  projectIds: string[];
  projectNames: string[];
  isLead: boolean;
};

// ─── Relationship warmth ──────────────────────────────────────────────────────

export type WarmthRecord = {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  warmth: string;          // Hot | Warm | Cold | Dormant
  lastContactDate: string | null;
  notionUrl: string;
};

// ─── Private resolvers ────────────────────────────────────────────────────────

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

// ─── Public queries ───────────────────────────────────────────────────────────

export async function getProjectPeople(projectId: string): Promise<ProjectPeople> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: projectId });

    const leadIds       = relationIds(prop(page, "Project Lead"));
    const teamIds       = relationIds(prop(page, "Team"));
    const primaryOrgIds = relationIds(prop(page, "Primary Organization"));
    const otherOrgIds   = relationIds(prop(page, "Other Organizations"));

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
