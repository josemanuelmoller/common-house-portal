/**
 * GET /api/plan/artifacts/[id]/details
 * Returns questions + version history for a single artifact.
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { getArtifactDetails } from "@/lib/plan";
import { adminGuardApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;

  try {
    const details = await getArtifactDetails(id);
    return NextResponse.json(details);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
