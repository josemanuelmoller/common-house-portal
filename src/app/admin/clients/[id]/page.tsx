/**
 * /admin/clients/[id] — Engagement detail
 *
 * Loads one row from `engagements` (Supabase), the linked organization,
 * and the most recent related Evidence rows (filtered by org_notion_id).
 *
 * Editing is delegated to a client component (<EngagementEditor>) which
 * PATCHes /api/admin/engagements/[id] and calls router.refresh() on success.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { safeHref } from "@/lib/safe-href";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { EngagementEditor } from "@/components/EngagementEditor";

export const dynamic = "force-dynamic";

type EngagementRow = {
  id: string;
  notion_id: string | null;
  legacy_notion_id: string | null;
  legacy_source_db: string | null;
  relationship_name: string;
  engagement_type: string | null;
  relationship_status: string | null;
  engagement_value: number | null;
  budget_readiness: string | null;
  strategic_exposure: string | null;
  notes: string | null;
  notes_on_terms: string | null;
  territories_covered: string | null;
  org_notion_id: string | null;
  primary_owner_notion_id: string | null;
  ch_value_add_summary: string | null;
  start_date: string | null;
  end_date: string | null;
  expected_close_date: string | null;
  notion_created_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrgRow = {
  notion_id: string;
  name: string | null;
  website: string | null;
  org_category: string | null;
  org_domains: string | null;
};

type EvidenceRow = {
  notion_id: string;
  title: string;
  evidence_type: string | null;
  validation_status: string | null;
  date_captured: string | null;
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

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  // Special-case the /new route — handled below, sibling route file.
  if (id === "new") notFound();

  const sb = getSupabaseServerClient();
  const { data: engagement, error } = await sb
    .from("engagements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !engagement) notFound();
  const e = engagement as EngagementRow;

  // Linked org
  let org: OrgRow | null = null;
  let firstDomain: string | null = null;
  if (e.org_notion_id) {
    const { data: orgData } = await sb
      .from("organizations")
      .select("notion_id, name, website, org_category, org_domains")
      .eq("notion_id", e.org_notion_id)
      .maybeSingle();
    if (orgData) {
      org = orgData as OrgRow;
      if (org.org_domains) {
        try {
          const arr = JSON.parse(org.org_domains) as unknown;
          if (Array.isArray(arr) && typeof arr[0] === "string") {
            firstDomain = arr[0] as string;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Linked evidence (recent)
  let evidence: EvidenceRow[] = [];
  if (e.org_notion_id) {
    const { data: evData } = await sb
      .from("evidence")
      .select("notion_id, title, evidence_type, validation_status, date_captured")
      .eq("org_notion_id", e.org_notion_id)
      .order("date_captured", { ascending: false, nullsFirst: false })
      .limit(8);
    evidence = (evData ?? []) as EvidenceRow[];
  }

  const status = e.relationship_status ?? "—";
  const statusColor =
    status === "Active"
      ? "var(--hall-ok)"
      : status === "Inactive"
        ? "var(--hall-warn)"
        : status === "Closed"
          ? "var(--hall-muted-3)"
          : "var(--hall-muted-3)";

  return (
    <PortalShell
      eyebrow={{ label: "ENGAGEMENT", accent: e.engagement_type ?? "—" }}
      title={e.relationship_name}
      meta={
        <div
          className="flex items-center gap-3 text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          <span
            className="px-1.5 py-0.5 uppercase"
            style={{
              fontWeight: 700,
              letterSpacing: "0.08em",
              border: "1px solid var(--hall-line)",
              color: statusColor,
            }}
          >
            {status}
          </span>
          <span style={{ color: "var(--hall-line)" }}>·</span>
          <span>
            VALUE <b style={{ color: "var(--hall-ink-0)" }}>{fmtMoney(e.engagement_value)}</b>
          </span>
          <Link
            href="/admin/clients"
            className="hall-btn-outline"
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
            ← All
          </Link>
        </div>
      }
      metaMobile={
        <span
          className="text-[10px] whitespace-nowrap"
          style={{ fontFamily: "var(--font-hall-mono)", color: statusColor }}
        >
          {status} · <b style={{ color: "var(--hall-ink-0)" }}>{fmtMoney(e.engagement_value)}</b>
        </span>
      }
    >
      <HallSection title="Overview" meta={`UPDATED ${fmtDate(e.updated_at)}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <Field label="Organization">
            {org ? (
              <span>
                <strong style={{ color: "var(--hall-ink-0)" }}>{org.name ?? "(unnamed)"}</strong>
                {firstDomain && (
                  <>
                    {" · "}
                    <Link
                      href={`/admin/hall/organizations/${encodeURIComponent(firstDomain)}`}
                      className="underline underline-offset-2"
                      style={{ color: "var(--hall-ink-0)" }}
                    >
                      hall page →
                    </Link>
                  </>
                )}
                {(() => {
                  const safe = safeHref(org.website);
                  return safe ? (
                    <>
                      {" · "}
                      <a
                        href={safe}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                        style={{ color: "var(--hall-ink-0)" }}
                      >
                        {safe.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </>
                  ) : null;
                })()}
              </span>
            ) : e.org_notion_id ? (
              <span style={{ color: "var(--hall-muted-3)" }}>
                Linked org_notion_id <code>{e.org_notion_id.slice(0, 8)}…</code> not found in
                organizations table.
              </span>
            ) : (
              <span style={{ color: "var(--hall-muted-3)" }}>(no org linked)</span>
            )}
          </Field>
          <Field label="Type">{e.engagement_type ?? "—"}</Field>
          <Field label="Status">{status}</Field>
          <Field label="Engagement value">{fmtMoney(e.engagement_value)}</Field>
          <Field label="Start date">{fmtDate(e.start_date)}</Field>
          <Field label="End date">{fmtDate(e.end_date)}</Field>
          <Field label="Expected close">{fmtDate(e.expected_close_date)}</Field>
          <Field label="Budget readiness">{e.budget_readiness ?? "—"}</Field>
          <Field label="Strategic exposure">{e.strategic_exposure ?? "—"}</Field>
          <Field label="Territories">{e.territories_covered ?? "—"}</Field>
        </div>
        {e.notes && (
          <Block label="Notes" body={e.notes} />
        )}
        {e.notes_on_terms && (
          <Block label="Notes on terms" body={e.notes_on_terms} />
        )}
        {e.ch_value_add_summary && (
          <Block label="CH value-add summary" body={e.ch_value_add_summary} />
        )}
      </HallSection>

      <HallSection title="Edit" flourish="inline" meta="ADMIN ONLY">
        <EngagementEditor
          id={e.id}
          initial={{
            relationship_name: e.relationship_name,
            engagement_type: e.engagement_type,
            relationship_status: e.relationship_status,
            engagement_value: e.engagement_value,
            budget_readiness: e.budget_readiness,
            strategic_exposure: e.strategic_exposure,
            territories_covered: e.territories_covered,
            org_notion_id: e.org_notion_id,
            start_date: e.start_date,
            end_date: e.end_date,
            expected_close_date: e.expected_close_date,
            notes: e.notes,
            notes_on_terms: e.notes_on_terms,
            ch_value_add_summary: e.ch_value_add_summary,
          }}
        />
      </HallSection>

      <HallSection
        title="Recent evidence"
        meta={`${evidence.length} ROW${evidence.length === 1 ? "" : "S"}`}
      >
        {evidence.length === 0 ? (
          <p
            className="text-[11px]"
            style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-sans)" }}
          >
            {e.org_notion_id
              ? "No evidence linked to this organization yet."
              : "Cannot load evidence — engagement has no org_notion_id."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {evidence.map((ev) => (
              <li key={ev.notion_id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-2 px-1">
                  <span
                    className="flex-1 min-w-0 text-[12px] truncate"
                    style={{ color: "var(--hall-ink-0)" }}
                  >
                    {ev.title}
                  </span>
                  <span
                    className="text-[10px] uppercase whitespace-nowrap"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      color: "var(--hall-muted-2)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {ev.evidence_type ?? "—"} · {ev.validation_status ?? "—"} ·{" "}
                    {fmtDate(ev.date_captured)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HallSection>
    </PortalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[9.5px] uppercase tracking-[0.08em] mb-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </p>
      <div className="text-[12.5px]" style={{ color: "var(--hall-ink-3)" }}>
        {children}
      </div>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="mt-5">
      <p
        className="text-[9.5px] uppercase tracking-[0.08em] mb-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </p>
      <p
        className="text-[12.5px] whitespace-pre-wrap"
        style={{ color: "var(--hall-ink-3)", lineHeight: 1.55 }}
      >
        {body}
      </p>
    </div>
  );
}
