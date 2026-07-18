import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const TYPES = new Set(["decision", "commitment", "risk", "dependency", "question", "milestone", "stakeholder_signal", "assumption", "outcome"]);

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
  const statement = typeof body.statement === "string" ? body.statement.trim() : "";
  if (!statement) return NextResponse.json({ error: "A statement is required" }, { status: 400 });
  const itemType = typeof body.itemType === "string" && TYPES.has(body.itemType) ? body.itemType : "assumption";
  const confidence = typeof body.confidence === "number" && Number.isInteger(body.confidence) && body.confidence >= 0 && body.confidence <= 100 ? body.confidence : 50;
  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown-admin";
  const { data, error } = await supabaseAdmin().from("project_state_items").insert({
    project_id: project.id,
    item_type: itemType,
    statement,
    owner_label: typeof body.ownerLabel === "string" ? body.ownerLabel.trim() || null : null,
    stakeholder_label: typeof body.stakeholderLabel === "string" ? body.stakeholderLabel.trim() || null : null,
    source_refs: refs(body.sourceRefs),
    confidence,
    stale_after: typeof body.staleAfter === "string" ? body.staleAfter || null : null,
    created_by: actor,
    updated_by: actor,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, item: data });
}
