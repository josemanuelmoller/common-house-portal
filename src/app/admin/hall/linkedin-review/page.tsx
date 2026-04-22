import { redirect } from "next/navigation";

// LinkedIn review is now a tab inside /admin/hall/contacts. Keep this route
// alive as a permanent redirect so any bookmarked links still work.
export default function LinkedInReviewRedirectPage() {
  redirect("/admin/hall/contacts?mode=linkedin");
}
