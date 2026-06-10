import { redirect } from "next/navigation";

/**
 * /admin/ops-mirror → /admin/opportunities (2026-06-10 consolidation).
 *
 * ops-mirror was the Phase 2 "Supabase read test" for the opportunities
 * mirror. The test passed long ago — /admin/opportunities IS the Supabase
 * read path now. Keeping a second read-only copy of the same table around
 * just splits attention.
 */
export default function OpsMirrorRedirect() {
  redirect("/admin/opportunities");
}
