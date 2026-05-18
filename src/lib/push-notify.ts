/**
 * push-notify.ts — server-side Web Push helpers (Fase 5).
 *
 * Reads `push_subscriptions`, calls Web Push API via `web-push`, handles 410/404
 * (subscription gone) by marking rows is_revoked=true.
 *
 * Helpers:
 *   notifyP1(payload)        — P1 critical signal
 *   notifyDecisionPending(p) — decision_item awaiting approval
 *   notifyDeadline(p)        — deadline within window
 *   notifyDigest(p)          — morning digest
 *   notifyTest(userId)       — debug ping
 */

import webpush from "web-push";
import { getSupabaseServerClient } from "./supabase-server";

type ChannelKey = "p1" | "decision" | "deadline" | "digest" | "test";

const CHANNEL_TO_COL: Record<ChannelKey, string> = {
  p1: "notify_p1",
  decision: "notify_decision",
  deadline: "notify_deadline",
  digest: "notify_digest",
  test: "notify_p1", // test rides on p1 channel for permission consistency
};

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:portal@wearecommonhouse.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;          // landing URL on click (default "/admin")
  tag?: string;          // notifications with same tag replace each other
  actions?: Array<{ action: string; title: string }>;
  data?: Record<string, unknown>;
};

type SendOptions = {
  channel: ChannelKey;
  userId?: string;       // restrict to one user; default: all subscribers
};

type SendResult = {
  attempted: number;
  sent: number;
  revoked: number;
  errors: number;
};

export async function sendPush(
  payload: PushPayload,
  opts: SendOptions
): Promise<SendResult> {
  if (!ensureVapid()) {
    console.warn("[push] VAPID keys not configured — skipping send");
    return { attempted: 0, sent: 0, revoked: 0, errors: 0 };
  }

  const sb = getSupabaseServerClient();
  const channelCol = CHANNEL_TO_COL[opts.channel];

  let q = sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("is_revoked", false)
    .eq(channelCol, true);
  if (opts.userId) q = q.eq("user_id", opts.userId);

  const { data: subs, error } = await q;
  if (error) {
    console.error("[push] read subscriptions failed:", error);
    return { attempted: 0, sent: 0, revoked: 0, errors: 1 };
  }
  if (!subs || subs.length === 0) {
    return { attempted: 0, sent: 0, revoked: 0, errors: 0 };
  }

  const body = JSON.stringify(payload);
  const result: SendResult = {
    attempted: subs.length,
    sent: 0,
    revoked: 0,
    errors: 0,
  };

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 24 } // 24h
        );
        result.sent++;
        await sb
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq("id", sub.id);
      } catch (err) {
        const wpErr = err as { statusCode?: number; body?: string };
        if (wpErr.statusCode === 404 || wpErr.statusCode === 410) {
          // Subscription gone — mark revoked so we stop trying
          result.revoked++;
          await sb
            .from("push_subscriptions")
            .update({ is_revoked: true, last_failure_at: new Date().toISOString() })
            .eq("id", sub.id);
        } else {
          result.errors++;
          await sb
            .from("push_subscriptions")
            .update({
              last_failure_at: new Date().toISOString(),
              failure_count: (await getFailureCount(sub.id)) + 1,
            })
            .eq("id", sub.id);
          console.warn("[push] send failed:", wpErr.statusCode, wpErr.body);
        }
      }
    })
  );

  return result;
}

async function getFailureCount(id: string): Promise<number> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("push_subscriptions")
    .select("failure_count")
    .eq("id", id)
    .maybeSingle();
  return data?.failure_count ?? 0;
}

// ---------- typed helpers per channel ----------

export function notifyP1(p: PushPayload, userId?: string): Promise<SendResult> {
  return sendPush(
    {
      tag: "ch-p1",
      url: "/admin",
      ...p,
    },
    { channel: "p1", userId }
  );
}

export function notifyDecisionPending(
  p: PushPayload,
  userId?: string
): Promise<SendResult> {
  return sendPush(
    {
      tag: "ch-decision",
      url: "/admin/decisions",
      actions: [
        { action: "open", title: "Abrir" },
        { action: "snooze-1h", title: "Posponer 1h" },
      ],
      ...p,
    },
    { channel: "decision", userId }
  );
}

export function notifyDeadline(
  p: PushPayload,
  userId?: string
): Promise<SendResult> {
  return sendPush(
    {
      tag: "ch-deadline",
      url: "/admin",
      actions: [
        { action: "open", title: "Abrir" },
        { action: "snooze-24h", title: "Snoozear 24h" },
      ],
      ...p,
    },
    { channel: "deadline", userId }
  );
}

export function notifyDigest(p: PushPayload, userId?: string): Promise<SendResult> {
  return sendPush(
    {
      tag: "ch-digest",
      url: "/admin",
      ...p,
    },
    { channel: "digest", userId }
  );
}

export function notifyTest(userId?: string): Promise<SendResult> {
  return sendPush(
    {
      title: "Common House",
      body: "Push activado correctamente ✓",
      tag: "ch-test",
      url: "/admin/capture",
    },
    { channel: "test", userId }
  );
}
