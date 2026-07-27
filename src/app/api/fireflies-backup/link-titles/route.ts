/**
 * GET  /api/fireflies-backup/link-titles?days=120
 *   Dry-run: proposes calendar titles for generic-titled (externally-recorded)
 *   meetings, matched by start time (±25min) + approx duration. Returns
 *   { high: [...], ambiguous: [...] }. Nothing is changed.
 *
 * POST /api/fireflies-backup/link-titles
 *   Body { items: [{ id, title }] } — applies the approved relabels to
 *   Fireflies (updateMeetingTitle) and mirrors them into the manifest + sources.
 *
 * Auth: x-agent-key / CRON_SECRET / Clerk admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { apiError } from "@/lib/api-error";
import { computeTitleLinks, applyTitleLinks } from "@/lib/fireflies-backup";

export const maxDuration = 120;

async function authCheck(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  const agentKey = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (expected && agentKey === expected) return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* noop */ }
  return false;
}

export async function GET(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const daysP = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(daysP) && daysP > 0 ? daysP : undefined;
  try {
    const result = await computeTitleLinks(days);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err, { route: "[/api/fireflies-backup/link-titles]", status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const rawItems: unknown[] = Array.isArray(body?.items) ? (body.items as unknown[]) : [];
  const items = rawItems
    .filter((x): x is { id: string; title: string } => !!x && typeof (x as { id?: unknown }).id === "string" && typeof (x as { title?: unknown }).title === "string")
    .map((x) => ({ id: x.id, title: x.title }));
  if (items.length === 0) return NextResponse.json({ ok: false, error: "no items" }, { status: 400 });
  try {
    const result = await applyTitleLinks(items);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err, { route: "[/api/fireflies-backup/link-titles]", status: 502 });
  }
}
