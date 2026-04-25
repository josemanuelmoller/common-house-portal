/**
 * Cron route: Notion → Supabase read-mirror sync.
 *
 * Runs every 5 min via Vercel cron (or on demand). Invokes
 * syncAllNotionMirrors() which pulls fresh data from the hot Notion DBs
 * and upserts into mirror tables. Hall reads from those mirrors.
 *
 * Auth: CRON_SECRET bearer (or x-agent-key) — same pattern as other cron routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncAllNotionMirrors } from "@/lib/notion-sync";

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
  const results = await syncAllNotionMirrors();
  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - t0,
    results,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
