import { redirect } from "next/navigation";

// The Decisions center was fused into /admin/os (Intake).
// All open decisions now appear at the top of the unified "Needs Your Call" queue.
// This keeps old bookmarks / in-app links from 404-ing.
export default function DecisionsRedirect(): never {
  redirect("/admin/os");
}
