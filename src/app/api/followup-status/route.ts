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
import { getCoSTasks } from "@/lib/notion";
import { DB } from "@/lib/notion/core";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const VALID_STATUSES = ["Needed", "In Progress", "Waiting", "Done", "Dropped", "Sent", "None"] as const;
type FollowUpStatus = (typeof VALID_STATUSES)[number];

// Temporary debug endpoint — returns raw Notion results + CoS task count
export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  try {
    // Direct Notion query to diagnose filter issues
    const raw = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        or: [
          // "In Progress" excluded — not a valid Notion select option yet
          { property: "Follow-up Status", select: { equals: "Needed"  } },
          { property: "Follow-up Status", select: { equals: "Waiting" } },
          { property: "Follow-up Status", select: { equals: "Sent"    } },
          { property: "Opportunity Status", select: { equals: "Active"     } },
          { property: "Opportunity Status", select: { equals: "Qualifying" } },
          { property: "Opportunity Status", select: { equals: "New"        } },
        ],
      },
      page_size: 10,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sample = (raw.results as any[]).slice(0, 5).map(p => ({
      id: p.id,
      name: p.properties["Opportunity Name"]?.title?.[0]?.plain_text || p.properties["Name"]?.title?.[0]?.plain_text || "?",
      status: p.properties["Opportunity Status"]?.select?.name,
      followUpStatus: p.properties["Follow-up Status"]?.select?.name,
      meeting: p.properties["Next Meeting Date"]?.date?.start,
      trigger: p.properties["Trigger / Signal"]?.rich_text?.[0]?.plain_text,
      sourceUrl: p.properties["Source URL"]?.url,
    }));
    const tasks = await getCoSTasks();
    return NextResponse.json({ rawCount: raw.results.length, cosCount: tasks.length, sample, tasks: tasks.slice(0, 3) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

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
