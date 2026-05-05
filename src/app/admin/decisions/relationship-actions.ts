/**
 * Relationship-classification approval — Supabase-only.
 *
 * Resolves a decision_items row created by the relationship-promotion-operator
 * (`entity_action='classify_relationship'`) by writing the actual classification
 * to organizations + hall_organizations and marking the decision Resolved.
 *
 * No Notion writes. Built post-Phase-1 (2026-05-05) and survives the cutoff
 * unchanged.
 */

"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  promotePeopleFromObservations,
  type RelationshipClass,
} from "@/lib/promote-people-from-observations";

type ClassificationLabel = "Active Client" | "Partner" | "Investor" | "Funder";

type Result = {
  ok: boolean;
  error?: string;
  org_updated?: boolean;
  hall_org_updated?: boolean;
  decision_resolved?: boolean;
  people_promoted?: number;
  people_updated?: number;
  whatsapp_messages_linked?: number;
};

export async function approveRelationshipClassification(
  decisionId: string,
): Promise<Result> {
  try {
    await requireAdmin();
    const user = await currentUser();
    const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

    const sb = getSupabaseServerClient();

    // 1. Load the decision_item — must be open and of the right type.
    const { data: decision, error: decErr } = await sb
      .from("decision_items")
      .select("id, status, entity_action, entity_id, entity_table, entity_payload, org_notion_id")
      .eq("id", decisionId)
      .maybeSingle();
    if (decErr) return { ok: false, error: `decision lookup failed: ${decErr.message}` };
    if (!decision) return { ok: false, error: "decision not found" };
    if (decision.entity_action !== "classify_relationship") {
      return { ok: false, error: `wrong entity_action: ${decision.entity_action}` };
    }
    if (decision.status !== "Open") {
      return { ok: false, error: `decision is not Open (status=${decision.status})` };
    }

    const payload = (decision.entity_payload ?? {}) as {
      org_id?: string;
      org_notion_id?: string;
      org_name?: string;
      proposed_class?: ClassificationLabel;
    };
    const proposedClass = payload.proposed_class ?? "Active Client";
    const orgId = payload.org_id ?? decision.entity_id;
    const orgNotionId = payload.org_notion_id ?? decision.org_notion_id;
    if (!orgId) return { ok: false, error: "decision missing entity_id (org_id)" };

    const nowIso = new Date().toISOString();

    // 2. Update the canonical organization row.
    const { error: orgErr } = await sb
      .from("organizations")
      .update({
        relationship_stage:   proposedClass,
        relationship_classes: classToArray(proposedClass),
        engagement_type:      proposedClass === "Active Client" ? "Client" : proposedClass,
        engagement_status:    "Active",
        updated_at:           nowIso,
      })
      .eq("id", orgId);
    if (orgErr) return { ok: false, error: `org update failed: ${orgErr.message}` };

    // 3. Mirror into hall_organizations by domain (best effort — only if we know the domain).
    let hallUpdated = false;
    if (orgNotionId) {
      // Look up the org's domain from organizations.org_domains (JSON-encoded text[])
      const { data: orgRow } = await sb
        .from("organizations")
        .select("org_domains, name")
        .eq("id", orgId)
        .maybeSingle();
      const domain = pickPrimaryDomain(orgRow?.org_domains ?? null);
      if (domain) {
        await sb
          .from("hall_organizations")
          .upsert(
            {
              domain,
              name: orgRow?.name ?? payload.org_name ?? domain,
              relationship_classes: classToArray(proposedClass),
              classified_at: nowIso,
              classified_by: actor,
              notion_id: orgNotionId,
              notion_synced_at: nowIso,
              updated_at: nowIso,
            },
            { onConflict: "domain" },
          );
        hallUpdated = true;
      }
    }

    // 4. Backfill people rows from observations for this domain — closes the
    //    "Engatel pattern" systemic gap (see docs/migration/REJECTED_PATTERNS.md
    //    R-003). Best-effort: failures here don't block the approval.
    let promotionResult: Awaited<ReturnType<typeof promotePeopleFromObservations>> | null = null;
    if (orgNotionId) {
      try {
        const { data: orgRow } = await sb
          .from("organizations")
          .select("org_domains")
          .eq("id", orgId)
          .maybeSingle();
        const domain = pickPrimaryDomain(orgRow?.org_domains ?? null);
        if (domain) {
          const cls = proposedClass === "Active Client" ? "Client" : (proposedClass as RelationshipClass);
          promotionResult = await promotePeopleFromObservations(
            { domain, orgNotionId, relationshipClass: cls, actor },
            sb,
          );
        }
      } catch (e) {
        // Don't fail the approval if backfill has trouble — log and continue.
        console.warn("[approveRelationshipClassification] promote-people failed:", e);
      }
    }

    // 5. Resolve the decision_item.
    const { error: resolveErr } = await sb
      .from("decision_items")
      .update({
        status: "Resolved",
        approved_at: nowIso,
        approved_by: actor,
        execute_approved: true,
        updated_at: nowIso,
      })
      .eq("id", decisionId);
    if (resolveErr) return { ok: false, error: `resolve failed: ${resolveErr.message}` };

    // 6. Refresh anywhere the change is visible.
    revalidatePath("/admin/os");
    revalidatePath("/admin/clients");
    revalidatePath("/admin/hall/organizations");
    revalidatePath("/admin");

    return {
      ok: true,
      org_updated: true,
      hall_org_updated: hallUpdated,
      decision_resolved: true,
      ...(promotionResult ? { people_promoted: promotionResult.people_inserted, people_updated: promotionResult.people_updated, whatsapp_messages_linked: promotionResult.whatsapp_messages_linked } : {}),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function rejectRelationshipClassification(
  decisionId: string,
  reason?: string,
): Promise<Result> {
  try {
    await requireAdmin();
    const user = await currentUser();
    const actor = user?.primaryEmailAddress?.emailAddress ?? "unknown";

    const sb = getSupabaseServerClient();
    const nowIso = new Date().toISOString();

    const { error } = await sb
      .from("decision_items")
      .update({
        status: "Rejected",
        rejected_at: nowIso,
        rejected_by: actor,
        notes_raw: reason ? `Rejected: ${reason}` : "Rejected",
        updated_at: nowIso,
      })
      .eq("id", decisionId)
      .eq("entity_action", "classify_relationship")
      .eq("status", "Open");
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/os");
    return { ok: true, decision_resolved: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function classToArray(c: ClassificationLabel): string[] {
  if (c === "Active Client") return ["Client"];
  return [c];
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
