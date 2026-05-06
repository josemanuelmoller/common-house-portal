/**
 * workroom-bridge.ts
 *
 * When an org in `hall_organizations` is tagged as `Client` or `Prospect`,
 * make sure there's a paid-engagement project (`engagement_model='delivery'`)
 * pointing at the same domain. The project is what surfaces on
 * `/admin/workrooms`; the org tag is the trigger.
 *
 * Idempotent. Promotes Prospect → Client when the user upgrades the tag.
 * Does NOT delete projects when a tag is removed (per product decision).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type WorkroomIntent = "Client" | "Prospect";

export interface WorkroomBridgeResult {
  /** True if a brand-new project was inserted. */
  created: boolean;
  /** True if an existing Prospect project was promoted to Client. */
  promoted: boolean;
  /** notion_id of the project, whether existing or newly created. null on failure. */
  project_notion_id: string | null;
}

const INTENT_DEFAULTS: Record<WorkroomIntent, { project_status: string; current_stage: string }> = {
  Client:   { project_status: "Active",   current_stage: "Pilot Planning" },
  Prospect: { project_status: "Proposed", current_stage: "Discovery" },
};

/**
 * Ensure a workroom (project with engagement_model='delivery') exists for this org.
 *
 * Lookup key: `name = hallOrg.name AND engagement_model = 'delivery'`. If we ever
 * add a stronger bridge column on projects, swap the lookup — the rest stays.
 */
export async function ensureWorkroomForOrg(
  sb: SupabaseClient,
  hallOrg: { domain: string; name: string; notion_id: string | null },
  intent: WorkroomIntent,
): Promise<WorkroomBridgeResult> {
  const target = INTENT_DEFAULTS[intent];

  const { data: existing } = await sb
    .from("projects")
    .select("notion_id, project_status, current_stage")
    .eq("name", hallOrg.name)
    .eq("engagement_model", "delivery")
    .limit(1)
    .maybeSingle();

  // Promote Prospect → Client if the user upgrades. Don't downgrade Client → Prospect
  // automatically — that's a separate decision the human should make explicitly.
  if (existing) {
    if (intent === "Client" && existing.project_status === "Proposed") {
      const { error } = await sb
        .from("projects")
        .update({
          project_status: "Active",
          current_stage:  "Pilot Planning",
          updated_at:     new Date().toISOString(),
        })
        .eq("notion_id", existing.notion_id);
      if (error) throw new Error(`workroom-bridge promote failed: ${error.message}`);
      return { created: false, promoted: true, project_notion_id: existing.notion_id as string };
    }
    return { created: false, promoted: false, project_notion_id: existing.notion_id as string };
  }

  // Synthetic notion_id for Supabase-only projects. The Notion sync skips these
  // (the prefix tells the push job: "I was born here, don't try to read me from Notion").
  const newNotionId = `local-${randomUUID()}`;
  const nowIso = new Date().toISOString();

  const { data: created, error: insErr } = await sb
    .from("projects")
    .insert({
      notion_id:             newNotionId,
      name:                  hallOrg.name,
      engagement_model:      "delivery",
      project_status:        target.project_status,
      current_stage:         target.current_stage,
      primary_org_notion_id: hallOrg.notion_id ?? null,
      created_at:            nowIso,
      updated_at:            nowIso,
    })
    .select("notion_id")
    .maybeSingle();

  if (insErr) throw new Error(`workroom-bridge create failed: ${insErr.message}`);
  return { created: true, promoted: false, project_notion_id: (created?.notion_id as string) ?? null };
}
