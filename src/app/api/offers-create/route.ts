import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { docType, description, valueEst } = await req.json();

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }

  try {
    // Create in Proposal Briefs for Proposal/Scope/Amendment/Renewal
    // Create in Offers for Offer type
    if (docType === "Offer") {
      await notion.pages.create({
        parent: { database_id: DB.offers },
        properties: {
          "Offer Name": { title: [{ text: { content: description.slice(0, 100) } }] },
          "Offer Status": { select: { name: "In Development" } },
          ...(valueEst ? { "Notes": { rich_text: [{ text: { content: `Estimated value: ${valueEst}` } }] } } : {}),
        },
      });
    } else {
      await notion.pages.create({
        parent: { database_id: DB.proposalBriefs },
        properties: {
          "Title": { title: [{ text: { content: description.slice(0, 100) } }] },
          "Status": { select: { name: "Draft" } },
          "Proposal Type": { select: { name: docType === "Proposal" ? "Scoped" : docType === "Scope" ? "Implementation-led" : "Exploratory" } },
          ...(valueEst ? { "Budget Range": { rich_text: [{ text: { content: valueEst } }] } } : {}),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("offers-create error:", err);
    return NextResponse.json({ error: "Notion error" }, { status: 500 });
  }
}
