// Public status page — no auth required.
// Reads uptime.json + history.json from the `status` branch, written by the
// .github/workflows/uptime-check.yml workflow every 10 minutes.
//
// The status JSON lives on a dedicated `status` branch (not main) and is
// fetched at runtime — committing it to main would trigger a full production
// redeploy on every probe, and deploy churn made the next probe flap.
//
// Source: GitHub Actions cron (free tier, ~144 runs/day).
// Anti-flap: each probe runs twice 30s apart; a service is only marked
// "down" if both probes fail. See workflow for details.

export const metadata = {
  title: "Common House — Status",
  description: "Uptime and operational status for the Common House portal.",
};

// Re-render every 5 min so freshly committed status JSON shows up
// without a deploy.
export const revalidate = 300;

const STATUS_RAW_BASE =
  "https://raw.githubusercontent.com/josemanuelmoller/common-house-portal/status/public/status";

type ServiceStatus = "ok" | "degraded" | "down";

type UptimeSnapshot = {
  checked_at: string;
  overall: ServiceStatus;
  services: Array<{ name: string; status: ServiceStatus; codes: string[] }>;
  note?: string;
};

type HistoryEntry = { ts: string; overall: ServiceStatus };

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${STATUS_RAW_BASE}/${file}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMin = Math.round((Date.now() - then) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function statusColor(status: ServiceStatus): string {
  if (status === "ok") return "#16a34a";
  if (status === "degraded") return "#d97706";
  return "#dc2626";
}

function statusLabel(status: ServiceStatus): string {
  if (status === "ok") return "Operational";
  if (status === "degraded") return "Degraded";
  return "Down";
}

function HistoryBar({ entries }: { entries: HistoryEntry[] }) {
  // 144 cells = 24h at 10-min resolution. Pad with "unknown" at the left.
  const cells: Array<HistoryEntry | null> = Array.from({ length: 144 }, () => null);
  const recent = entries.slice(-144);
  for (let i = 0; i < recent.length; i++) {
    cells[144 - recent.length + i] = recent[i];
  }
  return (
    <div className="flex gap-[2px] items-end">
      {cells.map((c, i) => (
        <div
          key={i}
          title={c ? `${c.overall} • ${c.ts}` : "no data"}
          className="w-[3px] h-6 rounded-[1px]"
          style={{
            background: c ? statusColor(c.overall) : "#e5e5e5",
          }}
        />
      ))}
    </div>
  );
}

export default async function StatusPage() {
  const snapshot = await readJson<UptimeSnapshot>("uptime.json", {
    checked_at: new Date().toISOString(),
    overall: "ok",
    services: [],
    note: "No data yet — uptime workflow has not run.",
  });
  const history = await readJson<HistoryEntry[]>("history.json", []);

  const overallColor = statusColor(snapshot.overall);
  const overallLabel = statusLabel(snapshot.overall);

  return (
    <div
      className="min-h-screen bg-[#f4f4ef] text-[#0a0a0a]"
      style={{ fontFamily: "var(--font-hall-sans)" }}
    >
      <div className="max-w-[800px] mx-auto px-6 sm:px-10 py-16">
        <header className="mb-12">
          <div className="text-[11px] uppercase tracking-[1.5px] text-black/40 font-bold mb-3">
            Common House
          </div>
          <h1 className="text-[42px] font-light tracking-[-1.5px] leading-[1] mb-6">
            Status
          </h1>
          <div
            className="inline-flex items-center gap-3 px-4 py-2 rounded-full border"
            style={{ borderColor: overallColor, color: overallColor }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: overallColor }}
            />
            <span className="text-[13px] font-semibold">
              All systems {overallLabel.toLowerCase()}
            </span>
          </div>
          <div className="mt-3 text-[12px] text-black/40">
            Last checked {relativeTime(snapshot.checked_at)}
          </div>
        </header>

        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[1.5px] text-black/40 font-bold mb-4">
            Services
          </div>
          <div className="border border-black/8 rounded-[14px] bg-white overflow-hidden">
            {snapshot.services.map((svc, i) => (
              <div
                key={svc.name}
                className={`flex items-center justify-between px-5 py-4 ${
                  i > 0 ? "border-t border-black/6" : ""
                }`}
              >
                <div>
                  <div className="text-[14px] font-semibold">{svc.name}</div>
                  <div className="text-[11px] text-black/40 mt-0.5 font-mono">
                    HTTP {svc.codes.join(" → ")}
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 text-[12px] font-semibold"
                  style={{ color: statusColor(svc.status) }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: statusColor(svc.status) }}
                  />
                  {statusLabel(svc.status)}
                </div>
              </div>
            ))}
            {snapshot.services.length === 0 && (
              <div className="px-5 py-6 text-[13px] text-black/40">
                No services reporting yet.
              </div>
            )}
          </div>
        </section>

        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[1.5px] text-black/40 font-bold mb-4">
            Last 24 hours
          </div>
          <div className="border border-black/8 rounded-[14px] bg-white p-5">
            <HistoryBar entries={history} />
            <div className="flex justify-between text-[11px] text-black/40 mt-3">
              <span>24h ago</span>
              <span>now</span>
            </div>
          </div>
        </section>

        <footer className="text-[11px] text-black/40 leading-relaxed">
          {snapshot.note ?? null}
          <div className="mt-2">
            Probed by GitHub Actions every 10 minutes. Source code:
            {" "}
            <code className="font-mono">.github/workflows/uptime-check.yml</code>
          </div>
          <div className="mt-2">
            Report an incident:{" "}
            <a
              href="mailto:security@wearecommonhouse.com"
              className="underline hover:text-black/70"
            >
              security@wearecommonhouse.com
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
