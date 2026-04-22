/**
 * PATCH /api/plan/artifacts/[id]/questions/[qid]
 *
 * Updates a single question. Accepted fields:
 *   - answer (string)
 *   - status ("open" | "answered" | "dropped" | "superseded")
 *
 * When `answer` is provided and status isn't, status auto-flips to "answered".
 * When status flips to "answered", stamps answered_at.
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "answered", "dropped", "superseded"] as const;
type QStatus = (typeof STATUSES)[number];

type RouteCtx = { params: Promise<{ id: string; qid: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, qid } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.answer === "string") {
    patch.answer = body.answer;
    // If caller didn't set status, auto-answer
    if (body.status === undefined) {
      patch.status = "answered";
      patch.answered_at = new Date().toISOString();
    }
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as QStatus)) {
      return NextResponse.json(
        { error: `status must be one of ${STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    patch.status = body.status;
    if (body.status === "answered") {
      patch.answered_at = new Date().toISOString();
    } else if (body.status === "open") {
      patch.answered_at = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("artifact_questions")
    .update(patch)
    .eq("id", qid)
    .eq("artifact_id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "question not found" }, { status: 404 });

  return NextResponse.json({ question: data });
}
