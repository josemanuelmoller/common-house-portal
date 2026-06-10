import { redirect } from "next/navigation";

/**
 * /admin/pipeline → /admin/opportunities (2026-06-10 consolidation).
 *
 * This page read Notion Opportunities DIRECTLY — unfiltered (no is_legacy /
 * is_archived exclusion), capped at 100 records, with "days in stage" derived
 * from last_edited_time. /admin/opportunities is the authoritative surface:
 * Supabase-first, filtered, scored. One opportunity, one surface.
 */
export default function PipelineRedirect() {
  redirect("/admin/opportunities");
}
