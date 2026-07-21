/**
 * GET  /api/admin/projects/[id]/roles  — list participating organizations + roles
 * POST /api/admin/projects/[id]/roles   — add an organization role to the project
 *
 * ADR-001. A project can involve several organizations, each with a specific
 * role (client, delivery_lead, technology_provider, …). The project's primary
 * org is preserved separately and is NOT assumed to be the client.
 * [id] may be the project uuid or its notion_id.
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  listProjectOrgRoles,
  addProjectOrgRole,
  RelationalValidationError,
  PROJECT_ROLES,
  PARTICIPATION_STATUSES,
  type ProjectRole,
  type ParticipationStatus,
} from "@/lib/relational-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveProjectId(id: string): Promise<string | null> {
  if (UUID_RE.test(id)) return id;
  const sb = getSupabaseServerClient();
  const { data } = await sb.from("projects").select("id").eq("notion_id", id).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function actorEmail(): Promise<string> {
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "admin";
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const projectId = await resolveProjectId(id);
  if (!projectId) return NextResponse.json({ error: "project not found" }, { status: 404 });
  try {
    const roles = await listProjectOrgRoles(projectId, { includeEnded: true });
    return NextResponse.json({ ok: true, roles });
  } catch (e) {
    return apiError(e, { route: "[/api/admin/projects/[id]/roles]", status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const projectId = await resolveProjectId(id);
  if (!projectId) return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
  if (!organizationId) {
    return NextResponse.json({ error: "organization_id is required" }, { status: 400 });
  }
  const role = body.role;
  if (typeof role !== "string" || !(PROJECT_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: `role required, one of: ${PROJECT_ROLES.join(", ")}` },
      { status: 400 }
    );
  }
  const status = body.participation_status;
  if (
    status != null &&
    status !== "" &&
    !(PARTICIPATION_STATUSES as readonly string[]).includes(String(status))
  ) {
    return NextResponse.json(
      { error: `invalid participation_status (allowed: ${PARTICIPATION_STATUSES.join(", ")})` },
      { status: 400 }
    );
  }

  try {
    const created = await addProjectOrgRole({
      projectId,
      organizationId,
      role: role as ProjectRole,
      participationStatus: (status ? String(status) : undefined) as ParticipationStatus | undefined,
      clientVisible: body.client_visible === true,
      notes: body.notes == null || body.notes === "" ? null : String(body.notes),
      actor: await actorEmail(),
    });
    return NextResponse.json({ ok: true, role: created });
  } catch (e) {
    if (e instanceof RelationalValidationError) {
      return apiError(e, { route: "[/api/admin/projects/[id]/roles]", status: 400, publicMessage: e.message });
    }
    return apiError(e, { route: "[/api/admin/projects/[id]/roles]", status: 502 });
  }
}
