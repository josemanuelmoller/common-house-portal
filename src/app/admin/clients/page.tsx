/**
 * /admin/clients — Engagements list
 *
 * Surfaces every row in the canonical Supabase `engagements` table, joined
 * to `organizations` and to the canonical `v_org_status` view (created
 * 2026-05-15) so each row carries both its formal engagement status AND
 * its derived operational state (Active Delivery / Active Partnership /
 * Proposal in flight / Idle). The bottom section also lists orgs that
 * have real operational signals — Active projects, partnerships, portfolio
 * — but no engagement row yet, so data gaps stop hiding.
 *
 * Read path is Supabase only (no Notion).
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";

export const dynamic = "force-dynamic";

type EngagementRow = {
  id: string;
  notion_id: string | null;
  relationship_name: string;
  engagement_type: string | null;
  relationship_status: string | null;
  engagement_value: number | null;
  org_notion_id: string | null;
  start_date: string | null;
  end_date: string | null;
  expected_close_date: string | null;
  notion_created_at: string | null;
  updated_at: string | null;
};

type OrgRow = {
  notion_id: string;
  name: string | null;
  website: string | null;
};

type OrgStatusRow = {
  notion_id: string;
  name: string | null;
  relationship_type: string;
  operational_state: string;
  is_active_delivery: boolean;
  is_active_partnership: boolean;
  is_active_portfolio: boolean;
  active_projects_count: number;
  active_engagements_count: number;
  last_meeting_date: string | null;
};

type EngagementWithOrg = EngagementRow & {
  org_name: string | null;
  org_website: string | null;
  operational_state: string | null;
};

const TYPE_ORDER = ["Client", "Partner", "Investor", "Funder", "Vendor"] as const;
type EngagementType = (typeof TYPE_ORDER)[number];

const STATUS_RANK: Record<string, number> = {
  Active: 0,
  Inactive: 1,
  Closed: 2,
};

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function ClientsListPage() {
  await requireAdmin();

  const sb = getSupabaseServerClient();
  const [engagementsResp, statusResp] = await Promise.all([
    sb.from("engagements").select(
      "id, notion_id, relationship_name, engagement_type, relationship_status, engagement_value, org_notion_id, start_date, end_date, expected_close_date, notion_created_at, updated_at"
    ),
    sb.from("v_org_status").select(
      "notion_id, name, relationship_type, operational_state, is_active_delivery, is_active_partnership, is_active_portfolio, active_projects_count, active_engagements_count, last_meeting_date"
    ),
  ]);
  const eErr = engagementsResp.error;
  const engagements = (engagementsResp.data ?? []) as EngagementRow[];
  const statusRows  = (statusResp.data ?? []) as OrgStatusRow[];
  const statusByOrg = new Map(statusRows.map((s) => [s.notion_id, s]));

  // Fetch the unique linked orgs (name + website) for engagements.
  const orgIds = Array.from(
    new Set(engagements.map((e) => e.org_notion_id).filter((v): v is string => !!v))
  );
  const orgsById = new Map<string, OrgRow>();
  if (orgIds.length > 0) {
    const { data: orgsData } = await sb
      .from("organizations")
      .select("notion_id, name, website")
      .in("notion_id", orgIds);
    for (const o of (orgsData ?? []) as OrgRow[]) {
      orgsById.set(o.notion_id, o);
    }
  }

  const enriched: EngagementWithOrg[] = engagements.map((e) => {
    const o = e.org_notion_id ? orgsById.get(e.org_notion_id) : undefined;
    const s = e.org_notion_id ? statusByOrg.get(e.org_notion_id) : undefined;
    return {
      ...e,
      org_name: o?.name ?? null,
      org_website: o?.website ?? null,
      operational_state: s?.operational_state ?? null,
    };
  });

  // Orgs with real operational signal but no engagement row — surfaces the
  // gap rather than hiding it. Excludes Archived + Idle. Excludes orgs that
  // already appear in an engagement row above.
  const orgsWithEngagement = new Set(
    engagements.map((e) => e.org_notion_id).filter((v): v is string => !!v)
  );
  const orphanOrgs = statusRows
    .filter((s) => !orgsWithEngagement.has(s.notion_id))
    .filter((s) => s.operational_state !== "Idle" && s.operational_state !== "Archived")
    .sort((a, b) => (b.active_projects_count ?? 0) - (a.active_projects_count ?? 0));

  // Group by engagement_type — Client first, then Partner, Investor, Funder, Vendor.
  const groups = new Map<EngagementType | "Other", EngagementWithOrg[]>();
  for (const t of TYPE_ORDER) groups.set(t, []);
  groups.set("Other", []);
  for (const e of enriched) {
    const key = (TYPE_ORDER as readonly string[]).includes(e.engagement_type ?? "")
      ? (e.engagement_type as EngagementType)
      : "Other";
    groups.get(key)!.push(e);
  }

  // Within each group: Active first, then by engagement_value DESC.
  for (const [, rows] of groups) {
    rows.sort((a, b) => {
      const sa = STATUS_RANK[a.relationship_status ?? ""] ?? 99;
      const sb = STATUS_RANK[b.relationship_status ?? ""] ?? 99;
      if (sa !== sb) return sa - sb;
      const va = a.engagement_value ?? -1;
      const vb = b.engagement_value ?? -1;
      return vb - va;
    });
  }

  const total = enriched.length;
  const activeCount = enriched.filter((e) => e.relationship_status === "Active").length;
  const totalValue = enriched
    .filter((e) => e.relationship_status === "Active")
    .reduce((sum, e) => sum + (e.engagement_value ?? 0), 0);

  return (
    <PortalShell
      eyebrow={{ label: "COMMERCIAL", accent: `${total} ENGAGEMENTS` }}
      title="Clients"
      flourish="& engagements"
      subtitle="Every revenue-bearing or strategic relationship — Clients, Partners, Investors, Funders, Vendors. Mirrors the canonical engagements table in Supabase."
      meta={
        <div
          className="flex items-center gap-4 text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          <span>
            ACTIVE <b style={{ color: "var(--hall-ink-0)" }}>{activeCount}</b>
          </span>
          <span style={{ color: "var(--hall-line)" }}>·</span>
          <span>
            TOTAL <b style={{ color: "var(--hall-ink-0)" }}>{total}</b>
          </span>
          <span style={{ color: "var(--hall-line)" }}>·</span>
          <span>
            ACTIVE VALUE <b style={{ color: "var(--hall-ink-0)" }}>{fmtMoney(totalValue)}</b>
          </span>
          <Link
            href="/admin/clients/new"
            className="hall-btn-primary"
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
            + New
          </Link>
        </div>
      }
      metaMobile={
        <span
          className="text-[10px] whitespace-nowrap"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          <b style={{ color: "var(--hall-ink-0)" }}>{activeCount}</b>
          {" / "}
          <b style={{ color: "var(--hall-ink-0)" }}>{total}</b>
        </span>
      }
    >
      {eErr && (
        <p
          className="text-[11px]"
          style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}
        >
          Supabase error: {eErr.message}
        </p>
      )}

      <Link
        href="/admin/clients/new"
        className="hall-btn-primary sm:hidden inline-block"
        style={{ padding: "6px 14px", fontSize: 11 }}
      >
        + New engagement
      </Link>

      {([...TYPE_ORDER, "Other"] as (EngagementType | "Other")[]).map((type) => {
        const rows = groups.get(type) ?? [];
        if (rows.length === 0) return null;
        const active = rows.filter((r) => r.relationship_status === "Active").length;
        return (
          <HallSection
            key={type}
            title={type}
            meta={`${rows.length} TOTAL · ${active} ACTIVE`}
          >
            <ul className="flex flex-col">
              {rows.map((e) => (
                <EngagementRowItem key={e.id} engagement={e} />
              ))}
            </ul>
          </HallSection>
        );
      })}

      {orphanOrgs.length > 0 && (
        <HallSection
          title="Active without engagement"
          meta={`${orphanOrgs.length} ORG${orphanOrgs.length === 1 ? "" : "S"} · DATA GAP`}
        >
          <p
            className="text-[10.5px] mb-3"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)", lineHeight: 1.6 }}
          >
            Organisations with real operational signal (Active project,
            partnership or portfolio relationship) but no engagement row in
            Supabase. Click → create the engagement when the formal terms
            are confirmed.
          </p>
          <ul className="flex flex-col">
            {orphanOrgs.map((s) => (
              <OrphanOrgRow key={s.notion_id} status={s} />
            ))}
          </ul>
        </HallSection>
      )}

      {total === 0 && orphanOrgs.length === 0 && !eErr && (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-sans)" }}
        >
          No engagements yet. Click <strong>+ New</strong> to add the first one.
        </p>
      )}
    </PortalShell>
  );
}

function operationalStateColor(state: string | null): string {
  switch (state) {
    case "Active Delivery":     return "var(--hall-ok)";
    case "Active Partnership":  return "var(--hall-ok)";
    case "Active Portfolio":    return "var(--hall-ok)";
    case "Proposal in flight":  return "var(--hall-warn)";
    case "Archived":            return "var(--hall-muted-3)";
    case "Idle":                return "var(--hall-muted-3)";
    default:                    return "var(--hall-muted-3)";
  }
}

function OrphanOrgRow({ status }: { status: OrgStatusRow }) {
  const stateColor = operationalStateColor(status.operational_state);
  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <Link
        href={`/admin/clients/new?org_notion_id=${encodeURIComponent(status.notion_id)}`}
        className="block py-3 px-1 transition-colors hover:bg-[var(--hall-fill-soft)]"
      >
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
          <span
            className="flex-1 min-w-0 text-[12.5px] font-semibold truncate"
            style={{ color: "var(--hall-ink-0)" }}
          >
            {status.name ?? "(unnamed)"}
          </span>
          <span
            className="text-[9px] uppercase whitespace-nowrap"
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              border: "1px solid var(--hall-line)",
              padding: "2px 6px",
              color: stateColor,
            }}
          >
            {status.operational_state}
          </span>
          <span
            className="text-[10px] uppercase whitespace-nowrap"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            {status.relationship_type} · {status.active_projects_count} project
            {status.active_projects_count === 1 ? "" : "s"}
          </span>
        </div>
      </Link>
    </li>
  );
}

function EngagementRowItem({ engagement }: { engagement: EngagementWithOrg }) {
  const status = engagement.relationship_status ?? "—";
  const statusColor =
    status === "Active"
      ? "var(--hall-ok)"
      : status === "Inactive"
        ? "var(--hall-warn)"
        : status === "Closed"
          ? "var(--hall-muted-3)"
          : "var(--hall-muted-3)";

  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <Link
        href={`/admin/clients/${engagement.id}`}
        className="block py-3 px-1 transition-colors hover:bg-[var(--hall-fill-soft)]"
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[12.5px] font-semibold truncate"
                style={{ color: "var(--hall-ink-0)" }}
              >
                {engagement.relationship_name}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 uppercase"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  border: "1px solid var(--hall-line)",
                  color: statusColor,
                }}
              >
                {status}
              </span>
              {engagement.operational_state && engagement.operational_state !== "Idle" && (
                <span
                  className="text-[9px] px-1.5 py-0.5 uppercase"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    border: "1px solid var(--hall-line)",
                    color: operationalStateColor(engagement.operational_state),
                  }}
                  title="Derived operational state from v_org_status (Active project or partnership)"
                >
                  {engagement.operational_state}
                </span>
              )}
            </div>
            <p
              className="text-[10.5px] mt-0.5"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              {engagement.org_name ? (
                <>
                  <strong style={{ color: "var(--hall-ink-0)" }}>{engagement.org_name}</strong>
                  {engagement.org_website && (
                    <>
                      {" · "}
                      {engagement.org_website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </>
                  )}
                </>
              ) : engagement.org_notion_id ? (
                <span style={{ color: "var(--hall-muted-3)" }}>(org link missing)</span>
              ) : (
                <span style={{ color: "var(--hall-muted-3)" }}>(no org linked)</span>
              )}
              {engagement.start_date && <> · started {fmtDate(engagement.start_date)}</>}
              {engagement.expected_close_date && (
                <> · close {fmtDate(engagement.expected_close_date)}</>
              )}
            </p>
          </div>
          <div className="shrink-0 flex sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0">
            <span
              className="text-[14px] font-bold"
              style={{ color: "var(--hall-ink-0)", letterSpacing: "-0.02em" }}
            >
              {fmtMoney(engagement.engagement_value)}
            </span>
            <span
              className="text-[9px] uppercase"
              style={{
                fontFamily: "var(--font-hall-mono)",
                color: "var(--hall-muted-3)",
                letterSpacing: "0.08em",
              }}
            >
              {engagement.engagement_type ?? "—"}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
