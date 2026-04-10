import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { notion } from "@/lib/notion";

/**
 * GET /api/meeting-detail/[id]
 * Returns meeting source detail: properties + parsed Notion block content.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    // Get page properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: id });
    const props = page.properties;

    const title       = props["Source Title"]?.title?.[0]?.plain_text ?? "Untitled";
    const date        = props["Source Date"]?.date?.start ?? page.created_time ?? null;
    const url         = props["Source URL"]?.url ?? null;
    const platform    = props["Source Platform"]?.select?.name ?? "";
    const attendeesProp = props["Attendees"]?.multi_select?.map((s: any) => s.name) ??
                          props["Participants"]?.multi_select?.map((s: any) => s.name) ??
                          props["Attendees"]?.rich_text?.[0]?.plain_text?.split(",").map((s: string) => s.trim()) ??
                          [];

    // Get block content (summary / transcript sections)
    const blocksRes = await notion.blocks.children.list({ block_id: id, page_size: 50 });
    const blocks = blocksRes.results as any[];

    // Parse blocks into structured content
    const sections: Array<{ type: "heading" | "paragraph" | "bullet"; text: string }> = [];

    for (const block of blocks) {
      const richText = (arr: any[]) => arr?.map((t: any) => t.plain_text).join("") ?? "";

      switch (block.type) {
        case "heading_1":
        case "heading_2":
        case "heading_3":
          sections.push({ type: "heading", text: richText(block[block.type]?.rich_text) });
          break;
        case "paragraph":
          const pText = richText(block.paragraph?.rich_text);
          if (pText.trim()) sections.push({ type: "paragraph", text: pText });
          break;
        case "bulleted_list_item":
        case "numbered_list_item":
          const bText = richText(block[block.type]?.rich_text);
          if (bText.trim()) sections.push({ type: "bullet", text: bText });
          break;
      }
    }

    // Try to extract attendees from content if not in properties
    let attendees = attendeesProp;
    if (attendees.length === 0) {
      const attendeeSection = sections.find(s =>
        s.type === "heading" && /attendee|participant|asistente/i.test(s.text)
      );
      if (attendeeSection) {
        const idx = sections.indexOf(attendeeSection);
        const names = sections.slice(idx + 1).filter(s => s.type === "bullet").slice(0, 10);
        attendees = names.map(n => n.text);
      }
    }

    return NextResponse.json({
      id,
      title,
      date,
      url,
      platform,
      attendees,
      sections,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load meeting" },
      { status: 500 }
    );
  }
}
