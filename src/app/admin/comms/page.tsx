import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { getContentPipeline } from "@/lib/notion";
import DeskRequestForm from "@/components/DeskRequestForm";

const COMMS_TYPES = ["Post", "Newsletter", "Artículo", "Founder voice", "CH Institucional"];
const COMMS_CHANNELS = ["LinkedIn CH", "Newsletter", "X / Twitter", "Founder personal"];

const STATUS_DOT: Record<string, string> = {
  "Draft":            "bg-[#131218]/20",
  "Review":           "bg-amber-400",
  "Approved":         "bg-blue-500",
  "Ready to Publish": "bg-blue-500",
  "Published":        "bg-[#B2FF59]",
  "Archived":         "bg-gray-300",
};

const STATUS_PILL: Record<string, string> = {
  "Draft":            "bg-[#EFEFEA] text-[#131218]/50",
  "Review":           "bg-amber-50 text-amber-800",
  "Approved":         "bg-blue-50 text-blue-700",
  "Ready to Publish": "bg-blue-50 text-blue-700",
  "Published":        "bg-green-50 text-green-700",
  "Archived":         "bg-gray-50 text-gray-500",
};

export default async function CommsPage() {
  await requireAdmin();

  const allContent = await getContentPipeline();

  // Filter to comms-relevant types
  const commsTypes = new Set(["Post", "Newsletter", "Artículo", "Article", "LinkedIn Post", "Newsletter Block", "Instagram Caption", "Article Outline"]);
  const queue = allContent.filter(item =>
    commsTypes.has(item.contentType) ||
    (item.contentType && item.contentType.toLowerCase().includes("post")) ||
    (item.contentType && item.contentType.toLowerCase().includes("newsletter")) ||
    (item.contentType && item.contentType.toLowerCase().includes("article")) ||
    (item.contentType && item.contentType.toLowerCase().includes("caption")) ||
    (item.contentType && item.contentType.toLowerCase().includes("linkedin"))
  ).slice(0, 8);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">

        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Desks · Contenido escrito</p>
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
            Comms <em className="font-black not-italic text-[#B2FF59]">Desk</em>
          </h1>
          <p className="text-sm text-white/40 mt-3 leading-relaxed">
            Posts, newsletters, artículos y voz de fundador. Canal por canal, tono por tono.
          </p>
        </header>

        <div className="px-12 py-9">
          <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-start">

            {/* Request form — client component */}
            <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E0E0D8]">
                <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/30 mb-1">Nueva solicitud</p>
                <p className="text-sm font-bold text-[#131218]">Comms Desk</p>
              </div>
              <DeskRequestForm
                deskType="comms"
                contentTypes={COMMS_TYPES}
                channelOrProjectOptions={COMMS_CHANNELS}
                channelOrProjectLabel="Canal"
              />
            </div>

            {/* Live queue from Content Pipeline */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30">Cola de contenido</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{queue.length} items</p>
              </div>
              {queue.length > 0 ? queue.map(item => (
                <a
                  key={item.id}
                  href={item.notionUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white border border-[#E0E0D8] rounded-xl px-4 py-3.5 flex items-start gap-3 hover:border-[#131218]/25 transition-all"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${STATUS_DOT[item.status] ?? "bg-[#131218]/20"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-bold text-[#131218] tracking-tight line-clamp-2">{item.title}</p>
                    <p className="text-[10px] text-[#131218]/40 mt-0.5">
                      {item.contentType || "—"}
                      {item.channel ? ` · Canal: ${item.channel}` : ""}
                    </p>
                  </div>
                  <span className={`text-[8.5px] font-bold tracking-[0.5px] px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0 ${STATUS_PILL[item.status] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>
                    {item.status || "Draft"}
                  </span>
                </a>
              )) : (
                <div className="bg-white border border-[#E0E0D8] rounded-xl px-4 py-8 text-center">
                  <p className="text-[11px] text-[#131218]/25">No hay items de comms en el pipeline aún.</p>
                  <p className="text-[10px] text-[#131218]/20 mt-1">Las solicitudes enviadas aparecerán aquí.</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
