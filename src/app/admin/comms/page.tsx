import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { getContentPipeline, getStyleProfiles } from "@/lib/notion";
import DeskRequestForm from "@/components/DeskRequestForm";
import { DeskQueueSection } from "@/components/ContentCard";

const COMMS_TYPES = ["LinkedIn Post", "Newsletter Block", "Article Outline", "Commentary Note", "Instagram Caption"];
const COMMS_CHANNELS = ["LinkedIn", "Newsletter", "Instagram", "Website / Article"];

export default async function CommsPage() {
  await requireAdmin();

  const [allContent, styleProfiles] = await Promise.all([
    getContentPipeline(),
    getStyleProfiles(),
  ]);

  // Filter to Comms desk items; fall back to content-type matching for older items without Desk set
  const commsTypes = new Set(["Post", "Newsletter", "Artículo", "Article", "LinkedIn Post", "Newsletter Block", "Instagram Caption", "Article Outline", "Commentary Note"]);
  const deskItems = allContent.filter(item =>
    item.desk === "Comms" ||
    (!item.desk && (
      commsTypes.has(item.contentType) ||
      (item.contentType && (
        item.contentType.toLowerCase().includes("post") ||
        item.contentType.toLowerCase().includes("newsletter") ||
        item.contentType.toLowerCase().includes("article") ||
        item.contentType.toLowerCase().includes("caption") ||
        item.contentType.toLowerCase().includes("linkedin")
      ))
    ))
  );

  const pending   = deskItems.filter(i => !i.draftText && !i.slideHtml);
  const generated = deskItems.filter(i => i.draftText || i.slideHtml);

  // Comms only needs Voice / Tone + Brand Identity profiles (not visual layout styles)
  const commsProfiles = styleProfiles.filter(p =>
    p.styleType === "Voice / Tone" || p.styleType === "Brand Identity" || p.scope === "JMM" || p.scope === "Common House" || p.scope === "Portfolio Startup"
  );

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

            {/* Request form */}
            <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E0E0D8]">
                <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/30 mb-1">Nueva solicitud</p>
                <p className="text-sm font-bold text-[#131218]">Comms Desk</p>
              </div>
              <DeskRequestForm
                deskType="comms"
                contentTypes={COMMS_TYPES}
                channelOrProjectOptions={COMMS_CHANNELS}
                channelOrProjectLabel="Plataforma"
                styleProfiles={commsProfiles}
              />
            </div>

            {/* Queue + Generated sections */}
            <DeskQueueSection pending={pending} generated={generated} />

          </div>
        </div>
      </main>
    </div>
  );
}
