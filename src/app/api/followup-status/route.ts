/**
 * PATCH /api/followup-status
 *
 * Updates the "Follow-up Status" select on an Opportunity [OS v2] record.
 * Called by ChiefOfStaffDesk (and legacy FollowUpDesk) when the user changes
 * a task's status.
 *
 * Body: { opportunityId: string, status: TaskStatus }
 *
 * Valid statuses (maps to Follow-up Status select in Notion):
 *   "Needed"      → Todo (task is pending)
 *   "In Progress" → In Progress (actively working)
 *   "Waiting"     → Waiting on them (sent, awaiting reply)
 *   "Done"        → Done (task complete — item disappears from desk)
 *   "Dropped"     → Dropped (no longer pursuing — item disappears from desk)
 *   "Sent"        → Legacy alias for Waiting
 *   "None"        → Legacy: no status set
 *
 * Auth: adminGuardApi() — must be an authenticated admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const VALID_STATUSES = ["Needed", "In Progress", "Waiting", "Done", "Dropped", "Sent", "None"] as const;
type FollowUpStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { opportunityId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { opportunityId, status } = body;

  if (!opportunityId || typeof opportunityId !== "string") {
    return NextResponse.json({ error: "opportunityId is required" }, { status: 400 });
  }
  if (!status || !VALID_STATUSES.includes(status as FollowUpStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  try {
    await notion.pages.update({
      page_id: opportunityId,
      properties: {
        "Follow-up Status": { select: { name: status } },
      },
    });

    return NextResponse.json({ ok: true, opportunityId, status });
  } catch (err) {
    console.error("[followup-status] Notion update failed:", err);
    return NextResponse.json(
      { error: "Failed to update Notion record", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
