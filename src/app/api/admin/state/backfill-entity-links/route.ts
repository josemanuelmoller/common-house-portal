import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { backfillEntityLinks } from "@/lib/entity-links";

export const maxDuration = 120;

/**
 * POST /api/admin/state/backfill-entity-links
 * Resolve owner/stakeholder labels on active state items to typed entity links.
 * Idempotent. Optional body: { projectId }.
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  let body: { projectId?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await backfillEntityLinks(typeof body.projectId === "string" ? body.projectId : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
