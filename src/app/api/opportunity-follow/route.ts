/**
 * POST /api/opportunity-follow
 *
 * Explicit human activation / deactivation of an opportunity (primarily grants).
 *
 * Activation model:
 *   - Grants discovered by the system (grant-radar, scoring, heuristics) stay
 *     passive in Commercial → Grants unless a human marks them with Follow.
 *   - Only opportunities with is_followed = true may enter the active operating
 *     surfaces (Hall, Suggested Time Blocks, Chief of Staff).
 *   - Unfollow / Dismiss is a negative signal that is persisted so the record
 *     does not keep resurfacing from system scoring alone.
 *
 * Body:
 *   {
 *     opportunityId: string          // Notion page ID
 *     action: "follow" | "unfollow" | "dismiss"
 *     reason?: string                // optional, stored for unfollow/dismiss
 *   }
 *
 * Side effects on unfollow / dismiss:
 *   - All open loops linked to this opportunity are resolved and marked
 *     founder_interest = "dropped" so sync-loops will not revive them.
 *   - All "suggested" time blocks for this opportunity are marked "dismissed".
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const actorEmail = user?.primaryEmailAddress?.emailAddress ?? "unknown";

  let body: { opportunityId?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { opportunityId, action, reason } = body;
  if (!opportunityId || typeof opportunityId !== "string") {
    return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  }
  if (action !== "follow" && action !== "unfollow" && action !== "dismiss") {
    return NextResponse.json(
      { error: "action must be 'follow' | 'unfollow' | 'dismiss'" },
      { status: 400 },
    );
  }

  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  try {
    if (action === "follow") {
      const { data, error } = await sb
        .from("opportunities")
        .update({
          is_followed:     true,
          followed_at:     nowIso,
          followed_by:     actorEmail,
          unfollowed_at:   null,
          unfollow_reason: null,
          updated_at:      nowIso,
        })
        .eq("notion_id", opportunityId)
        .select("notion_id, title, opportunity_type, is_followed, followed_at, followed_by")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, action, opportunity: data });
    }

    // unfollow | dismiss
    const reasonText = (reason && reason.trim().length > 0 ? reason.trim() : action).slice(0, 500);

    const { data: updated, error: updateErr } = await sb
      .from("opportunities")
      .update({
        is_followed:     false,
        unfollowed_at:   nowIso,
        unfollow_reason: reasonText,
        updated_at:      nowIso,
      })
      .eq("notion_id", opportunityId)
      .select("notion_id, title, opportunity_type, is_followed, unfollowed_at, unfollow_reason")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: "update_failed", detail: updateErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Side effect 1: close any open loops linked to this opportunity and drop
    // them from the radar so sync-loops will not reopen them.
    const { data: openLoops } = await sb
      .from("loops")
      .select("id")
      .eq("linked_entity_type", "opportunity")
      .eq("linked_entity_id",   opportunityId)
      .in("status", ["open", "in_progress", "reopened", "waiting"]);

    const openLoopIds = (openLoops ?? []).map(r => r.id as string);

    if (openLoopIds.length > 0) {
      await sb
        .from("loops")
        .update({
          status:            "resolved",
          resolved_at:       nowIso,
          updated_at:        nowIso,
          founder_interest:  "dropped",
        })
        .in("id", openLoopIds);

      await sb.from("loop_actions").insert(
        openLoopIds.map(id => ({
          loop_id:     id,
          action_type: "resolved",
          actor:       actorEmail,
          note:        `opportunity_unfollowed: ${reasonText}`,
        })),
      );
    }

    // Side effect 2: dismiss any still-suggested time blocks for this opportunity
    await sb
      .from("suggested_time_blocks")
      .update({ status: "dismissed", dismissed_at: nowIso })
      .eq("linked_entity_type", "opportunity")
      .eq("linked_entity_id",   opportunityId)
      .eq("status",             "suggested");

    return NextResponse.json({
      ok: true,
      action,
      opportunity: updated,
      resolved_loops: openLoopIds.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "unexpected", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
