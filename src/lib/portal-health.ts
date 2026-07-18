import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

/**
 * Portal 2.0 release + onboarding readiness (Phase 8).
 *
 * getPortalHealth() is a data-integrity probe for production verification: it
 * confirms the Portal 2.0 tables exist and reports real row counts (a 200 with
 * empty/erroring data is a failure, not health) plus which required env vars are
 * present — names only, never values.
 *
 * getOnboardingReadiness() is the per-project checklist gating a real client
 * invitation: room enabled, slug, org link, a shared "what we heard" agreement,
 * client-visible material, an access grant, and a confirmed state.
 */

export type PortalHealth = {
  ok: boolean;
  checkedAt: string;
  tables: Record<string, number | null>;
  env: Record<string, boolean>;
  errors: string[];
};

const HEALTH_TABLES = [
  "project_states",
  "project_state_items",
  "project_state_proposals",
  "project_learning_items",
  "project_entity_links",
  "project_evidence_cursors",
  "knowledge_assets",
  "project_materials",
  "project_agreements",
  "client_access",
] as const;

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
] as const;

export async function getPortalHealth(): Promise<PortalHealth> {
  const sb = supabaseAdmin();
  const tables: Record<string, number | null> = {};
  const errors: string[] = [];
  await Promise.all(
    HEALTH_TABLES.map(async (t) => {
      const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
      if (error) { tables[t] = null; errors.push(`${t}: ${error.message}`); }
      else tables[t] = count ?? 0;
    }),
  );
  const env: Record<string, boolean> = {};
  for (const k of REQUIRED_ENV) env[k] = Boolean(process.env[k]);
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length) errors.push(`missing env: ${missingEnv.join(", ")}`);
  return { ok: errors.length === 0, checkedAt: new Date().toISOString(), tables, env, errors };
}

export type ReadinessCheck = { key: string; label: string; ok: boolean; detail: string };
export type OnboardingReadiness = {
  projectId: string;
  projectName: string;
  ready: boolean;
  checks: ReadinessCheck[];
};

export async function getOnboardingReadiness(identifier: string): Promise<OnboardingReadiness | null> {
  const project = await resolveClientRoomProject(identifier);
  if (!project) return null;
  const sb = supabaseAdmin();
  const [materials, agreements, grants, state] = await Promise.all([
    sb.from("project_materials").select("id", { count: "exact", head: true })
      .eq("project_id", project.id).eq("visibility", "client").neq("document_status", "archived"),
    sb.from("project_agreements").select("id", { count: "exact", head: true })
      .eq("project_id", project.id).eq("visibility", "client").in("status", ["shared", "acknowledged", "approved", "changes_requested"]),
    sb.from("client_access").select("id", { count: "exact", head: true })
      .eq("project_id", project.id).is("revoked_at", null),
    sb.from("project_states").select("state_status").eq("project_id", project.id).maybeSingle(),
  ]);

  const materialCount = materials.count ?? 0;
  const agreementCount = agreements.count ?? 0;
  const grantCount = grants.count ?? 0;
  const stateStatus = (state.data?.state_status as string | undefined) ?? null;

  const checks: ReadinessCheck[] = [
    { key: "room_enabled", label: "Client room enabled", ok: Boolean(project.client_room_enabled), detail: project.client_room_enabled ? "on" : "off" },
    { key: "slug", label: "Public slug set", ok: Boolean(project.hall_slug), detail: project.hall_slug ?? "missing" },
    { key: "org", label: "Organization linked", ok: Boolean(project.organization_id), detail: project.organization_id ? "linked" : "no organization_id" },
    { key: "state", label: "Current state confirmed", ok: stateStatus === "current", detail: stateStatus ? `state is ${stateStatus}` : "no state row" },
    { key: "understanding", label: "A shared agreement (what we heard)", ok: agreementCount > 0, detail: `${agreementCount} client-visible` },
    { key: "material", label: "At least one client-visible material", ok: materialCount > 0, detail: `${materialCount} shared` },
    { key: "access", label: "At least one active access grant", ok: grantCount > 0, detail: `${grantCount} active` },
  ];
  return {
    projectId: project.id,
    projectName: project.name ?? "Untitled project",
    ready: checks.every((c) => c.ok),
    checks,
  };
}
