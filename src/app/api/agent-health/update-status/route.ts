/**
 * POST /api/agent-health/update-status
 *
 * Admin-only. Transitions an agent_health_diagnoses row between statuses:
 *   new → acknowledged | resolved | silenced
 *   acknowledged → resolved | silenced | new
 *   resolved → new (manual re-open)
 *   silenced → new (un-silence)
 *
 * Body: { cluster_key: string, status: 'acknowledged' | 'resolved' | 'silenced' | 'new' }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { currentUser } from "@clerk/nextjs/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["new", "acknowledged", "resolved", "silenced"]);

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { cluster_key?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const cluster_key = body.cluster_key?.trim();
  const status = body.status?.trim();

  if (!cluster_key) return NextResponse.json({ error: "cluster_key required" }, { status: 400 });
  if (!status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "admin";

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("agent_health_diagnoses")
    .update({
      status,
      status_changed_at: new Date().toISOString(),
      status_changed_by: actor,
    })
    .eq("cluster_key", cluster_key)
    .select("cluster_key, status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, cluster_key: data.cluster_key, status: data.status });
}
