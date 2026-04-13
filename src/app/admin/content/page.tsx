import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getContentPipeline } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

const STATUS_COLORS: Record<string, { pill: string; dot: string }> = {
  "Draft":           { pill: "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]", dot: "bg-[#131218]/20" },
  "Review":          { pill: "bg-amber-50 text-amber-700 border border-amber-200",      dot: "bg-amber-400"    },
  "Approved":        { pill: "bg-blue-50 text-blue-700 border border-blue-200",         dot: "bg-blue-500"     },
  "Ready to Publish":{ pill: "bg-green-50 text-green-700 border border-green-200",      dot: "bg-green-500"    },
  "Published":       { pill: "bg-[#B2FF59]/30 text-green-800 border border-[#B2FF59]",  dot: "bg-[#B2FF59]"   },
  "Archived":        { pill: "bg-gray-50 text-gray-400 border border-gray-200",         dot: "bg-gray-300"     },
};

function statusStyle(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS["Draft"];
}

export default async function ContentPipelinePage() {
  await requireAdmin();

  const items = await getContentPipeline();

  const draftCount     = items.filter(i => i.status === "Draft").length;
  const reviewCount    = items.filter(i => i.status === "Review").length;
  const approvedCount  = items.filter(i => i.status === "Approved" || i.status === "Ready to Publish").length;
  const publishedCount = items.filter(i => i.status === "Published").length;

  // Group by status for display order
  const ORDER = ["Review", "Approved", "Ready to Publish", "Draft", "Published", "Archived"];
  const sorted = [...items].sort((a, b) => {
    const ai = ORDER.indexOf(a.status);
    const bi = ORDER.indexOf(b.status);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

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
                Posts, reports, investor updates and proposals — from draft to published.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{items.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Total</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-amber-400 tracking-tight leading-none">{reviewCount}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">At review</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-6xl space-y-6">

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Draft</p>
              <p className="text-3xl font-bold text-[#131218]/40 tracking-tight">{draftCount}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">In progress</p>
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

          {/* Content list */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">All items</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              <p className="text-[9px] font-bold text-[#131218]/25">{items.length}</p>
            </div>

            {sorted.length > 0 ? (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[3fr_1fr_1fr_1fr_100px] px-5 py-2.5 border-b border-[#EFEFEA]">
                  {["Title", "Type", "Channel", "Project", "Status"].map(h => (
                    <p key={h} className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">{h}</p>
                  ))}
                </div>

                <div className="divide-y divide-[#EFEFEA]">
                  {sorted.map(item => {
                    const style = statusStyle(item.status);
                    return (
                      <a
                        key={item.id}
                        href={item.notionUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid grid-cols-[3fr_1fr_1fr_1fr_100px] px-5 py-3 hover:bg-[#EFEFEA]/50 transition-colors group items-center"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                          <p className="text-[12px] font-semibold text-[#131218] truncate">{item.title}</p>
                        </div>
                        <p className="text-[10px] text-[#131218]/40 font-medium truncate">
                          {item.contentType || "—"}
                        </p>
                        <p className="text-[10px] text-[#131218]/40 font-medium truncate">
                          {item.channel || "—"}
                        </p>
                        <p className="text-[10px] text-[#131218]/40 font-medium truncate">
                          {item.projectName || "—"}
                        </p>
                        <div>
                          <span className={`inline-block text-[8px] font-bold px-2 py-0.5 rounded-full border ${style.pill}`}>
                            {item.status || "—"}
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>

                <div className="px-5 py-2.5 border-t border-[#EFEFEA]">
                  <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                    {reviewCount > 0 && ` · ${reviewCount} need review`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] p-12 text-center">
                <p className="text-sm font-bold text-[#131218]/25 mb-2">Content pipeline is empty</p>
                <p className="text-xs text-[#131218]/20">
                  Items appear here when agent skills write to the Content Pipeline DB in Notion.
                </p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
