/**
 * POST /api/admin/engagements
 *
 * Creates a new row in the canonical Supabase `engagements` table.
 * Used by /admin/clients/new.
 *
 * Auth: adminGuardApi (mandatory per AGENTS.md API auth rules — every
 * mutating route under /api/* must call this since src/middleware.ts
 * marks /api/* as public to Clerk).
 *
 * Body shape (all optional except relationship_name):
 *   {
 *     relationship_name: string,
 *     engagement_type?: "Client" | "Partner" | "Investor" | "Funder" | "Vendor",
 *     relationship_status?: "Active" | "Inactive" | "Closed",
 *     engagement_value?: number,
 *     org_notion_id?: string,
 *     start_date?: string (YYYY-MM-DD),
 *     end_date?: string (YYYY-MM-DD),
 *     expected_close_date?: string (YYYY-MM-DD),
 *     notes?: string,
 *     ...other fields from the engagements editor
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENGAGEMENT_TYPES = new Set(["Client", "Partner", "Investor", "Funder", "Vendor"]);
const RELATIONSHIP_STATUSES = new Set(["Active", "Inactive", "Closed"]);

const ALLOWED_KEYS = new Set([
  "relationship_name",
  "engagement_type",
  "relationship_status",
  "engagement_value",
  "budget_readiness",
  "strategic_exposure",
  "notes",
  "notes_on_terms",
  "territories_covered",
  "org_notion_id",
  "primary_owner_notion_id",
  "ch_value_add_summary",
  "start_date",
  "end_date",
  "expected_close_date",
]);

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const name = typeof body.relationship_name === "string" ? body.relationship_name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "relationship_name is required" },
      { status: 400 }
    );
  }

  if (
    body.engagement_type != null &&
    body.engagement_type !== "" &&
    !ENGAGEMENT_TYPES.has(String(body.engagement_type))
  ) {
    return NextResponse.json(
      { error: "engagement_type must be one of Client | Partner | Investor | Funder | Vendor" },
      { status: 400 }
    );
  }
  if (
    body.relationship_status != null &&
    body.relationship_status !== "" &&
    !RELATIONSHIP_STATUSES.has(String(body.relationship_status))
  ) {
    return NextResponse.json(
      { error: "relationship_status must be one of Active | Inactive | Closed" },
      { status: 400 }
    );
  }

  // Build the insert payload only from allowed keys.
  const insert: Record<string, unknown> = { relationship_name: name };
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === "relationship_name") continue;
    if (v === undefined) continue;
    insert[k] = v === "" ? null : v;
  }

  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("engagements")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Backfill people from observations for the engagement's org. Closes the
    // "Engatel pattern" gap (see docs/migration/REJECTED_PATTERNS.md R-003):
    // creating an engagement should ripple to the contacts of that org so
    // the Hall doesn't show "0 contacts" when the engagement starts.
    let observationBackfill: Awaited<ReturnType<typeof import("@/lib/promote-people-from-observations").promotePeopleFromObservations>> | null = null;
    const orgNotionId = (data?.org_notion_id as string | null) ?? null;
    const engagementType = (data?.engagement_type as string | null) ?? null;
    if (orgNotionId && engagementType) {
      try {
        const { data: orgRow } = await sb
          .from("organizations")
          .select("org_domains")
          .eq("notion_id", orgNotionId)
          .maybeSingle();
        const domain = pickPrimaryDomain(orgRow?.org_domains ?? null);
        if (domain) {
          const { promotePeopleFromObservations } = await import("@/lib/promote-people-from-observations");
          observationBackfill = await promotePeopleFromObservations(
            { domain, orgNotionId, relationshipClass: engagementType as "Client" | "Partner" | "Investor" | "Funder" | "Vendor", actor: "engagement-create" },
            sb,
          );
        }
      } catch (e) {
        console.warn("[engagements POST] observation backfill failed:", e);
      }
    }

    return NextResponse.json(
      { ok: true, row: data, observation_backfill: observationBackfill },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function pickPrimaryDomain(orgDomainsText: string | null): string | null {
  if (!orgDomainsText) return null;
  try {
    const arr = JSON.parse(orgDomainsText) as unknown;
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string") {
      return (arr[0] as string).trim().toLowerCase().replace(/^@/, "").replace(/^www\./, "");
    }
  } catch {
    // not json — fall through
  }
  return null;
}
