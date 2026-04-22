import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { LinkedInReviewBoard } from "@/components/LinkedInReviewBoard";

export const dynamic = "force-dynamic";

type Row = {
  id:                    string;
  email:                 string | null;
  full_name:             string | null;
  display_name:          string | null;
  linkedin:              string | null;
  linkedin_confidence:   number | null;
  linkedin_source:       string | null;
  linkedin_enriched_at:  string | null;
  relationship_classes:  string[] | null;
  meeting_count:         number | null;
};

async function getQueueCounts() {
  const sb = getSupabaseServerClient();
  const [reviewRes, queueRes, enrichedRes] = await Promise.all([
    sb.from("people").select("id", { count: "exact", head: true })
      .eq("linkedin_needs_review", true),
    sb.from("people").select("id", { count: "exact", head: true })
      .is("linkedin", null).not("email", "is", null).is("dismissed_at", null),
    sb.from("people").select("id", { count: "exact", head: true })
      .not("linkedin", "is", null),
  ]);
  return {
    needs_review: reviewRes.count ?? 0,
    queued:       queueRes.count ?? 0,
    enriched:     enrichedRes.count ?? 0,
  };
}

async function getReviewRows(): Promise<Row[]> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("people")
    .select("id, email, full_name, display_name, linkedin, linkedin_confidence, linkedin_source, linkedin_enriched_at, relationship_classes, meeting_count")
    .eq("linkedin_needs_review", true)
    .order("linkedin_confidence", { ascending: false })
    .limit(200);
  return (data ?? []) as Row[];
}

export default async function LinkedInReviewPage() {
  await requireAdmin();
  const [counts, rows] = await Promise.all([getQueueCounts(), getReviewRows()]);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Hall · Enrichment
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                <em className="font-black italic text-[#c8f55a]">LinkedIn</em> enrichment
              </h1>
              <p className="text-sm text-white/40 mt-3 max-w-2xl">
                The agent searches Google Custom Search for each contact&apos;s LinkedIn profile and asks Claude Haiku to confirm the match.
                Matches with confidence ≥0.8 are applied automatically. Anything lower lands here for one-click approval.
              </p>
            </div>
            <div className="flex items-center gap-5 pb-1">
              <Stat label="Queued" value={counts.queued} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="To review" value={counts.needs_review} color={counts.needs_review > 0 ? "text-amber-400" : "text-white/30"} />
              <div className="w-px h-10 bg-white/10" />
              <Stat label="Enriched" value={counts.enriched} color="text-[#c8f55a]" />
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-6">
          <LinkedInReviewBoard rows={rows} />
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
