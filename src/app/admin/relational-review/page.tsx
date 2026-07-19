/**
 * /admin/relational-review — ADR-001 human-review queue.
 *
 * Surfaces AMBIGUOUS legacy signals as proposals to make canonical, without
 * ever auto-applying them (acceptance criterion #9). Two sections:
 *   1. Relationship proposals — legacy relationship_stage / polluted org_category
 *      that imply a durable relationship not yet recorded canonically. Approve →
 *      creates an organization_relationships row (additive).
 *   2. Pre-sale projects — projects that are really opportunities (informational;
 *      conversion is a separate, human-driven step).
 *
 * Nothing here mutates existing rows. Approvals only ADD canonical relationships.
 */

import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { RelationalReviewList, type ReviewProposal } from "@/components/RelationalReviewList";

export const dynamic = "force-dynamic";

// Legacy signal → canonical relationship type. Conservative: only unambiguous
// signals map. "Prospect"/"Active"/"Monitoring" are intentionally NOT mapped
// (prospect is an opportunity, not an org identity).
const STAGE_TO_TYPE: Record<string, string> = {
  "Active Client": "client",
  Partner: "partner",
  Investor: "investor",
  Funder: "funder",
  Vendor: "vendor",
};
const CATEGORY_TO_TYPE: Record<string, string> = {
  Funder: "funder",
  Vendor: "vendor",
  Client: "client",
};
// org_category values that are NOT a real nature (a relationship leaked in).
const POLLUTED_CATEGORY = new Set(["Funder", "Vendor", "Client"]);

type OrgRow = {
  id: string;
  name: string | null;
  org_category: string | null;
  relationship_stage: string | null;
};

export default async function RelationalReviewPage() {
  await requireAdmin();
  const sb = getSupabaseServerClient();

  const [orgsRes, relsRes, presaleRes] = await Promise.all([
    sb.from("organizations").select("id, name, org_category, relationship_stage"),
    sb.from("organization_relationships").select("organization_id, relationship_type").is("ended_at", null),
    sb.from("projects").select("id, name, project_status, current_stage, client_room_enabled"),
  ]);

  const PRESALE_STATUSES = new Set(["Proposed", "Not started"]);

  const orgs = (orgsRes.data as OrgRow[] | null) ?? [];
  const existing = new Set(
    ((relsRes.data as { organization_id: string; relationship_type: string }[] | null) ?? []).map(
      (r) => `${r.organization_id}:${r.relationship_type}`
    )
  );

  const proposals: ReviewProposal[] = [];
  for (const o of orgs) {
    if (!o.name) continue;
    // Prefer the explicit relationship_stage signal, else a polluted category.
    let suggestedType: string | null = null;
    let reason = "";
    if (o.relationship_stage && STAGE_TO_TYPE[o.relationship_stage]) {
      suggestedType = STAGE_TO_TYPE[o.relationship_stage];
      reason = `relationship_stage = "${o.relationship_stage}"`;
    } else if (o.org_category && CATEGORY_TO_TYPE[o.org_category]) {
      suggestedType = CATEGORY_TO_TYPE[o.org_category];
      reason = `org_category = "${o.org_category}"`;
    }
    if (!suggestedType) continue;
    if (existing.has(`${o.id}:${suggestedType}`)) continue; // already canonical

    proposals.push({
      orgId: o.id,
      orgName: o.name,
      suggestedType,
      reason,
      natureNote:
        o.org_category && POLLUTED_CATEGORY.has(o.org_category)
          ? `org_category "${o.org_category}" is a relationship, not a nature — set a real nature (Empresa/Startup/…) on the org record too.`
          : null,
    });
  }
  proposals.sort((a, b) => a.orgName.localeCompare(b.orgName));

  const presale = (
    (presaleRes.data as
      | { id: string; name: string; project_status: string | null; current_stage: string | null; client_room_enabled: boolean }[]
      | null) ?? []
  ).filter((p) => p.project_status == null || PRESALE_STATUSES.has(p.project_status));

  return (
    <PortalShell
      eyebrow={{ label: "RELATIONAL MODEL", accent: `${proposals.length} PROPOSALS` }}
      title="Relational"
      flourish="review"
      meta={
        <span
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
        >
          {proposals.length} REL · {presale.length} PRE-SALE
        </span>
      }
      subtitle="Ambiguous legacy signals proposed for canonical modeling. Nothing is applied automatically — approve each, or handle it manually. Approvals only ADD relationships; they never change existing rows."
      narrow
    >
      <HallSection title="Relationship" flourish="proposals" meta={`${proposals.length} PENDING`}>
        <RelationalReviewList proposals={proposals} />
      </HallSection>

      <HallSection
        title="Pre-sale"
        flourish="projects"
        meta={`${presale.length} TO REVIEW`}
      >
        <p className="text-[11px] mb-3" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
          These projects are really opportunities (a proposal is not a project). Conversion to an
          opportunity + opportunity-Room is a separate, human-driven step — listed here for review only.
        </p>
        {presale.length === 0 ? (
          <p className="text-[11.5px] italic" style={{ color: "var(--hall-muted-3)" }}>None.</p>
        ) : (
          <ul className="flex flex-col">
            {presale.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 py-2.5"
                style={{ borderTop: "1px solid var(--hall-line-soft)" }}
              >
                <span className="text-[12.5px] font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--hall-ink-0)" }}>
                  {p.name}
                </span>
                <span className="text-[10px] uppercase tracking-wide" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
                  {p.project_status ?? "no status"}{p.current_stage ? ` · ${p.current_stage}` : ""}
                </span>
                {p.client_room_enabled && (
                  <span
                    className="text-[8.5px] px-1.5 py-0.5 uppercase tracking-[0.06em]"
                    style={{ fontFamily: "var(--font-hall-mono)", fontWeight: 700, color: "var(--hall-warn)", border: "1px solid var(--hall-warn)" }}
                    title="Has a Client Room while still pre-sale"
                  >
                    room
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </HallSection>
    </PortalShell>
  );
}
