import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import {
  updatePersonVisibility,
  updateProjectLivingRoom,
  updateInsightBriefCommunityFlag,
  updateKnowledgeAssetTheme,
} from "@/lib/notion";

/**
 * PATCH /api/living-room
 *
 * Admin-only endpoint for Living Room curation writes.
 * Writes allowed: Visibility flags, Share toggles.
 * Write-path safety: does NOT touch Validation Status, Status Summary, or Draft Status Update.
 *
 * Body:
 *   { type: "person-visibility",  id: string, visibility: "public-safe" | "community" | "private" }
 *   { type: "project-share",      id: string, share: boolean }
 *   { type: "signal-visibility",  id: string, communityRelevant: boolean }
 *   { type: "theme-active",       id: string, active: boolean }
 */
export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, id } = body;
  if (!type || !id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
  }

  try {
    switch (type) {
      case "person-visibility": {
        const vis = body.visibility as string;
        if (!["public-safe", "community", "private"].includes(vis)) {
          return NextResponse.json({ error: "Invalid visibility value" }, { status: 400 });
        }
        await updatePersonVisibility(id, vis as "public-safe" | "community" | "private");
        break;
      }
      case "project-share": {
        const share = Boolean(body.share);
        await updateProjectLivingRoom(id, share);
        break;
      }
      case "signal-visibility": {
        const communityRelevant = Boolean(body.communityRelevant);
        await updateInsightBriefCommunityFlag(id, communityRelevant);
        break;
      }
      case "theme-active": {
        const active = Boolean(body.active);
        await updateKnowledgeAssetTheme(id, active);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[living-room PATCH]", err);
    return NextResponse.json({ error: "Notion write failed" }, { status: 500 });
  }
}
