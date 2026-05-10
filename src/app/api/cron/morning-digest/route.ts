/**
 * Cron — morning digest push at 06:30 UK (BST).
 *
 * Schedule: "30 5 * * *" (UTC) ≈ 06:30 BST. In winter (GMT) this fires at
 * 05:30 local — minor drift acceptable for a daily digest.
 *
 * Composition (kept terse — push body has limited room):
 *   • bandeja items waiting (inbox_items in new / needs_review)
 *   • open tasks (chief_of_staff_tasks task_status='Open')
 *   • agents that failed overnight (routine_runs status='failed' since 18:00 prev)
 *
 * Auth: CRON_SECRET (Bearer or x-agent-key).
 */

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { notifyDigest } from "@/lib/push-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const agentKey = req.headers.get("x-agent-key");
  if (auth !== cronSecret && agentKey !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();

  const yesterdayEvening = new Date();
  yesterdayEvening.setUTCHours(yesterdayEvening.getUTCHours() - 12);

  const [inboxRes, tasksRes, failsRes] = await Promise.all([
    sb
      .from("inbox_items")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "needs_review"]),
    sb
      .from("chief_of_staff_tasks")
      .select("id", { count: "exact", head: true })
      .eq("task_status", "Open"),
    sb
      .from("routine_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("started_at", yesterdayEvening.toISOString()),
  ]);

  const inboxCount = inboxRes.count ?? 0;
  const taskCount = tasksRes.count ?? 0;
  const failCount = failsRes.count ?? 0;

  // Skip if absolutely nothing to say (avoid daily spam)
  if (inboxCount === 0 && taskCount === 0 && failCount === 0) {
    return NextResponse.json({
      ok: true,
      skipped: "no_signal",
      inboxCount,
      taskCount,
      failCount,
    });
  }

  const parts: string[] = [];
  if (inboxCount > 0) parts.push(`${inboxCount} en bandeja`);
  if (taskCount > 0) parts.push(`${taskCount} tareas abiertas`);
  if (failCount > 0) parts.push(`${failCount} agentes con error`);

  const body = parts.join(" · ");

  const result = await notifyDigest({
    title: "Buenos días — Common House",
    body,
    url: "/admin",
  });

  return NextResponse.json({
    ok: true,
    inboxCount,
    taskCount,
    failCount,
    pushResult: result,
  });
}
