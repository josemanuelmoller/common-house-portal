/**
 * Cron route: drain pending pushes from Supabase mirror tables back to Notion.
 *
 * Runs daily; also callable manually with CRON_SECRET for diagnostics. Reads
 * rows where pending_notion_push is set, pushes each to Notion, clears the
 * pending payload on success or stamps last_push_error on failure.
 *
 * Auth: CRON_SECRET bearer (or x-agent-key).
 */

import { NextRequest, NextResponse } from "next/server";
import { pushAllPending } from "@/lib/notion-mirror-push";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const xAgent = req.headers.get("x-agent-key") ?? "";
  return auth === `Bearer ${secret}` || xAgent === secret;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  const results = await pushAllPending();
  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - t0,
    results,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
