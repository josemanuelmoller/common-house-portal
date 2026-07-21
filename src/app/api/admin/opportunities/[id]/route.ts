/**
 * PATCH /api/admin/opportunities/[id]
 *   — move an opportunity through its canonical lifecycle and/or link it to a
 *     typed organization. [id] may be the opportunity uuid or its notion_id.
 *
 * Body (all optional): {
 *   canonical_stage: "exploration"|"proposal"|"won"|"lost"|"not_now"|null,
 *   organization_id: uuid|null,
 *   closed_reason: string|null,
 *   next_revisit_at: ISO string|null
 * }
 *
 * NOTE: winning an opportunity here only sets the stage. Atomic creation of the
 * project (convert_opportunity_to_project) is deferred to common-house-portal
 * (ADR-001 §4.3) — this route never creates a project.
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  setOpportunityCanonicalStage,
  linkOpportunityOrg,
  RelationalValidationError,
  OPPORTUNITY_CANONICAL_STAGES,
  type OpportunityCanonicalStage,
} from "@/lib/relational-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveOpportunityId(id: string): Promise<string | null> {
  if (UUID_RE.test(id)) return id;
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("opportunities")
    .select("id")
    .eq("notion_id", id)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  const oppId = await resolveOpportunityId(id);
  if (!oppId) return NextResponse.json({ error: "opportunity not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  // Validate canonical_stage if present.
  if ("canonical_stage" in body && body.canonical_stage != null) {
    if (!(OPPORTUNITY_CANONICAL_STAGES as readonly string[]).includes(String(body.canonical_stage))) {
      return NextResponse.json(
        { error: `invalid canonical_stage (allowed: ${OPPORTUNITY_CANONICAL_STAGES.join(", ")})` },
        { status: 400 }
      );
    }
  }

  try {
    if ("organization_id" in body) {
      const orgId = body.organization_id == null || body.organization_id === "" ? null : String(body.organization_id);
      await linkOpportunityOrg(oppId, orgId);
    }
    if ("canonical_stage" in body) {
      const stage =
        body.canonical_stage == null || body.canonical_stage === ""
          ? null
          : (String(body.canonical_stage) as OpportunityCanonicalStage);
      await setOpportunityCanonicalStage(oppId, stage, {
        closedReason:
          "closed_reason" in body
            ? body.closed_reason == null || body.closed_reason === ""
              ? null
              : String(body.closed_reason)
            : undefined,
        nextRevisitAt:
          "next_revisit_at" in body
            ? body.next_revisit_at == null || body.next_revisit_at === ""
              ? null
              : String(body.next_revisit_at)
            : undefined,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RelationalValidationError) {
      return apiError(e, { route: "[/api/admin/opportunities/[id]]", status: 400, publicMessage: e.message });
    }
    return apiError(e, { route: "[/api/admin/opportunities/[id]]", status: 502 });
  }
}
