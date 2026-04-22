import { getSupabaseServerClient } from "@/lib/supabase-server";
import { LinkedInReviewBoard } from "./LinkedInReviewBoard";

/**
 * Server component — loads the LinkedIn enrichment review queue and renders
 * the client-side review board. Embedded as a tab inside
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

export async function LinkedInReviewSection() {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("people")
    .select("id, email, full_name, display_name, linkedin, linkedin_confidence, linkedin_source, linkedin_enriched_at, relationship_classes, meeting_count, job_title, role_category, function_area")
    .eq("linkedin_needs_review", true)
    .order("linkedin_confidence", { ascending: false })
    .limit(200);

  return <LinkedInReviewBoard rows={(data ?? []) as Row[]} />;
}
