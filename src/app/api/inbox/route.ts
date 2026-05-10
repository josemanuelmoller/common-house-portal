/**
 * GET /api/inbox
 * Lists inbox_items for the bandeja UI (Fase 3).
 * Query params: status (csv), limit, offset.
 */

import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { listInboxItems, isValidStatus, signInboxMediaUrl, type InboxItemStatus } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const statusCsv = searchParams.get("status");
  const limit = Number(searchParams.get("limit") ?? 100);
  const offset = Number(searchParams.get("offset") ?? 0);
  const includeMedia = searchParams.get("media") === "1";

  let statuses: InboxItemStatus[] | undefined;
  if (statusCsv) {
    statuses = statusCsv
      .split(",")
      .map((s) => s.trim())
      .filter(isValidStatus);
  }

  const { rows, error } = await listInboxItems({
    status: statuses,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100,
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  // Optionally sign media URLs (only when ?media=1 — pages that show thumbnails).
  let enriched = rows;
  if (includeMedia) {
    enriched = await Promise.all(
      rows.map(async (r) => {
        const photo_url =
          r.photo_path ? (await signInboxMediaUrl(r.photo_path)).url : null;
        const audio_url =
          r.audio_path ? (await signInboxMediaUrl(r.audio_path)).url : null;
        return { ...r, photo_url, audio_url } as typeof r & {
          photo_url: string | null;
          audio_url: string | null;
        };
      })
    );
  }

  return NextResponse.json({ ok: true, items: enriched });
}
