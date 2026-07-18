import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const TYPES = new Set(["implementation_question", "stakeholder_need", "friction", "decision_pattern", "operating_pattern", "outcome"]);
const TRANSFERABILITY = new Set(["project", "candidate", "confirmed"]);

function refs(value: unknown) {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))].slice(0, 25);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const observation = typeof body.observation === "string" ? body.observation.trim() : "";
  if (!title || !observation) return NextResponse.json({ error: "Title and observation are required" }, { status: 400 });
  const learningType = typeof body.learningType === "string" && TYPES.has(body.learningType) ? body.learningType : "implementation_question";
  const transferability = typeof body.transferability === "string" && TRANSFERABILITY.has(body.transferability) ? body.transferability : "project";
  const confidence = typeof body.confidence === "number" && Number.isInteger(body.confidence) && body.confidence >= 0 && body.confidence <= 100 ? body.confidence : 50;
  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown-admin";
  const { data, error } = await supabaseAdmin().from("project_learning_items").insert({
    project_id: project.id,
    organization_id: project.organization_id,
    learning_type: learningType,
    area: typeof body.area === "string" ? body.area.trim() || null : null,
    title,
    observation,
    implication: typeof body.implication === "string" ? body.implication.trim() || null : null,
    transferability,
    confidence,
    source_refs: refs(body.sourceRefs),
    // Every learning gets a review-by date so observations don't linger unreviewed.
    stale_after: (typeof body.staleAfter === "string" && body.staleAfter)
      ? body.staleAfter
      : new Date(Date.now() + 45 * 86_400_000).toISOString(),
    created_by: actor,
    updated_by: actor,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, learning: data });
}
