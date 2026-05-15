/**
 * POST /api/pipeline-state/draft
 *
 * Primary CTA dispatcher for a Pipeline State row. Forwards to existing
 * draft skills when possible; otherwise records the click in the
 * attention_log detail and snoozes 1 day as honest feedback ("noted,
 * won't nag until tomorrow").
 *
 * Body: {
 *   entityType: 'organization' | 'opportunity',
 *   entityId: string,
 *   action: 'draft_followup' | 'draft_checkin' | 'draft_proposal' | 'open_prep' | 'open_review',
 *   payload?: Record<string, unknown>
 * }
 *
 * For `open_prep` / `open_review`, returns { redirectTo } and the client
 * is expected to navigate. For drafts, returns { queued: true } if the
 * proxy succeeded, or { logged: true, snoozedDays: 1 } as a fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { snoozeEntity } from "@/lib/pipeline-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DraftAction = "draft_followup" | "draft_checkin" | "draft_proposal" | "open_prep" | "open_review";

const SKILL_MAP: Partial<Record<DraftAction, string>> = {
  draft_followup: "/api/run-skill/draft-followup",
  draft_checkin:  "/api/run-skill/draft-checkin",
};

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  let body: { entityType?: string; entityId?: string; action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entityType, entityId, action, payload } = body;
  if (entityType !== "organization" && entityType !== "opportunity") {
    return NextResponse.json({ error: "entityType must be organization|opportunity" }, { status: 400 });
  }
  if (!entityId || typeof entityId !== "string") {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }
  const act = action as DraftAction | undefined;
  if (!act) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  // Navigation-only actions
  if (act === "open_prep" || act === "open_review") {
    return NextResponse.json({ ok: true, navigate: true });
  }

  // Log the request on the open attention_log row (audit trail).
  const sb = getSupabaseServerClient();
  await sb
    .from("hall_attention_log")
    .update({
      detail: {
        last_draft_request: {
          action: act,
          payload: payload ?? null,
          requested_at: new Date().toISOString(),
          requested_by: email,
        },
      },
    })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("resolved_at", null);

  // Proxy to existing skill route if mapped + opportunityId present.
  const skillPath = SKILL_MAP[act];
  const opportunityId = (payload && typeof payload.opportunityId === "string")
    ? payload.opportunityId
    : (entityType === "opportunity" ? entityId : undefined);

  if (skillPath && opportunityId) {
    try {
      const origin = new URL(req.url).origin;
      const proxied = await fetch(`${origin}${skillPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ opportunityId }),
      });
      if (proxied.ok) {
        const j = await proxied.json().catch(() => ({}));
        // Snooze 1d so the row doesn't immediately re-surface while the draft
        // is in inbox awaiting review.
        await snoozeEntity(entityType, entityId, 1, `drafted:${act}`, email);
        return NextResponse.json({ ok: true, queued: true, draftId: j.draftId ?? null });
      }
      // Proxy failed → fall through to honest fallback
    } catch (e) {
      console.error("[pipeline-state/draft] proxy error:", e);
    }
  }

  // Honest fallback: log the click + snooze 1d. Tells the user "we heard
  // you, we won't nag until tomorrow" without faking a draft.
  await snoozeEntity(entityType, entityId, 1, `draft_requested:${act}`, email);
  return NextResponse.json({
    ok: true,
    logged: true,
    snoozedDays: 1,
    note: skillPath
      ? "Skill proxy unavailable (no opportunityId for org-level row). Logged + snoozed 1d."
      : `No skill wired for ${act} yet. Logged + snoozed 1d.`,
  });
}
