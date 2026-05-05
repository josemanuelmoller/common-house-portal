/**
 * /admin/clients — Engagements list
 *
 * Surfaces every row in the canonical Supabase `engagements` table, joined
 * to `organizations` (by `org_notion_id = organizations.notion_id`) so the
 * org name + website are inline. This is the only operator surface for the
 * Engatel relationship and the relationship-promotion-operator depends on
 * it for freeze acceptance criterion #6.
 *
 * Read path is Supabase only (no Notion). Engagements without an
 * `org_notion_id` are still surfaced — the org cell is left empty.
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

type EngagementWithOrg = EngagementRow & {
  org_name: string | null;
  org_website: string | null;
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
  const { data: engagementsData, error: eErr } = await sb
    .from("engagements")
    .select(
      "id, notion_id, relationship_name, engagement_type, relationship_status, engagement_value, org_notion_id, start_date, end_date, expected_close_date, notion_created_at, updated_at"
    );

  const engagements = (engagementsData ?? []) as EngagementRow[];

  // Fetch the unique linked orgs in a single query.
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
    return {
      ...e,
      org_name: o?.name ?? null,
      org_website: o?.website ?? null,
    };
  });

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

      {total === 0 && !eErr && (
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
