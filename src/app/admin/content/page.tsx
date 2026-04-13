import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";

export default async function ContentPage() {
  await requireAdmin();
  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-60">
        <div className="border-b border-[#E0E0D8] bg-white px-8 py-6">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-1">Control Room</p>
          <h1 className="text-2xl font-bold text-[#131218] tracking-tight">Content Pipeline</h1>
        </div>
        <div className="px-8 py-8 max-w-5xl">
          <div className="bg-white rounded-2xl border border-[#E0E0D8] p-10 text-center">
            <p className="text-sm text-[#131218]/40">Coming soon — data will appear here once connected.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
