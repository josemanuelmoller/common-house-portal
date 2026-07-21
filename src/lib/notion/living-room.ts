import { getSupabaseServerClient } from "@/lib/supabase-server";

// ─── Living Room — community-safe queries ─────────────────────────────────────
//
// notion-cutoff: reads and writes are now 100% Supabase. No @notionhq/client,
// no Notion prop helpers. Every record's `id` is the row's `notion_id`.
// Fields without a Supabase source (milestone type, community theme, theme
// category) return sensible empty defaults rather than reaching for Notion.

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
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("people")
      .select("id, notion_id, full_name, job_title, country, city, relationship_roles, visibility, linkedin")
      .in("visibility", ["public-safe", "community"])
      .is("dismissed_at", null)
      .limit(50);

    return ((data ?? []) as Array<Record<string, unknown>>)
      .map(r => {
        const location = [r.city as string | null, r.country as string | null].filter(Boolean).join(", ");
        return {
          id:         (r.notion_id as string) || (r.id as string) || "",
          name:       (r.full_name as string) || "",
          jobTitle:   (r.job_title as string) || "",
          location:   location || undefined,
          // relationship_roles is a single TEXT column — wrap as [value] when present.
          roles:      (r.relationship_roles as string) ? [r.relationship_roles as string] : [],
          visibility: (r.visibility as string) || "",
          linkedin:   (r.linkedin as string) || undefined,
        };
      })
      .filter(p => p.name.trim() !== "");
  } catch {
    return [];
  }
}

export async function getLivingRoomMilestones(): Promise<LivingRoomMilestone[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("projects")
      .select("id, notion_id, name, project_status, current_stage, geography, last_status_update, share_to_living_room")
      .eq("project_status", "Active")
      .eq("share_to_living_room", true)
      .order("last_status_update", { ascending: false, nullsFirst: false })
      .limit(30);

    return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id:             (r.notion_id as string) || (r.id as string) || "",
      name:           (r.name as string) || "",
      stage:          (r.current_stage as string) || "",
      // No Supabase source for these two on this branch → empty defaults.
      milestoneType:  "",
      communityTheme: "",
      // geography is a single TEXT column — wrap as [value] when present.
      geography:      (r.geography as string) ? [r.geography as string] : [],
      lastUpdate:     (r.last_status_update as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export async function getLivingRoomThemes(): Promise<LivingRoomTheme[]> {
  try {
    const sb = getSupabaseServerClient();
    // Living Room theme flag lives in knowledge_assets.payload.living_room_theme
    // (jsonb escape hatch — see updateKnowledgeAssetTheme below).
    const { data } = await sb
      .from("knowledge_assets")
      .select("id, notion_id, title, asset_type, updated_at")
      .eq("payload->>living_room_theme", "true")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(20);

    return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id:        (r.notion_id as string) || (r.id as string) || "",
      name:      (r.title as string) || "Untitled",
      // No dedicated Domain/Theme column on this branch → empty default.
      category:  "",
      assetType: (r.asset_type as string) || "",
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
