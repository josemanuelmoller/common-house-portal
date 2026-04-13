import { Sidebar } from "@/components/Sidebar";
import { getContentPipeline } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";
import ContentList from "@/components/ContentCard";

export default async function ContentPipelinePage() {
  await requireAdmin();

  const items = await getContentPipeline();

  const draftCount     = items.filter(i => i.status === "Draft" || i.status === "Briefed").length;
  const reviewCount    = items.filter(i => i.status === "Review").length;
  const approvedCount  = items.filter(i => i.status === "Approved" || i.status === "Ready to Publish").length;
  const publishedCount = items.filter(i => i.status === "Published").length;
  const withDraft      = items.filter(i => i.draftText).length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Control Room · Content
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Content <em className="font-black not-italic text-[#B2FF59]">Pipeline</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Posts, reports, investor updates and proposals — from brief to published.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{items.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Total</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-purple-300 tracking-tight leading-none">{withDraft}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Con draft</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-amber-400 tracking-tight leading-none">{reviewCount}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">At review</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-5xl space-y-6">

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Draft / Briefed</p>
              <p className="text-3xl font-bold text-[#131218]/40 tracking-tight">{draftCount}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">En progreso</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">At review</p>
              {reviewCount > 0
                ? <p className="text-3xl font-bold text-amber-500 tracking-tight">{reviewCount}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Needs action</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Approved</p>
              <p className="text-3xl font-bold text-blue-500 tracking-tight">{approvedCount}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Ready to send</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Published</p>
              <p className="text-3xl font-bold text-green-600 tracking-tight">{publishedCount}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Delivered</p>
            </div>
          </div>

          {/* Interactive content list with draft previews */}
          <ContentList items={items} />

        </div>
      </main>
    </div>
  );
}
