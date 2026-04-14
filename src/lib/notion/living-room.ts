import { notion, DB, prop, text, select, multiSelect, date } from "./core";

// ─── Living Room — community-safe queries ─────────────────────────────────────

export type LivingRoomPerson = {
  id: string;
  name: string;
  jobTitle: string;
  location?: string;
  roles: string[];
  visibility: string;
  linkedin?: string;
};

export type LivingRoomMilestone = {
  id: string;
  name: string;
  stage: string;
  milestoneType: string;
  communityTheme: string;
  geography: string[];
  lastUpdate: string | null;
};

export type LivingRoomTheme = {
  id: string;
  name: string;
  category: string;
  assetType: string;
};

export async function getLivingRoomPeople(): Promise<LivingRoomPerson[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.people,
      filter: {
        or: [
          { property: "Visibility", select: { equals: "public-safe" } },
          { property: "Visibility", select: { equals: "community" } },
        ],
      },
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[])
      .map((page: any) => {
        const country  = select(prop(page, "Country"));
        const city     = text(prop(page, "City"));
        const location = [city, country].filter(Boolean).join(", ");
        return {
          id:         page.id,
          name:       text(prop(page, "Full Name")),
          jobTitle:   text(prop(page, "Job Title / Role")),
          location:   location || undefined,
          roles:      multiSelect(prop(page, "Relationship Roles")),
          visibility: select(prop(page, "Visibility")),
          linkedin:   page.properties?.["LinkedIn"]?.url ?? undefined,
        };
      })
      .filter(p => p.name.trim() !== "");
  } catch {
    return [];
  }
}

export async function getLivingRoomMilestones(): Promise<LivingRoomMilestone[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.projects,
      filter: {
        and: [
          { property: "Project Status", select: { equals: "Active" } },
          { property: "Share to Living Room", checkbox: { equals: true } },
        ],
      },
      sorts: [{ property: "Last Status Update", direction: "descending" }],
      page_size: 30,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map((page: any) => ({
      id:             page.id,
      name:           text(prop(page, "Project Name")),
      stage:          select(prop(page, "Current Stage")),
      milestoneType:  select(prop(page, "Milestone Type")),
      communityTheme: text(prop(page, "Community Theme")),
      geography:      multiSelect(prop(page, "Geography")),
      lastUpdate:     date(prop(page, "Last Status Update")),
    }));
  } catch {
    return [];
  }
}

export async function getLivingRoomThemes(): Promise<LivingRoomTheme[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.knowledge,
      filter: { property: "Living Room Theme", checkbox: { equals: true } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 20,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map((page: any) => ({
      id:        page.id,
      name:      text(prop(page, "Asset Name")) || "Untitled",
      category:  multiSelect(prop(page, "Domain / Theme")).join(", "),
      assetType: select(prop(page, "Asset Type")),
    }));
  } catch {
    return [];
  }
}

// ─── Living Room admin writes ─────────────────────────────────────────────────

export async function updatePersonVisibility(
  personId: string,
  visibility: "public-safe" | "community" | "private"
): Promise<void> {
  await notion.pages.update({
    page_id: personId,
    properties: { Visibility: { select: { name: visibility } } },
  });
}

export async function updateProjectLivingRoom(
  projectId: string,
  share: boolean
): Promise<void> {
  await notion.pages.update({
    page_id: projectId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { "Share to Living Room": { checkbox: share } } as any,
  });
}

export async function updateInsightBriefCommunityFlag(
  briefId: string,
  communityRelevant: boolean
): Promise<void> {
  await notion.pages.update({
    page_id: briefId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { "Community Relevant": { checkbox: communityRelevant } } as any,
  });
}

export async function updateKnowledgeAssetTheme(
  assetId: string,
  active: boolean
): Promise<void> {
  await notion.pages.update({
    page_id: assetId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { "Living Room Theme": { checkbox: active } } as any,
  });
}
