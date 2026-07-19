/**
 * GET  /api/admin/organizations/[id]/relationships   — list durable relationships
 * POST /api/admin/organizations/[id]/relationships    — create/update one (idempotent per type)
 *
 * ADR-001. Canonical durable relationships between an org and Common House.
 * [id] may be the org uuid or its notion_id.
 *
 * Auth: adminGuardApi() (mandatory per AGENTS.md API auth rules).
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  listOrgRelationships,
  upsertOrgRelationship,
  RelationalValidationError,
  RELATIONSHIP_TYPES,
  type RelationshipType,
} from "@/lib/relational-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a route [id] (uuid or notion_id) to the organizations.id uuid. */
async function resolveOrgId(id: string): Promise<string | null> {
  if (UUID_RE.test(id)) return id;
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("organizations")
    .select("id")
    .eq("notion_id", id)
    .maybeSingle();
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
  const orgId = await resolveOrgId(id);
  if (!orgId) return NextResponse.json({ error: "organization not found" }, { status: 404 });

  try {
    const relationships = await listOrgRelationships(orgId, { includeEnded: true });
    return NextResponse.json({ ok: true, relationships });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  const orgId = await resolveOrgId(id);
  if (!orgId) return NextResponse.json({ error: "organization not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const type = body.relationship_type;
  if (typeof type !== "string" || !(RELATIONSHIP_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { error: `relationship_type required, one of: ${RELATIONSHIP_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const stateRaw = body.relationship_state;
  const state = stateRaw == null || stateRaw === "" ? null : String(stateRaw);
  const notes = body.notes == null || body.notes === "" ? null : String(body.notes);

  try {
    const relationship = await upsertOrgRelationship({
      organizationId: orgId,
      relationshipType: type as RelationshipType,
      relationshipState: state,
      notes,
      actor: await actorEmail(),
    });
    return NextResponse.json({ ok: true, relationship });
  } catch (e) {
    if (e instanceof RelationalValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
