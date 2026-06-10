/**
 * Cron — morning digest push at 06:30 UK (BST). The team's standup, delivered
 * to Jose's phone: every count is a DECISION waiting for him, not a vanity
 * metric. The work travels to Jose — he doesn't have to visit pages.
 *
 * Schedule: "30 5 * * *" (UTC) ≈ 06:30 BST. In winter (GMT) this fires at
 * 05:30 local — minor drift acceptable for a daily digest.
 *
 * Composition (kept terse — push body has limited room):
 *   • open decision_items (proposals from agents awaiting his call)
 *   • proposed content_pitches (comms ideas awaiting approve/reject)
 *   • inbox threads waiting on him (action_items gmail/ball=jose)
 *   • bandeja items waiting (inbox_items in new / needs_review)
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

  const [decisionsRes, pitchesRes, mailRes, capturaRes, failsRes] = await Promise.all([
    sb
      .from("decision_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "Open"),
    sb
      .from("content_pitches")
      .select("id", { count: "exact", head: true })
      .eq("status", "proposed"),
    sb
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "gmail")
      .eq("ball_in_court", "jose")
      .eq("status", "open"),
    sb
      .from("inbox_items")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "needs_review"]),
    sb
      .from("routine_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("started_at", yesterdayEvening.toISOString()),
  ]);

  const decisionCount = decisionsRes.count ?? 0;
  const pitchCount = pitchesRes.count ?? 0;
  const mailCount = mailRes.count ?? 0;
  const capturaCount = capturaRes.count ?? 0;
  const failCount = failsRes.count ?? 0;

  // Skip if absolutely nothing to say (avoid daily spam)
  if (decisionCount === 0 && pitchCount === 0 && mailCount === 0 && capturaCount === 0 && failCount === 0) {
    return NextResponse.json({
      ok: true,
      skipped: "no_signal",
      decisionCount,
      pitchCount,
      mailCount,
      capturaCount,
      failCount,
    });
  }

  const parts: string[] = [];
  if (decisionCount > 0) parts.push(`${decisionCount} decisión${decisionCount === 1 ? "" : "es"}`);
  if (pitchCount > 0) parts.push(`${pitchCount} pitch${pitchCount === 1 ? "" : "es"}`);
  if (mailCount > 0) parts.push(`${mailCount} inbox`);
  if (capturaCount > 0) parts.push(`${capturaCount} en bandeja`);
  if (failCount > 0) parts.push(`⚠ ${failCount} agente${failCount === 1 ? "" : "s"} con error`);

  const body = parts.join(" · ");

  const result = await notifyDigest({
    title: "Buenos días — Common House",
    body,
    url: "/admin",
  });

  return NextResponse.json({
    ok: true,
    decisionCount,
    pitchCount,
    mailCount,
    capturaCount,
    failCount,
    pushResult: result,
  });
}
