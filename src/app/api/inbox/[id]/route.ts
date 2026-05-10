/**
 * PATCH /api/inbox/[id]
 * Updates a single inbox row. Allowed fields: status, user_type_override,
 * user_due_date, user_notes_to_agent, raw_text.
 */

import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import {
  updateInboxItem,
  isValidStatus,
  isValidUserType,
  type UpdateInboxInput,
} from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const patch: UpdateInboxInput = {};

  if ("status" in body) {
    if (body.status === null || isValidStatus(body.status)) {
      if (body.status !== null) patch.status = body.status;
    } else {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
  }
  if ("user_type_override" in body) {
    if (body.user_type_override === null || isValidUserType(body.user_type_override)) {
      patch.user_type_override = (body.user_type_override as UpdateInboxInput["user_type_override"]) ?? null;
    } else {
      return NextResponse.json({ error: "Invalid user_type_override" }, { status: 400 });
    }
  }
  if ("user_due_date" in body) {
    patch.user_due_date = typeof body.user_due_date === "string" ? body.user_due_date : null;
  }
  if ("user_notes_to_agent" in body) {
    patch.user_notes_to_agent =
      typeof body.user_notes_to_agent === "string" ? body.user_notes_to_agent : null;
  }
  if ("raw_text" in body) {
    patch.raw_text = typeof body.raw_text === "string" ? body.raw_text : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { row, error } = await updateInboxItem(id, patch);
  if (error || !row) {
    return NextResponse.json({ error: error || "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: row });
}
