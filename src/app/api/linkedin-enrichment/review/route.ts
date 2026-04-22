/**
 * POST /api/linkedin-enrichment/review
 *
 * Approve or reject a LinkedIn enrichment candidate that the agent flagged
 * for human review (confidence between 0.4 and 0.8).
 *
 * Body:
 *   { person_id: uuid, action: "approve" | "reject" | "override", url?: string }
 *
 *   - approve  → keep the linkedin URL, clear needs_review, bump confidence
 *                to 1 and source to "manual"
 *   - reject   → clear linkedin + needs_review. Push linkedin_last_attempt_at
 *                to now so the agent won't retry for another cooldown window.
 *   - override → the reviewer pasted a different URL manually. Save it,
 *                clear needs_review, confidence 1, source "manual".
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { cleanLinkedInUrl, ROLE_CATEGORIES, FUNCTION_AREAS } from "@/lib/linkedin-enrichment";

type Body = {
  person_id?:     string;
  action?:        "approve" | "reject" | "override";
  url?:           string;
  job_title?:     string | null;
  role_category?: string | null;
  function_area?: string | null;
};

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user  = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const personId = (body.person_id ?? "").trim();
  const action   = body.action;
  if (!personId) return NextResponse.json({ error: "person_id required" }, { status: 400 });
  if (action !== "approve" && action !== "reject" && action !== "override") {
    return NextResponse.json({ error: "action must be approve | reject | override" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    linkedin_needs_review:    false,
    linkedin_last_attempt_at: nowIso,
    updated_at:               nowIso,
  };
  let auditReason = "";

  if (action === "approve") {
    patch.linkedin_confidence  = 1;
    patch.linkedin_source      = "manual";
    patch.linkedin_enriched_at = nowIso;
    // If the reviewer edited role/area inline before approving, persist those
    // edits and mark source as manual so the agent never overwrites them.
    if (body.job_title !== undefined) {
      patch.job_title            = body.job_title;
      patch.job_title_source     = "manual";
      patch.job_title_confidence = 1;
      patch.job_title_updated_at = nowIso;
    }
    if (body.role_category !== undefined) {
      const v = body.role_category;
      if (v == null || v === "" || (ROLE_CATEGORIES as string[]).includes(v)) {
        patch.role_category = v || null;
      } else {
        return NextResponse.json({ error: `invalid role_category. Allowed: ${ROLE_CATEGORIES.join(" | ")}` }, { status: 400 });
      }
    }
    if (body.function_area !== undefined) {
      const v = body.function_area;
      if (v == null || v === "" || (FUNCTION_AREAS as string[]).includes(v)) {
        patch.function_area = v || null;
      } else {
        return NextResponse.json({ error: `invalid function_area. Allowed: ${FUNCTION_AREAS.join(" | ")}` }, { status: 400 });
      }
    }
    auditReason = "human approved";
  } else if (action === "reject") {
    patch.linkedin             = null;
    patch.linkedin_confidence  = null;
    patch.linkedin_source      = null;
    patch.linkedin_enriched_at = null;
    // Rejecting the LinkedIn match also clears any auto-extracted role
    // unless the reviewer had manually set it earlier.
    patch.role_category        = null;
    patch.function_area        = null;
    auditReason = "human rejected";
  } else {
    // override — reviewer pasted a different URL (and optionally edited role)
    const cleaned = cleanLinkedInUrl((body.url ?? "").trim());
    if (!cleaned) return NextResponse.json({ error: "url must be a linkedin.com/in/… profile" }, { status: 400 });
    patch.linkedin             = cleaned;
    patch.linkedin_confidence  = 1;
    patch.linkedin_source      = "manual";
    patch.linkedin_enriched_at = nowIso;
    if (body.job_title !== undefined) {
      patch.job_title            = body.job_title;
      patch.job_title_source     = "manual";
      patch.job_title_confidence = 1;
      patch.job_title_updated_at = nowIso;
    }
    if (body.role_category !== undefined) {
      const v = body.role_category;
      if (v == null || v === "" || (ROLE_CATEGORIES as string[]).includes(v)) {
        patch.role_category = v || null;
      }
    }
    if (body.function_area !== undefined) {
      const v = body.function_area;
      if (v == null || v === "" || (FUNCTION_AREAS as string[]).includes(v)) {
        patch.function_area = v || null;
      }
    }
    auditReason = `human override (${cleaned})`;
  }

  const { data, error } = await sb
    .from("people")
    .update(patch)
    .eq("id", personId)
    .select("id, email, full_name, linkedin, linkedin_confidence, linkedin_source, linkedin_needs_review, job_title, role_category, function_area")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  try {
    await sb.from("linkedin_enrichment_audit").insert({
      person_id:     personId,
      source:        "manual",
      attempted_at:  nowIso,
      query:         null,
      candidate_url: action === "reject" ? null : (patch.linkedin as string | null),
      confidence:    action === "reject" ? 0 : 1,
      accepted:      action !== "reject",
      reasoning:     auditReason,
      actor,
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, action, contact: data });
}
