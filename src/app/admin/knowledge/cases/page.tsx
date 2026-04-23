import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type CaseRow = {
  code: string;
  title: string;
  project_name: string | null;
  geography: string | null;
  year: number | null;
  facet_key: string | null;
  evidence_count: number;
  first_seen: string | null;
  last_seen: string | null;
};

export default async function CasesListPage() {
  await requireAdmin();

  const sb = getSupabaseServerClient();
  const { data } = await sb.from("knowledge_cases")
    .select("*")
    .order("last_seen", { ascending: false, nullsFirst: false });
  const cases = (data as CaseRow[] | null) ?? [];

  // Stats
  const countries = new Set(cases.map(c => c.geography).filter((x): x is string => Boolean(x)));
  const projects  = new Set(cases.map(c => c.project_name).filter((x): x is string => Boolean(x)));
  const totalBullets = cases.reduce((n, c) => n + c.evidence_count, 0);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />
      <main className="flex-1 ml-[228px] overflow-auto">
        <div className="bg-[#131218] px-10 py-10">
          <Link href="/admin/knowledge" className="text-[10px] text-white/30 font-bold uppercase tracking-widest hover:text-[#c8f55a] transition-colors">
            ← Knowledge tree
          </Link>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px] mt-3">
            Project <em className="font-[900] italic text-[#c8f55a]">cases</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[560px] leading-[1.65]">
            Cada case (SUFI-AR-2026, AUTOMERCADO-CR-2026, …) agrupa todo lo que se sabe sobre un piloto concreto, independiente de qué leaf del árbol lo use. Click para ver el perfil completo.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Cases"         value={cases.length}   color="green" />
            <MetricCard label="Countries"     value={countries.size} />
            <MetricCard label="Projects"      value={projects.size}  />
            <MetricCard label="Total bullets" value={totalBullets}   />
          </div>

          <div className="bg-white rounded-[14px] border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">All cases</h2>
              <p className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest">{cases.length} total</p>
            </div>
            {cases.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-[#131218]/30">
                No cases tracked yet. Run <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">/api/backfill-case-codes</code> to populate.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#EFEFEA]">
                    <th className="text-left px-6 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Case code</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Geo</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Year</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Bullets</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEA]">
                  {cases.map(c => (
                    <tr key={c.code} className="hover:bg-[#EFEFEA]/40 transition-colors">
                      <td className="px-6 py-3">
                        <Link href={`/admin/knowledge/cases/${encodeURIComponent(c.code)}`}
                              className="text-sm font-mono font-semibold text-[#131218] hover:underline">
                          {c.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#131218]/70">{c.project_name ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-[10px] font-bold font-mono text-[#131218]/50">{c.geography ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-xs font-medium text-[#131218]/50">{c.year ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-[#131218]">{c.evidence_count}</td>
                      <td className="px-4 py-3 text-right text-[10px] text-[#131218]/40">
                        {c.last_seen ? new Date(c.last_seen).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
