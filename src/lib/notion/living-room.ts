import { notion, DB, prop, text, select, multiSelect, date } from "./core";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// ─── Living Room — community-safe queries ─────────────────────────────────────
//
// Reads still flow through Notion until the Living Room read paths are migrated.
// All four write helpers below now hit canonical Supabase tables per the
// 2026-06-02 cutoff (docs/SUPABASE_CONSOLIDATION_FREEZE.md §3).

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
//
// Each helper below historically wrote to a Notion page; per the 2026-06-02
// cutoff each now writes to its canonical Supabase row. The `*Id` argument was
// historically a Notion page id; the canonical row is matched by either uuid
// `id` or the `notion_id` backref column.

function pickMatchColumn(id: string): "id" | "notion_id" {
  return /^[0-9a-f-]{36}$/i.test(id) ? "id" : "notion_id";
}

export async function updatePersonVisibility(
  personId: string,
  visibility: "public-safe" | "community" | "private",
): Promise<void> {
  // notion-cutoff-2026-06-02: replaced by canonical write to people (Supabase).
  // Notion → Supabase column mapping:
  //   "Visibility" select → visibility
  // await notion.pages.update({
  //   page_id: personId,
  //   properties: { Visibility: { select: { name: visibility } } },
  // });
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("people")
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq(pickMatchColumn(personId), personId);
  if (error) throw new Error(`people update failed: ${error.message}`);
}

export async function updateProjectLivingRoom(
  projectId: string,
  share: boolean,
): Promise<void> {
  // notion-cutoff-2026-06-02: replaced by canonical write to projects (Supabase).
  // Notion → Supabase column mapping:
  //   "Share to Living Room" checkbox → share_to_living_room
  // await notion.pages.update({
  //   page_id: projectId,
  //   properties: { "Share to Living Room": { checkbox: share } } as any,
  // });
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("projects")
    .update({ share_to_living_room: share, updated_at: new Date().toISOString() })
    .eq(pickMatchColumn(projectId), projectId);
  if (error) throw new Error(`projects update failed: ${error.message}`);
}

export async function updateInsightBriefCommunityFlag(
  briefId: string,
  communityRelevant: boolean,
): Promise<void> {
  // notion-cutoff-2026-06-02: replaced by canonical write to insight_briefs (Supabase).
  // Notion → Supabase column mapping:
  //   "Community Relevant" checkbox → payload.community_relevant
  //                                   (no dedicated column yet; jsonb escape hatch)
  // await notion.pages.update({
  //   page_id: briefId,
  //   properties: { "Community Relevant": { checkbox: communityRelevant } } as any,
  // });
  const sb = getSupabaseServerClient();
  const matchColumn = pickMatchColumn(briefId);

  const { data: existing } = await sb
    .from("insight_briefs")
    .select("payload")
    .eq(matchColumn, briefId)
    .maybeSingle();
  const existingPayload =
    (existing?.payload as Record<string, unknown> | null | undefined) ?? {};

  const { error } = await sb
    .from("insight_briefs")
    .update({
      payload:    { ...existingPayload, community_relevant: communityRelevant },
      updated_at: new Date().toISOString(),
    })
    .eq(matchColumn, briefId);
  if (error) throw new Error(`insight_briefs update failed: ${error.message}`);
}

export async function updateKnowledgeAssetTheme(
  assetId: string,
  active: boolean,
): Promise<void> {
  // notion-cutoff-2026-06-02: replaced by canonical write to knowledge_assets (Supabase).
  // Notion → Supabase column mapping:
  //   "Living Room Theme" checkbox → payload.living_room_theme
  //                                  (no dedicated column yet; jsonb escape hatch)
  // await notion.pages.update({
  //   page_id: assetId,
  //   properties: { "Living Room Theme": { checkbox: active } } as any,
  // });
  const sb = getSupabaseServerClient();
  const matchColumn = pickMatchColumn(assetId);

  const { data: existing } = await sb
    .from("knowledge_assets")
    .select("payload")
    .eq(matchColumn, assetId)
    .maybeSingle();
  const existingPayload =
    (existing?.payload as Record<string, unknown> | null | undefined) ?? {};

  const { error } = await sb
    .from("knowledge_assets")
    .update({
      payload:    { ...existingPayload, living_room_theme: active },
      updated_at: new Date().toISOString(),
    })
    .eq(matchColumn, assetId);
  if (error) throw new Error(`knowledge_assets update failed: ${error.message}`);
}
