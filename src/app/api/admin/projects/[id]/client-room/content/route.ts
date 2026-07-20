import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

type PlanItem = { date?: string; label?: string; type?: string };
const PLAN_TYPES = new Set(["past", "today", "future"]);

/**
 * PATCH /api/admin/projects/[id]/client-room/content
 * Admin-only. Edits the room's narrative: welcome/focus/next-milestone, the four
 * "what we heard" fields (plain columns), and the proposal summary/status + plan
 * (inside hall_hero). Lets an admin hand-tune what the compose pipeline drafts.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : undefined);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const cols: Array<[string, string]> = [
    ["welcomeNote", "hall_welcome_note"],
    ["currentFocus", "hall_current_focus"],
    ["nextMilestone", "hall_next_milestone"],
    ["challenge", "hall_challenge"],
    ["mattersMost", "hall_matters_most"],
    ["obstacles", "hall_obstacles"],
    ["success", "hall_success"],
  ];
  for (const [key, col] of cols) {
    const v = str(body[key]);
    if (v !== undefined) update[col] = v;
  }

  const touchesHero = "proposalSummary" in body || "proposalStatus" in body || "plan" in body;
  if (touchesHero) {
    const { data: row } = await supabaseAdmin().from("projects").select("hall_hero").eq("id", project.id).maybeSingle();
    const hero = (row?.hall_hero as Record<string, unknown> | null) ?? {};
    const proposal = { status: "draft", summary: null, file_url: null, file_name: null, sent_at: null, ...(hero.proposal as object ?? {}) } as Record<string, unknown>;
    if ("proposalSummary" in body) proposal.summary = str(body.proposalSummary);
    if ("proposalStatus" in body) proposal.status = str(body.proposalStatus) ?? "draft";
    hero.proposal = proposal;
    if ("plan" in body && Array.isArray(body.plan)) {
      hero.timeline = (body.plan as PlanItem[])
        .map((p) => ({
          date: (p.date ?? "").toString().trim(),
          label: (p.label ?? "").toString().trim(),
          type: p.type && PLAN_TYPES.has(p.type) ? p.type : "future",
          source_id: null,
        }))
        .filter((p) => p.label);
    }
    if (!hero.timeline) hero.timeline = [];
    if (!hero.listening) hero.listening = { heard: [], needed: [] };
    update.hall_hero = hero;
  }

  const { error } = await supabaseAdmin().from("projects").update(update).eq("id", project.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
