/**
 * GET /api/people-list
 *
 * Returns a flat list of People from the People DB [OS v2], sorted by name.
 * Used by the AgentQueueSection contact picker for assigning recipients to
 * Follow-up Email drafts.
 *
 * Only returns people who have an email address — contacts without email
 * cannot be used as draft recipients.
 *
 * Auth: admin session (Clerk).
 */

import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const PEOPLE_DB = "1bc0f96f33ca4a9e9ff26844377e81de";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  try {
    // Fetch up to 100 people — CH is a small network, one page is enough
    const res = await notion.databases.query({
      database_id: PEOPLE_DB,
      page_size: 100,
      sorts: [{ property: "Full Name", direction: "ascending" }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const people = (res.results as any[])
      .map(page => {
        const props = page.properties;
        // "Full Name" is the title field in People DB [OS v2]
        const name =
          props["Full Name"]?.title?.[0]?.plain_text ??
          props["Full Name"]?.rich_text?.[0]?.plain_text ??
          props["Name"]?.title?.[0]?.plain_text ??
          "";
        const email = props["Email"]?.email ?? "";
        return { id: page.id, name, email };
      })
      // Only return contacts who can actually receive email
      .filter(p => p.name && p.email);

    return NextResponse.json({ people });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
