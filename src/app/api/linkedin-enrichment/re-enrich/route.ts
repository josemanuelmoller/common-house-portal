/**
 * POST /api/linkedin-enrichment/re-enrich
 *
 * Force a fresh enrichment run for a single `people` row, bypassing the
 * 6-month cooldown. Used by the "Re-enrich" button on the contact profile.
 *
 * Body: { person_id?: string, email?: string }   (one of the two required)
 *
 * Writes the same fields as the batch runner:
 *   linkedin, linkedin_confidence, linkedin_source, linkedin_enriched_at,
 *   linkedin_last_attempt_at, linkedin_needs_review,
 *   job_title, role_category, function_area,
 *   job_title_confidence, job_title_source, job_title_updated_at
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { findLinkedIn } from "@/lib/linkedin-enrichment";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

const AUTO_APPLY_THRESHOLD = 0.8;
const REVIEW_THRESHOLD     = 0.4;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { person_id?: string; email?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  let query = sb.from("people").select("id, email, full_name, display_name, job_title_source, org_notion_id");
  if (body.person_id)    query = query.eq("id", body.person_id);
  else if (body.email)   query = query.eq("email", body.email.trim().toLowerCase());
  else return NextResponse.json({ error: "person_id or email required" }, { status: 400 });

  const { data: row, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!row)  return NextResponse.json({ error: "person not found" }, { status: 404 });

  type P = { id: string; email: string | null; full_name: string | null; display_name: string | null; job_title_source: string | null; org_notion_id: string | null };
  const p = row as unknown as P;
  const name = (p.full_name ?? p.display_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "contact has no name to search for" }, { status: 400 });

  // Optional: org name from hall_organizations for better search context
  let orgName: string | null = null;
  if (p.org_notion_id) {
    const { data: org } = await sb
      .from("hall_organizations")
      .select("org_name")
      .eq("org_notion_id", p.org_notion_id)
      .maybeSingle();
    orgName = (org as { org_name: string | null } | null)?.org_name ?? null;
  }

  const nowIso = new Date().toISOString();
  try {
    const hit = await findLinkedIn({ full_name: name, email: p.email, org_name: orgName });
    if (!hit) {
      await sb.from("people").update({
        linkedin_last_attempt_at: nowIso,
        updated_at: nowIso,
      }).eq("id", p.id);
      return NextResponse.json({ ok: true, match: null, message: "no plausible LinkedIn profile found" });
    }

    const willWrite  = hit.confidence >= REVIEW_THRESHOLD;
    const autoApply  = hit.confidence >= AUTO_APPLY_THRESHOLD;
    const manualTitle = p.job_title_source === "manual";

    const patch: Record<string, unknown> = {
      linkedin_last_attempt_at: nowIso,
      updated_at:               nowIso,
    };
    if (willWrite) {
      patch.linkedin              = hit.url;
      patch.linkedin_confidence   = hit.confidence;
      patch.linkedin_source       = hit.source;
      patch.linkedin_enriched_at  = nowIso;
      patch.linkedin_needs_review = !autoApply;
      if (hit.role_confidence >= 0.5 && !manualTitle) {
        if (hit.job_title)             patch.job_title            = hit.job_title;
        if (hit.role_category)         patch.role_category        = hit.role_category;
        if (hit.function_area)         patch.function_area        = hit.function_area;
        if (hit.organization_detected) patch.organization_detected = hit.organization_detected;
        patch.job_title_confidence = hit.role_confidence;
        patch.job_title_source     = "google_cse_snippet"; // historical label — still used as source marker
        patch.job_title_updated_at = nowIso;
      }
    }
    await sb.from("people").update(patch).eq("id", p.id);

    return NextResponse.json({
      ok:     true,
      match:  {
        url:            hit.url,
        confidence:     hit.confidence,
        job_title:      hit.job_title,
        role_category:  hit.role_category,
        function_area:  hit.function_area,
        organization_detected: hit.organization_detected,
        role_confidence: hit.role_confidence,
      },
      action: autoApply ? "auto_apply" : willWrite ? "queued_review" : "no_match",
    });
  } catch (e) {
    return NextResponse.json({
      ok:    false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }
}
