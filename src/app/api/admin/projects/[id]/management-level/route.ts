/**
 * PATCH /api/admin/projects/:id/management-level
 *
 * Updates the `Management Level` select field on a CH Projects [OS v2] page.
 * Used by /admin/settings/project-roles to configure which projects Jose
 * manages operationally vs. advises vs. observes. The value gates whether
 * Fireflies / Loops ingestors emit ActionSignals into Jose's desk.
 *
 * Body: { level: "operational" | "mentorship" | "observer" }
 *
 * Auth: adminGuardApi (Clerk admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { notion } from "@/lib/notion/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_LEVELS = new Set(["operational", "mentorship", "observer"]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || typeof id !== "string" || id.length < 8) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  let body: { level?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json body" }, { status: 400 });
  }

  const level = body.level;
  if (!level || !VALID_LEVELS.has(level)) {
    return NextResponse.json(
      { ok: false, error: "level must be one of operational|mentorship|observer" },
      { status: 400 }
    );
  }

  try {
    await (notion.pages as unknown as {
      update: (args: unknown) => Promise<unknown>;
    }).update({
      page_id: id,
      properties: {
        "Management Level": { select: { name: level } },
      },
    });
    return NextResponse.json({ ok: true, level });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
