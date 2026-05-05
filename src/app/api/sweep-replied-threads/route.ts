/**
 * POST /api/sweep-replied-threads
 *
 * Closes the loop on the gmail ingestor. The ingestor only EMITS signals
 * for threads where Jose owes a reply — when Jose replies (or archives),
 * the existing open action_item is never told. This cron sweeps open Gmail
 * action_items and resolves the ones that no longer need attention.
 *
 * Resolution rules per open gmail action_item (most-specific wins):
 *   1. Thread is no longer in INBOX (Jose archived it)        → archived
 *   2. Last message sender is one of Jose's self-identities   → user_replied
 *   3. last_motion_at > 21 days ago AND nothing else triggers → auto_stale
 *
 * Items that pass none of the rules stay open.
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 * Cron: hourly Mon-Fri (vercel.json).
 */

import { NextRequest, NextResponse } from "next/server";
import { getGoogleGmailClient } from "@/lib/google-gmail";
import { getSelfEmails } from "@/lib/hall-self";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

const STALE_DAYS = 21;
const MAX_PER_RUN = 100;

type Reason = "archived" | "user_replied" | "auto_stale";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (agentKey === expected) return true;
  if (cronToken === `Bearer ${expected}`) return true;
  return false;
}

function parseFromHeader(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gmail = getGoogleGmailClient();
  if (!gmail) {
    return NextResponse.json({ error: "Gmail not configured" }, { status: 503 });
  }

  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  if (selfSet.size === 0) {
    return NextResponse.json({ error: "hall_self_identities empty" }, { status: 500 });
  }

  // 1. Fetch open Gmail action_items
  const { data: rows, error } = await sb
    .from("action_items")
    .select("id, source_id, last_motion_at")
    .eq("source_type", "gmail")
    .eq("status", "open")
    .order("last_motion_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) {
    return NextResponse.json(
      { error: "action_items query failed", detail: error.message },
      { status: 500 },
    );
  }

  const items = (rows ?? []) as Array<{ id: string; source_id: string; last_motion_at: string }>;
  if (items.length === 0) {
    return NextResponse.json({
      ok: true,
      records_read: 0,
      records_written: 0,
      notes: "No open gmail action_items.",
    });
  }

  const now = Date.now();
  const staleCutoff = now - STALE_DAYS * 86_400_000;

  const resolutions: Array<{ id: string; reason: Reason }> = [];
  const errorsByItem: Array<{ id: string; error: string }> = [];

  // 2. For each, query Gmail to determine current state.
  // We use threads.get with format=metadata for minimal cost (1 quota unit each).
  for (const item of items) {
    try {
      const t = await gmail.users.threads.get({
        userId: "me",
        id: item.source_id,
        format: "metadata",
        metadataHeaders: ["From"],
      });

      const messages = t.data.messages ?? [];
      if (messages.length === 0) {
        // Thread truly gone (deleted) — resolve as archived
        resolutions.push({ id: item.id, reason: "archived" });
        continue;
      }

      // Rule 1: archived (no longer in inbox label on the most recent message)
      const last = messages[messages.length - 1];
      const labels = last.labelIds ?? [];
      const inInbox = labels.includes("INBOX");
      if (!inInbox) {
        resolutions.push({ id: item.id, reason: "archived" });
        continue;
      }

      // Rule 2: last sender is self
      const fromHeader = (last.payload?.headers ?? [])
        .find(h => (h.name ?? "").toLowerCase() === "from")?.value ?? "";
      const lastSender = parseFromHeader(fromHeader);
      if (lastSender && selfSet.has(lastSender)) {
        resolutions.push({ id: item.id, reason: "user_replied" });
        continue;
      }

      // Rule 3: stale (no movement in N days)
      const lastMotionMs = new Date(item.last_motion_at).getTime();
      if (lastMotionMs < staleCutoff) {
        resolutions.push({ id: item.id, reason: "auto_stale" });
        continue;
      }
      // Otherwise: leave open
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Gmail 404 = thread deleted → resolve as archived
      if (/not found|404/i.test(msg)) {
        resolutions.push({ id: item.id, reason: "archived" });
      } else {
        errorsByItem.push({ id: item.id, error: msg });
      }
    }
  }

  // 3. Apply resolutions in batches grouped by reason (one UPDATE per group).
  const byReason: Record<Reason, string[]> = {
    archived:     [],
    user_replied: [],
    auto_stale:   [],
  };
  for (const r of resolutions) byReason[r.reason].push(r.id);

  let written = 0;
  const nowIso = new Date().toISOString();
  for (const [reason, ids] of Object.entries(byReason)) {
    if (ids.length === 0) continue;
    const { error: updateErr } = await sb
      .from("action_items")
      .update({
        status: "resolved",
        resolved_at: nowIso,
        resolved_reason: reason,
      })
      .in("id", ids);
    if (updateErr) {
      errorsByItem.push({ id: ids.join(","), error: updateErr.message });
      continue;
    }
    written += ids.length;
  }

  return NextResponse.json({
    ok: true,
    records_read: items.length,
    records_written: written,
    archived: byReason.archived.length,
    user_replied: byReason.user_replied.length,
    auto_stale: byReason.auto_stale.length,
    errors: errorsByItem.length > 0 ? errorsByItem : undefined,
    notes:
      `swept ${items.length}: archived=${byReason.archived.length}, ` +
      `replied=${byReason.user_replied.length}, stale=${byReason.auto_stale.length}`,
  });
}

export const POST = withRoutineLog("sweep-replied-threads", _POST);
export const GET = POST;
