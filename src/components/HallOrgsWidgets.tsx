import Link from "next/link";
import { getOrganizationsList, type OrganizationListEntry } from "@/lib/contacts";

/**
 * Two server components Jose can drop into the Hall:
 *   - HallOrgsColdRelations: Clients / Partners / Investors idle >30 days.
 *   - HallOrgsClassMix: snapshot of how the registered network is composed.
 * Both are server-rendered (no client hydration) and rely on
 * getOrganizationsList() which is already cached at the request level.
 */

const COLD_THRESHOLD_DAYS = 30;
const COLD_FOCUS_CLASSES  = new Set(["Client", "Partner", "Investor", "Funder", "Portfolio"]);

function daysAgo(iso: string | null): number {
  if (!iso) return 99999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

async function loadActive(): Promise<OrganizationListEntry[]> {
  const all = await getOrganizationsList();
  return all.filter(o => !o.dismissed_at);
}

// ─── Cold relations ─────────────────────────────────────────────────────────

export async function HallOrgsColdRelations() {
  const all = await loadActive();
  const cold = all
    .filter(o => o.relationship_classes.some(c => COLD_FOCUS_CLASSES.has(c)))
    .filter(o => daysAgo(o.last_interaction_at) >= COLD_THRESHOLD_DAYS)
    .sort((a, b) => daysAgo(b.last_interaction_at) - daysAgo(a.last_interaction_at))
    .slice(0, 8);

  // U1 — if network is warm, don't render an empty widget.
  if (cold.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Cold orgs</span>
          <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
            {cold.length}
          </span>
        </div>
        <Link href="/admin/hall/organizations" className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80">
          All orgs →
        </Link>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {cold.map(o => (
          <Link
            key={o.domain}
            href={`/admin/hall/organizations/${encodeURIComponent(o.domain)}`}
            className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-[#131218] truncate">{o.name}</p>
              <p className="text-[9px] text-[#131218]/45 mt-0.5">
                {o.relationship_classes.slice(0, 2).join(" · ")}
                {" · "}{o.contact_count} contact{o.contact_count === 1 ? "" : "s"}
              </p>
            </div>
            <span className={`text-[10px] font-bold shrink-0 ${daysAgo(o.last_interaction_at) >= 60 ? "text-red-600" : "text-amber-700"}`}>
              {daysAgo(o.last_interaction_at)}d
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Class mix ──────────────────────────────────────────────────────────────

const MIX_CLASSES = ["Client", "Partner", "Portfolio", "Investor", "Funder", "Team", "VIP"] as const;
const MIX_COLOR: Record<typeof MIX_CLASSES[number], string> = {
  Client:    "bg-[#c8f55a]",
  Partner:   "bg-[#7dd3fc]",
  Portfolio: "bg-[#fbbf24]",
  Investor:  "bg-[#a78bfa]",
  Funder:    "bg-[#f472b6]",
  Team:      "bg-[#131218]",
  VIP:       "bg-[#B2FF59]",
};

export async function HallOrgsClassMix() {
  const all = await loadActive();
  const counts: Record<string, number> = {};
  for (const o of all) {
    for (const c of o.relationship_classes) counts[c] = (counts[c] ?? 0) + 1;
  }
  const total = all.length;
  const row = MIX_CLASSES.map(c => ({ label: c, count: counts[c] ?? 0 }));

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Network mix</span>
        <span className="text-[9px] font-semibold text-[#131218]/30">{total} orgs</span>
      </div>
      <div className="px-5 py-4">
        {total === 0 ? (
          <div className="text-center">
            <p className="text-[11px] text-[#131218]/35 mb-2">No organisations registered yet.</p>
            <Link href="/admin/hall/organizations" className="text-[10px] font-bold tracking-wide uppercase text-[#131218] bg-[#c8f55a] hover:bg-[#b2ea3f] px-3 py-1.5 rounded-md transition-colors inline-block">
              Add first organization →
            </Link>
          </div>
        ) : (
          <>
            {/* L2 — Stacked bar taller + ring so it's clearly visible (K1 learnings) */}
            <div className="flex w-full h-3 rounded-full overflow-hidden bg-[#E0E0D8] ring-1 ring-[#E0E0D8] mb-3">
              {row.filter(r => r.count > 0).map(r => (
                <div
                  key={r.label}
                  className={`h-full ${MIX_COLOR[r.label as typeof MIX_CLASSES[number]]}`}
                  style={{ width: `${(r.count / total) * 100}%`, minWidth: "2px" }}
                  title={`${r.label}: ${r.count} (${((r.count / total) * 100).toFixed(0)}%)`}
                />
              ))}
            </div>
            {/* L1 — Legend entries are now links to filtered Organizations view */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {row.map(r => (
                <Link
                  key={r.label}
                  href={`/admin/hall/organizations?class=${encodeURIComponent(r.label)}`}
                  className="flex items-center gap-2 text-[10px] text-[#131218]/70 hover:text-[#131218] transition-colors group"
                >
                  <span className={`w-2 h-2 rounded-full ${MIX_COLOR[r.label as typeof MIX_CLASSES[number]]}`} />
                  <span className="font-semibold group-hover:underline decoration-dotted underline-offset-2">{r.label}</span>
                  <span className="ml-auto tabular-nums text-[#131218]/50">{r.count}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
