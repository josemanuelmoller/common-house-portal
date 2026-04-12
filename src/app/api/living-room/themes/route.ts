import { NextResponse } from "next/server";
import { getKnowledgeAssets } from "@/lib/notion";
import { adminGuardApi } from "@/lib/require-admin";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

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
