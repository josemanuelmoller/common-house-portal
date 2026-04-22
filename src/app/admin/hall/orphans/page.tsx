import { redirect } from "next/navigation";

// Orphan matches are now a tab inside /admin/hall/contacts. Keep this route
// alive as a permanent redirect so any bookmarked links still work.
export default function OrphansRedirectPage() {
  redirect("/admin/hall/contacts?mode=orphans");
}
