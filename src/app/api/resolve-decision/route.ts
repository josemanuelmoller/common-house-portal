/**
 * Resolve a decision item from the portal (Hall "Needs your call" queue +
 * /admin/os intake).
 *
 * Writes the CANONICAL decision_items table. (Until 2026-06-10 this went
 * through applyMirrorEdit → notion_decision_items, whose write path was
 * no-op'd at the Notion cutoff — every resolve/dismiss from the portal
 * silently did nothing, which is why the queue froze in April.)
 *
 * Body: { id: string; action?: "resolve" | "dismiss"; note?: string }
 * Auth: admin session (Clerk).
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logHallEvent } from "@/lib/hall-events";

const UUIDish = /^[0-9a-f-]{32,36}$/i;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  const body = await req.json().catch(() => ({}));
  const id: string = body.id ?? "";
  const action: string = body.action ?? "resolve"; // "resolve" | "dismiss"
  const note: string = body.note ?? "";

  if (!id || !UUIDish.test(id)) {
    return NextResponse.json({ error: "valid id is required" }, { status: 400 });
  }

  const newStatus = action === "dismiss" ? "Dismissed" : "Resolved";
  const nowIso = new Date().toISOString();

  const sb = getSupabaseServerClient();

  // Locate the row — callers may hold either the canonical uuid or notion_id.
  const { data: row, error: findErr } = await sb
    .from("decision_items")
    .select("id, payload")
    .or(`id.eq.${id},notion_id.eq.${id}`)
    .maybeSingle();
  if (findErr || !row) {
    return NextResponse.json(
      { error: "Decision not found", detail: findErr?.message },
      { status: 404 },
    );
  }

  const changes: Record<string, unknown> = {
    status: newStatus,
    updated_at: nowIso,
  };
  if (newStatus === "Resolved") {
    changes.approved_at = nowIso;
    changes.approved_by = email;
  } else {
    // rejected_at feeds the promotion-scan 30-day dedupe — a dismissed
    // proposal stays quiet instead of re-proposing tomorrow.
    changes.rejected_at = nowIso;
    changes.rejected_by = email;
  }
  if (note) {
    const payload = (row.payload && typeof row.payload === "object") ? row.payload as Record<string, unknown> : {};
    changes.payload = { ...payload, resolution_note: note, resolved_via: "portal" };
  }

  const { error: updErr } = await sb
    .from("decision_items")
    .update(changes)
    .eq("id", row.id as string);
  if (updErr) {
    return NextResponse.json(
      { error: "Update failed", detail: updErr.message },
      { status: 500 },
    );
  }

  // Telemetry: decisions made FROM the flow (Hall/OS) — the metric that says
  // the portal is working as a team, not as a website.
  logHallEvent({
    source: "decisions",
    type: "decision_resolved_from_flow",
    user_email: email ?? "unknown",
    metadata: { action: newStatus, decision_id: row.id as string },
  });

  return NextResponse.json({ ok: true, id: row.id, status: newStatus });
}
