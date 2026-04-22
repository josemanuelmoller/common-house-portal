import { getSupabaseServerClient } from "@/lib/supabase-server";
import { LinkedInReviewBoard, type LinkedInCoverage } from "./LinkedInReviewBoard";

/**
 * Server component — loads the LinkedIn enrichment review queue + coverage
 * stats and renders the client-side review board. Embedded as a tab inside
 * /admin/hall/contacts so reviewers can approve/reject without leaving the
 * contacts page.
 */

type Row = {
  id:                   string;
  email:                string | null;
  full_name:            string | null;
  display_name:         string | null;
  linkedin:             string | null;
  linkedin_confidence:  number | null;
  linkedin_source:      string | null;
  linkedin_enriched_at: string | null;
  relationship_classes: string[] | null;
  meeting_count:        number | null;
  job_title:            string | null;
  role_category:        string | null;
  function_area:        string | null;
};

type NoMatchRow = {
  id:                       string;
  email:                    string | null;
  full_name:                string | null;
  display_name:             string | null;
  relationship_classes:     string[] | null;
  meeting_count:            number | null;
  linkedin_last_attempt_at: string | null;
};

export async function LinkedInReviewSection() {
  const sb = getSupabaseServerClient();

  // Review queue (rows that need human attention)
  const reviewRes = await sb
    .from("people")
    .select("id, email, full_name, display_name, linkedin, linkedin_confidence, linkedin_source, linkedin_enriched_at, relationship_classes, meeting_count, job_title, role_category, function_area")
    .eq("linkedin_needs_review", true)
    .order("linkedin_confidence", { ascending: false })
    .limit(200);

  // No-match queue — agent tried but found nothing. Fill manually via the
  // contact profile's Edit identity. Prioritised same way as the enrichment
  // queue (tagged VIP/Investor/Client/Partner first, then by meeting_count).
  const noMatchRes = await sb
    .from("people")
    .select("id, email, full_name, display_name, relationship_classes, meeting_count, linkedin_last_attempt_at")
    .not("email", "is", null)
    .is("dismissed_at", null)
    .is("linkedin", null)
    .not("linkedin_last_attempt_at", "is", null)
    .order("meeting_count", { ascending: false })
    .limit(200);

  // Coverage stats — addressable = has email + not dismissed.
  // We run a few count-only queries in parallel rather than loading all rows.
  const [totalRes, filledRes, manualRes, autoRes, reviewCountRes, attemptedRes] = await Promise.all([
    sb.from("people").select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .is("dismissed_at", null),
    sb.from("people").select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .is("dismissed_at", null)
      .not("linkedin", "is", null),
    sb.from("people").select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .is("dismissed_at", null)
      .not("linkedin", "is", null)
      .eq("linkedin_source", "manual"),
    sb.from("people").select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .is("dismissed_at", null)
      .not("linkedin", "is", null)
      .in("linkedin_source", ["anthropic_web_search", "google_cse_snippet", "clearbit", "apollo"]),
    sb.from("people").select("id", { count: "exact", head: true })
      .eq("linkedin_needs_review", true),
    sb.from("people").select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .is("dismissed_at", null)
      .not("linkedin_last_attempt_at", "is", null),
  ]);

  const coverage: LinkedInCoverage = {
    total:         totalRes.count         ?? 0,
    filled:        filledRes.count        ?? 0,
    manual:        manualRes.count        ?? 0,
    auto:          autoRes.count          ?? 0,
    needs_review:  reviewCountRes.count   ?? 0,
    attempted:     attemptedRes.count     ?? 0,
  };

  return (
    <LinkedInReviewBoard
      rows={(reviewRes.data ?? []) as Row[]}
      noMatch={(noMatchRes.data ?? []) as NoMatchRow[]}
      coverage={coverage}
    />
  );
}
