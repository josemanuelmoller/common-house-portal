/**
 * /api/plan/artifacts/[id]
 *
 * PATCH — partial update. Today only `status` is accepted. On transition to
 * `sent`, stamps `sent_at`. On transition out of `sent`, clears `sent_at`.
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "in_review", "approved", "sent", "archived"] as const;
type ArtifactStatus = (typeof STATUSES)[number];

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as ArtifactStatus)) {
      return NextResponse.json(
        { error: `status must be one of ${STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    patch.status = body.status;
    if (body.status === "sent") {
      patch.sent_at = new Date().toISOString();
    } else {
      patch.sent_at = null;
    }
  }

  if (body.notes !== undefined && typeof body.notes === "string") {
    patch.notes = body.notes;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("objective_artifacts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artifact: data });
}
