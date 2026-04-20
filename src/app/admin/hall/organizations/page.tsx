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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Hall · Intelligence</p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                <em className="font-black italic text-[#c8f55a]">Organizations</em>
              </h1>
              <p className="text-sm text-white/40 mt-3 max-w-2xl">
                Orgs discovered from your calendar / email / meeting activity. Registered orgs carry a relationship class that cascades to every contact at that domain and powers STB / inbox / daily briefing.
              </p>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Registered" value={active.length} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Proposed"   value={proposed.length} color={proposed.length > 0 ? "text-amber-400" : "text-white/30"} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Clients"    value={totalClients} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Partners"   value={totalPartners} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Investors"  value={totalInvestors} color="text-[#c8f55a]" />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Portfolio"  value={totalPortfolio} />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-8">

          {/* Explainer */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-3.5">
            <p className="text-[11px] text-[#131218]/60 leading-snug">
              <strong className="text-[#131218]">How it works.</strong>{" "}
              Orgs auto-register the first time you tag a contact. You can also register from the <em>Proposed</em> queue below — any domain with 3+ contacts you have interacted with. Tag cascade is optional (every contact at the domain receives the class); Notion sync creates/links a page in CH Organizations [OS v2] for knowledge-layer use.
            </p>
          </div>

          {/* Proposed */}
          {proposed.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">Proposed — register to classify</h2>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{proposed.length}</span>
              </div>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
                {proposed.map(p => <ProposedRow key={p.domain} org={p} />)}
              </div>
            </section>
          )}

          {/* Registered by class */}
          {([...CLASS_ORDER, "Unclassified"] as (Cls | "Unclassified")[]).map(cls => {
            const rows = groups.get(cls) ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={cls}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#131218]/60">
                    {cls === "Unclassified" ? "Unclassified" : cls}
                  </h2>
                  <div className="flex-1 h-px bg-[#E0E0D8]" />
                  <span className="text-[10px] font-semibold text-[#131218]/30">{rows.length}</span>
                </div>
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
                  {rows.map(o => <OrgRow key={o.domain} org={o} />)}
                </div>
              </section>
            );
          })}

          {/* Dismissed */}
          {dismissed.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/40">Dismissed</h2>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <span className="text-[10px] font-semibold text-[#131218]/30">{dismissed.length}</span>
              </div>
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA] opacity-60">
                {dismissed.map(o => <OrgRow key={o.domain} org={o} />)}
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-right">
      <p className={`text-[2rem] font-black tracking-tight leading-none ${color}`}>{value}</p>
      <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">{label}</p>
    </div>
  );
}

function ProposedRow({ org }: { org: ProposedOrganization }) {
  const touches = org.meeting_sum + org.email_sum + org.transcript_sum;
  return (
    <div className="flex items-start gap-4 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-[#131218] truncate">{org.domain}</p>
        <p className="text-[10px] text-[#131218]/50 mt-0.5">
          <strong>{org.contact_count}</strong> contact{org.contact_count === 1 ? "" : "s"}
          {" · "}{touches} touches
          {org.vip_contact_count > 0 && <> · <strong className="text-green-700">{org.vip_contact_count} VIP</strong></>}
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
  );
}

function OrgRow({ org }: { org: OrganizationListEntry }) {
  const touches = org.meeting_sum + org.email_sum + org.transcript_sum;
  return (
    <div className="flex items-start gap-4 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/admin/hall/organizations/${encodeURIComponent(org.domain)}`}
            className="text-[12px] font-bold text-[#131218] truncate hover:underline decoration-[#131218]/30 underline-offset-2"
          >
            {org.name}
          </Link>
          <span className="text-[10px] text-[#131218]/35">{org.domain}</span>
          {org.relationship_classes.map(c => (
            <span
              key={c}
              className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                c === "VIP" ? "bg-[#B2FF59]/40 text-green-900" : "bg-[#131218] text-white"
              }`}
            >
              {c.toUpperCase()}
            </span>
          ))}
          {org.notion_id && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#131218]/6 text-[#131218]/60" title="Linked to CH Organizations [OS v2]">
              ✓ NOTION
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#131218]/50 mt-0.5">
          <strong>{org.contact_count}</strong> contact{org.contact_count === 1 ? "" : "s"}
          {" · "}{touches} touches
          {org.vip_contact_count > 0 && <> · <strong className="text-green-700">{org.vip_contact_count} VIP</strong></>}
          {" · "}last {timeAgo(org.last_interaction_at)}
        </p>
        {org.dismissed_reason && (
          <p className="text-[9px] text-[#131218]/40 italic mt-1">Dismissed: {org.dismissed_reason}</p>
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
  );
}
