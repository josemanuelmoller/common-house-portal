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
    <ul className="flex flex-col">
      {cold.map(o => {
        const days = daysAgo(o.last_interaction_at);
        const ageColor = days >= 60 ? "var(--hall-danger)" : "var(--hall-warn)";
        return (
          <li key={o.domain} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
            <Link
              href={`/admin/hall/organizations/${encodeURIComponent(o.domain)}`}
              className="flex items-center gap-3 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <span
                  className="block text-[12px] font-semibold truncate"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {o.name}
                </span>
                <span
                  className="block text-[10.5px] mt-0.5"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  {o.relationship_classes.slice(0, 2).join(" · ")}
                  {" · "}{o.contact_count} contact{o.contact_count === 1 ? "" : "s"}
                </span>
              </div>
              <span
                className="font-semibold shrink-0"
                style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: ageColor }}
              >
                {days}d
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Class mix ──────────────────────────────────────────────────────────────

const MIX_CLASSES = ["Client", "Partner", "Portfolio", "Investor", "Funder", "Team", "VIP"] as const;
const MIX_COLOR: Record<typeof MIX_CLASSES[number], string> = {
  Client:    "bg-[#c6f24a]",
  Partner:   "bg-[#7dd3fc]",
  Portfolio: "bg-[#fbbf24]",
  Investor:  "bg-[#a78bfa]",
  Funder:    "bg-[#f472b6]",
  Team:      "bg-[#0a0a0a]",
  VIP:       "bg-[#c6f24a]",
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
    <div>
      <div
        className="flex items-center justify-between mb-2 text-[10px]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        <span>NETWORK MIX</span>
        <span style={{ color: "var(--hall-ink-0)", fontWeight: 600 }}>{total} ORGS</span>
      </div>
      {total === 0 ? (
        <div>
          <p className="text-[11px] mb-2" style={{ color: "var(--hall-muted-3)" }}>
            No organisations registered yet.
          </p>
          <Link
            href="/admin/hall/organizations"
            className="hall-btn-primary inline-flex"
            style={{ padding: "6px 12px", fontSize: 11 }}
          >
            Add first organization →
          </Link>
        </div>
      ) : (
        <>
          <div
            className="flex w-full h-2 rounded-full overflow-hidden mb-3"
            style={{ background: "var(--hall-paper-3)" }}
          >
            {row.filter(r => r.count > 0).map(r => (
              <div
                key={r.label}
                className={`h-full ${MIX_COLOR[r.label as typeof MIX_CLASSES[number]]}`}
                style={{ width: `${(r.count / total) * 100}%`, minWidth: "2px" }}
                title={`${r.label}: ${r.count} (${((r.count / total) * 100).toFixed(0)}%)`}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {row.map(r => (
              <Link
                key={r.label}
                href={`/admin/hall/organizations?class=${encodeURIComponent(r.label)}`}
                className="flex items-center gap-2 text-[11px] group"
                style={{ color: "var(--hall-ink-3)" }}
              >
                <span
                  className={`${MIX_COLOR[r.label as typeof MIX_CLASSES[number]]}`}
                  style={{ width: 8, height: 8, borderRadius: "50%" }}
                />
                <span className="font-semibold group-hover:underline decoration-dotted underline-offset-2">{r.label}</span>
                <span
                  className="ml-auto tabular-nums"
                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}
                >
                  {r.count}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
