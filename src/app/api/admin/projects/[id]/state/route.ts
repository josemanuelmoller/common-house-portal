import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const HEALTH = new Set(["on_track", "watch", "blocked", "paused", "unknown"]);
const STATUSES = new Set(["draft", "current", "stale", "archived"]);

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() || null : undefined;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const update: Record<string, unknown> = { project_id: project.id, updated_at: new Date().toISOString() };
  const mapped: Array<[string, string]> = [
    ["currentSummary", "current_summary"], ["currentPhase", "current_phase"],
    ["currentFocus", "current_focus"], ["nextCheckInAt", "next_check_in_at"],
    ["lastSourceAt", "last_source_at"], ["staleAfter", "stale_after"],
  ];
  for (const [input, column] of mapped) {
    const value = optionalText(body[input]);
    if (value !== undefined) update[column] = value;
  }
  if (typeof body.health === "string") {
    if (!HEALTH.has(body.health)) return NextResponse.json({ error: "Invalid health" }, { status: 400 });
    update.health = body.health;
  }
  if (typeof body.stateStatus === "string") {
    if (!STATUSES.has(body.stateStatus)) return NextResponse.json({ error: "Invalid state status" }, { status: 400 });
    update.state_status = body.stateStatus;
  }
  if (typeof body.confidence === "number" && Number.isInteger(body.confidence) && body.confidence >= 0 && body.confidence <= 100) {
    update.confidence = body.confidence;
  }
  if (Object.keys(update).length === 2) return NextResponse.json({ error: "No supported fields" }, { status: 400 });

  const user = await currentUser();
  update.updated_by = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown-admin";
  update.last_state_change_at = new Date().toISOString();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("project_states")
    .upsert(update, { onConflict: "project_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await sb.from("project_state_revisions").insert({
    project_id: project.id,
    action: body.stateStatus === "stale" ? "marked_stale" : "edited",
    actor: update.updated_by,
    snapshot: data,
  });
  return NextResponse.json({ ok: true, state: data });
}
