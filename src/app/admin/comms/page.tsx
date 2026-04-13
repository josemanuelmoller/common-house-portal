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
            Comms <em className="font-black italic text-[#c8f55a]">Desk</em>
          </h1>
          <p className="text-sm text-white/40 mt-3 leading-relaxed">
            Posts, newsletters, artículos y voz de fundador. Canal por canal, tono por tono.
          </p>
        </header>

        <div className="px-8 py-8 flex gap-8 items-start">

          {/* Form panel — sticky */}
          <div className="flex-shrink-0 sticky top-6">
            <DeskRequestForm
              deskType="comms"
              deskLabel="Comms Desk"
              contentTypes={COMMS_TYPES}
              channelOrProjectOptions={COMMS_CHANNELS}
              channelOrProjectLabel="Plataforma"
              styleProfiles={commsProfiles}
            />
          </div>

          {/* Production list — fills remaining space */}
          <div className="flex-1 min-w-0">
            <DeskQueueSection items={deskItems} />
          </div>

        </div>
      </main>
    </div>
  );
}
