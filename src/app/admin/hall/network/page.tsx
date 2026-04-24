import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { NetworkGraph } from "@/components/NetworkGraph";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />
      <main
        className="flex-1 md:ml-60 overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)" }}
      >
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              HALL · <b style={{ color: "var(--hall-ink-0)" }}>NETWORK</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Relationship{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                map
              </em>
              .
            </h1>
          </div>
          <span
            className="text-[10px] font-bold tracking-[0.14em] uppercase whitespace-nowrap"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            CO-ATTENDANCE · 180D
          </span>
        </header>

        <div className="px-9 py-6">
          <p
            className="text-[11.5px] mb-5 max-w-2xl leading-relaxed"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Contacts grouped by relationship class. Edges connect people who shared ≥ 2 meetings in the last 180 days. Hover any bubble to isolate its immediate network.
          </p>
          <NetworkGraph />
        </div>
      </main>
    </div>
  );
}
