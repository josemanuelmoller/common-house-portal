import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { Client } from "@notionhq/client";
import { DB } from "@/lib/notion";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

/**
 * POST /api/desk-request
 *
 * Creates a new entry in the Content Pipeline DB for Design or Comms desk requests.
 *
 * Body: { deskType: "design" | "comms", contentType: string, description: string, project?: string, channel?: string }
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { deskType, contentType, description, project, channel, styleProfileId } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  const title = description.trim().slice(0, 120);

  try {
    const properties: Record<string, unknown> = {
      // Try both common title property names
      "Title": {
        title: [{ text: { content: title } }],
      },
      "Status": {
        select: { name: "Draft" },
      },
    };

    if (contentType) {
      properties["Content Type"] = { select: { name: contentType } };
    }

    if (deskType === "comms" && channel) {
      properties["Platform"] = { select: { name: channel } };
    }

    if (deskType) {
      const deskLabel =
        deskType === "design"   ? "Design"   :
        deskType === "comms"    ? "Comms"    :
        deskType === "insights" ? "Insights" :
        deskType === "grants"   ? "Grants"   :
        deskType.charAt(0).toUpperCase() + deskType.slice(1);
      properties["Desk"] = { select: { name: deskLabel } };
    }

    // Add a note with source desk
    const pageBody: Record<string, unknown> = {
      parent: { database_id: DB.contentPipeline },
      properties,
    };

    // Add description as page content
    if (description.length > 120) {
      (pageBody as any).children = [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: description } }],
          },
        },
      ];
    }

    const page = await notion.pages.create(pageBody as any);

    return NextResponse.json({ ok: true, id: page.id });
  } catch (err) {
    console.error("[desk-request POST]", err);
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }
}
