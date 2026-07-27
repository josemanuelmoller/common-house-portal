import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { clientAccessGuardApi } from "@/lib/require-client-access";
import { supabaseAdmin } from "@/lib/supabase";
import { recordProposalOutcome } from "@/lib/proposal-outcomes";

const ACTIONS = new Set(["acknowledge", "approve", "request_changes", "reject"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await ctx.params;
  let body: { action?: string; comment?: string; expectedVersion?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.action || !ACTIONS.has(body.action) || !Number.isInteger(body.expectedVersion)) {
    return NextResponse.json({ error: "action and expectedVersion are required" }, { status: 400 });
  }
  // Pedir cambios sin decir cuáles no le sirve a nadie: ni al PM, que tiene que
  // adivinar el ajuste, ni al feedback loop, que se queda con un rechazo mudo.
  // Aprobar sigue sin fricción — aprobar no debe costar nada.
  const comment = body.comment?.trim() || null;
  if ((body.action === "request_changes" || body.action === "reject") && !comment) {
    return NextResponse.json({ error: "Contanos qué habría que ajustar." }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: agreement } = await sb.from("project_agreements")
    .select("project_id, agreement_type, title")
    .eq("id", agreementId)
    .maybeSingle();
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  const roles = agreement.agreement_type === "commercial" || agreement.agreement_type === "purchase_order"
    ? ["approver" as const]
    : ["collaborator" as const, "approver" as const];
  const guard = await clientAccessGuardApi(agreement.project_id as string, { roles });
  if (guard) return guard;

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const { data, error } = await sb.rpc("respond_to_project_agreement", {
    p_agreement_id: agreementId,
    p_expected_version: body.expectedVersion,
    p_action: body.action,
    p_actor_clerk_user_id: user.id,
    p_actor_email: email,
    p_comment: comment,
  });
  if (error) {
    const stale = error.message.toLowerCase().includes("stale");
    return NextResponse.json({ error: error.message }, { status: stale ? 409 : 400 });
  }

  // El puente que faltaba: hasta acá la respuesta del cliente moría en
  // project_agreements.response_comment y el feedback loop nunca la veía. Sin
  // esto, la plataforma no aprende nada de los tratos que se caen.
  // Fire-and-forget: la telemetría no puede tumbar la decisión del cliente.
  await recordProposalOutcome({
    proposal_type: "client_agreement",
    proposal_id: agreementId,
    action: body.action === "request_changes" || body.action === "reject" ? "revision_requested" : "approved",
    agent_name: "client-room",
    reason: comment,
    actor_email: email,
    proposal_title: (agreement.title as string | null) ?? null,
    metadata: {
      agreement_type: agreement.agreement_type,
      project_id: agreement.project_id,
      version: body.expectedVersion,
      raw_action: body.action,
    },
  });

  return NextResponse.json({ ok: true, agreement: data });
}
