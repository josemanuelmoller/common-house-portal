import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { getKnowledgeAssets } from "@/lib/notion";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Return all knowledge assets for curation
  const assets = await getKnowledgeAssets();
  return NextResponse.json(assets.map(a => ({
    id:        a.id,
    name:      a.name,
    category:  a.category,
    assetType: a.assetType,
    active:    (a as { livingRoomTheme?: boolean }).livingRoomTheme ?? false,
  })));
}
