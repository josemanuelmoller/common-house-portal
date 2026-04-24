import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getOrganizationsList,
  getProposedOrganizations,
  type OrganizationListEntry,
  type ProposedOrganization,
} from "@/lib/contacts";
import { HallOrganizationTagEditor } from "@/components/HallOrganizationTagEditor";

export const dynamic = "force-dynamic";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

const CLASS_ORDER = ["VIP", "Client", "Partner", "Portfolio", "Investor", "Funder", "Team", "Vendor", "External"] as const;
type Cls = typeof CLASS_ORDER[number];

function primaryClass(o: OrganizationListEntry): Cls | null {
  for (const c of CLASS_ORDER) if (o.relationship_classes.includes(c)) return c;
  return null;
}

export default async function HallOrganizationsPage() {
  await requireAdmin();
  const [registered, proposed] = await Promise.all([
    getOrganizationsList(),
    getProposedOrganizations(3),
  ]);

  const active    = registered.filter(o => !o.dismissed_at);
  const dismissed = registered.filter(o =>  o.dismissed_at);

  // Group active by primary class
  const groups = new Map<Cls | "Unclassified", OrganizationListEntry[]>();
  for (const c of CLASS_ORDER) groups.set(c, []);
  groups.set("Unclassified", []);
  for (const o of active) {
    const key = primaryClass(o) ?? "Unclassified";
    groups.get(key)!.push(o);
  }

  const totalClients   = groups.get("Client")!.length;
  const totalPartners  = groups.get("Partner")!.length;
  const totalInvestors = groups.get("Investor")!.length + groups.get("Funder")!.length;
  const totalPortfolio = groups.get("Portfolio")!.length;

  return (
    <div className="flex min-h-screen">
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* ── K-v2 one-line header ─────────────────────────────────────── */}
        <header
          className="flex items-center justify-between gap-3 sm:gap-6 px-4 sm:px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-3 sm:gap-4 min-w-0 flex-1">
            <span
              className="hidden sm:inline text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              HALL · <b style={{ color: "var(--hall-ink-0)" }}>INTELLIGENCE</b>
            </span>
            <h1
              className="text-[15px] sm:text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                Organizations
              </em>
            </h1>
          </div>
          {/* Compact 2-stat summary on mobile; full stats row on desktop */}
          <div className="sm:hidden text-[10px] whitespace-nowrap" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
            <b style={{ color: "var(--hall-ink-0)" }}>{active.length}</b>{proposed.length > 0 && <> · <b style={{ color: "var(--hall-warn)" }}>{proposed.length}</b></>}
          </div>
          <div className="hidden sm:flex items-center gap-5">
            <Stat label="Registered" value={active.length} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Proposed"   value={proposed.length} tone={proposed.length > 0 ? "warn" : "muted"} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Clients"    value={totalClients} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Partners"   value={totalPartners} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Investors"  value={totalInvestors} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Portfolio"  value={totalPortfolio} />
          </div>
        </header>

        <div className="px-4 sm:px-9 py-5 sm:py-7 max-w-5xl space-y-7">

          {/* Explainer */}
          <p className="text-[11px] leading-snug" style={{ color: "var(--hall-muted-2)" }}>
            <strong style={{ color: "var(--hall-ink-0)" }}>How it works.</strong>{" "}
            Orgs auto-register the first time you tag a contact. You can also register from the <em>Proposed</em> queue below — any domain with 3+ contacts you have interacted with. Tag cascade is optional (every contact at the domain receives the class); Notion sync creates/links a page in CH Organizations [OS v2] for knowledge-layer use.
          </p>

          {/* Proposed */}
          {proposed.length > 0 && (
            <section className="mb-7">
              <SectionHead title="Proposed" flourish="register to classify" meta={`${proposed.length} TOTAL`} />
              <ul className="flex flex-col">
                {proposed.map(p => <ProposedRow key={p.domain} org={p} />)}
              </ul>
            </section>
          )}

          {/* Registered by class */}
          {([...CLASS_ORDER, "Unclassified"] as (Cls | "Unclassified")[]).map(cls => {
            const rows = groups.get(cls) ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={cls} className="mb-7">
                <SectionHead title={cls === "Unclassified" ? "Unclassified" : cls} meta={`${rows.length} TOTAL`} />
                <ul className="flex flex-col">
                  {rows.map(o => <OrgRow key={o.domain} org={o} />)}
                </ul>
              </section>
            );
          })}

          {/* Dismissed */}
          {dismissed.length > 0 && (
            <section className="mb-7" style={{ opacity: 0.6 }}>
              <SectionHead title="Dismissed" meta={`${dismissed.length} TOTAL`} />
              <ul className="flex flex-col">
                {dismissed.map(o => <OrgRow key={o.domain} org={o} />)}
              </ul>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" | "muted" }) {
  const color =
    tone === "warn"  ? "var(--hall-warn)" :
    tone === "muted" ? "var(--hall-muted-3)" :
    "var(--hall-ink-0)";
  return (
    <div className="text-right">
      <p
        className="text-[20px] font-bold leading-none"
        style={{ letterSpacing: "-0.02em", color }}
      >
        {value}
      </p>
      <p
        className="text-[9px] tracking-[0.08em] uppercase mt-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </p>
    </div>
  );
}

function SectionHead({ title, flourish, meta }: { title: string; flourish?: string; meta?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
    >
      <h2
        className="text-[19px] font-bold leading-none"
        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
      >
        {title}
        {flourish && (
          <>
            {" "}
            <em
              style={{
                fontFamily: "var(--font-hall-display)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--hall-ink-0)",
              }}
            >
              {flourish}
            </em>
          </>
        )}
      </h2>
      {meta && (
        <span
          className="text-[10px] tracking-[0.06em] whitespace-nowrap"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

function ProposedRow({ org }: { org: ProposedOrganization }) {
  const touches = org.meeting_sum + org.email_sum + org.transcript_sum;
  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 py-3 transition-colors hover:bg-[var(--hall-fill-soft)] px-1">
        <div className="flex-1 min-w-0">
          <p
            className="text-[12.5px] font-semibold truncate"
            style={{ color: "var(--hall-ink-0)" }}
          >
            {org.domain}
          </p>
          <p
            className="text-[10.5px] mt-0.5"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            <strong style={{ color: "var(--hall-ink-0)" }}>{org.contact_count}</strong> contact{org.contact_count === 1 ? "" : "s"}
            {" · "}{touches} touches
            {org.vip_contact_count > 0 && <> · <strong style={{ color: "var(--hall-ok)" }}>{org.vip_contact_count} VIP</strong></>}
            {" · "}last {timeAgo(org.last_interaction_at)}
            {org.sample_names.length > 0 && ` · ${org.sample_names.join(", ")}`}
          </p>
        </div>
        <HallOrganizationTagEditor
          domain={org.domain}
          currentClasses={[]}
          currentName={null}
          notion_id={null}
          contactCount={org.contact_count}
          compact
        />
      </div>
    </li>
  );
}

function OrgRow({ org }: { org: OrganizationListEntry }) {
  const touches = org.meeting_sum + org.email_sum + org.transcript_sum;
  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 py-3 transition-colors hover:bg-[var(--hall-fill-soft)] px-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/admin/hall/organizations/${encodeURIComponent(org.domain)}`}
              className="text-[12.5px] font-semibold truncate hover:underline underline-offset-2"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {org.name}
            </Link>
            <span
              className="text-[10px]"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
            >
              {org.domain}
            </span>
            {org.relationship_classes.map(c => (
              <span
                key={c}
                className="text-[9px] px-1.5 py-0.5 uppercase"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  background: "var(--hall-ink-0)",
                  color: "var(--hall-paper-0)",
                }}
              >
                {c.toUpperCase()}
              </span>
            ))}
            {org.notion_id && (
              <span
                className="text-[9px] px-1.5 py-0.5 uppercase"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  border: "1px solid var(--hall-line)",
                  color: "var(--hall-muted-2)",
                }}
                title="Linked to CH Organizations [OS v2]"
              >
                ✓ NOTION
              </span>
            )}
          </div>
          <p
            className="text-[10.5px] mt-0.5"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            <strong style={{ color: "var(--hall-ink-0)" }}>{org.contact_count}</strong> contact{org.contact_count === 1 ? "" : "s"}
            {" · "}{touches} touches
            {org.vip_contact_count > 0 && <> · <strong style={{ color: "var(--hall-ok)" }}>{org.vip_contact_count} VIP</strong></>}
            {" · "}last {timeAgo(org.last_interaction_at)}
          </p>
          {org.dismissed_reason && (
            <p className="text-[9px] italic mt-1" style={{ color: "var(--hall-muted-3)" }}>Dismissed: {org.dismissed_reason}</p>
          )}
        </div>
        <HallOrganizationTagEditor
          domain={org.domain}
          currentClasses={org.relationship_classes}
          currentName={org.name}
          notion_id={org.notion_id}
          contactCount={org.contact_count}
          dismissed={!!org.dismissed_at}
        />
      </div>
    </li>
  );
}
