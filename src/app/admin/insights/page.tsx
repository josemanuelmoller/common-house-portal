import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { InsightsTabs } from "./InsightsTabs";

export default async function InsightsPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />
      <main
        className="flex-1 ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* InsightsTabs renders its own header + tab bar + content */}
        <InsightsTabs />
      </main>
    </div>
  );
}
