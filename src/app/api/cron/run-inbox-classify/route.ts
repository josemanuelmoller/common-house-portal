/**
 * Cron — runs the inbox-classifier-agent.
 *
 * Picks up to 20 inbox_items in status='new' and classifies them.
 * Schedule: every 15 minutes (vercel.json).
 *
 * Auth: CRON_SECRET via Authorization: Bearer or x-agent-key.
 */

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { classifyInboxItem } from "@/lib/inbox-classifier";
import type { InboxItem } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min: classifying 20 items × ~10s = 200s

const BATCH = 20;

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();
  const { data: items, error } = await sb
    .from("inbox_items")
    .select("*")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (items ?? []) as InboxItem[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, skipped: 0, total: 0 });
  }

  let processed = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const item of rows) {
    try {
      const r = await classifyInboxItem(item);
      if (r.ok) {
        processed++;
      } else {
        skipped++;
        errors.push({ id: item.id, error: r.error || "unknown" });
      }
    } catch (e) {
      skipped++;
      errors.push({ id: item.id, error: String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    total: rows.length,
    errors: errors.slice(0, 10),
  });
}

function isAuthed(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const agentKey = req.headers.get("x-agent-key");
  return auth === cronSecret || agentKey === cronSecret;
}
