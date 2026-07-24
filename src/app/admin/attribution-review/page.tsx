import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV as NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function AttributionReviewPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />
      <main className="flex-1 overflow-auto md:ml-[228px]" style={{ fontFamily: "var(--font-hall-sans)" }}>
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              COMMON HOUSE · <b style={{ color: "var(--hall-ink-0)" }}>ATTRIBUTION</b>
            </span>
            <h1 className="text-[16px] font-medium tracking-[-0.01em]" style={{ color: "var(--hall-ink-0)" }}>
              Review{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                proposals
              </em>
              .
            </h1>
          </div>
        </header>
        <p className="px-9 py-4 text-[11.5px] max-w-[680px] leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>
          Medium-confidence guesses from the classifier — the ones it wouldn&apos;t auto-apply. Approve to accept, adjust
          to pick a different project, or reject. High-confidence attributions were applied automatically.
        </p>
        <ReviewClient />
      </main>
    </div>
  );
}
