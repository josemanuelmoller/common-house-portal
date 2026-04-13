import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { InsightsTabs } from "./InsightsTabs";

export default async function InsightsPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">
        {/* InsightsTabs renders its own header + tab bar + content */}
        <InsightsTabs />
      </main>
    </div>
  );
}
