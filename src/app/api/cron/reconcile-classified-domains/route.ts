/**
 * GET /api/cron/reconcile-classified-domains
 *
 * Daily Vercel cron. For every classified domain in `hall_organizations`
 * (relationship_classes is not empty + not dismissed), runs
 * `promotePeopleFromObservations`. Closes the "Engatel pattern" gap
 * (`docs/migration/REJECTED_PATTERNS.md` R-003) for any domain whose
 * observations accumulated AFTER the most recent classification event.
 *
 * Idempotent. Skips dismissed orgs. Limits to 50 domains per run to
 * stay under Vercel's cron timeout.
 *
 * Auth: Authorization: Bearer $CRON_SECRET (Vercel cron default) OR
 * x-agent-key: $CRON_SECRET (manual trigger).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { promotePeopleFromObservations, type RelationshipClass } from "@/lib/promote-people-from-observations";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PRIORITY: RelationshipClass[] = ["Client", "Partner", "Investor", "Funder", "Vendor"];

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const agentKey = req.headers.get("x-agent-key");
  if (auth !== cronSecret && agentKey !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();
  const { data: orgs, error } = await sb
    .from("hall_organizations")
    .select("domain, name, notion_id, relationship_classes")
    .is("dismissed_at", null)
    .not("relationship_classes", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const summary = {
    domains_scanned: orgs?.length ?? 0,
    people_inserted_total: 0,
    people_updated_total: 0,
    whatsapp_messages_linked_total: 0,
    per_domain: [] as Array<{
      domain: string;
      class: string | null;
      emails_observed: number;
      people_inserted: number;
      people_updated: number;
      whatsapp_messages_linked: number;
      errors: string[];
    }>,
  };

  for (const org of orgs ?? []) {
    const classes = (org.relationship_classes as string[] | null) ?? [];
    if (classes.length === 0) continue;
    const primary = PRIORITY.find((c) => classes.includes(c));
    if (!primary) continue;
    try {
      const r = await promotePeopleFromObservations(
        {
          domain: org.domain as string,
          orgNotionId: (org.notion_id as string | null) ?? null,
          relationshipClass: primary,
          actor: "cron-reconcile-classified-domains",
        },
        sb,
      );
      summary.people_inserted_total += r.people_inserted;
      summary.people_updated_total += r.people_updated;
      summary.whatsapp_messages_linked_total += r.whatsapp_messages_linked;
      summary.per_domain.push({
        domain: org.domain as string,
        class: primary,
        emails_observed: r.emails_observed,
        people_inserted: r.people_inserted,
        people_updated: r.people_updated,
        whatsapp_messages_linked: r.whatsapp_messages_linked,
        errors: r.errors,
      });
    } catch (e) {
      summary.per_domain.push({
        domain: org.domain as string,
        class: primary,
        emails_observed: 0,
        people_inserted: 0,
        people_updated: 0,
        whatsapp_messages_linked: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
