import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { getContentPipeline, getStyleProfiles, getAllProjects } from "@/lib/notion";
import DeskRequestForm from "@/components/DeskRequestForm";
import { DeskQueueSection } from "@/components/ContentCard";

const DESIGN_TYPES = ["Deck", "One-pager", "Proposal", "Exec Summary", "Internal Brief"];

// Only visual layout styles for Design Desk — not voice/tone profiles
const DESIGN_STYLE_TYPES = new Set(["Deck Style", "Proposal Style", "One-pager Style"]);

export default async function DesignPage() {
  await requireAdmin();

  const [allContent, styleProfiles, allProjects] = await Promise.all([
    getContentPipeline(),
    getStyleProfiles(),
    getAllProjects(),
  ]);

  // Filter to Design desk items; fall back to content-type matching for older items without Desk set
  const designTypes = new Set(["Deck", "One-pager", "Propuesta", "Investor Brief", "Investor brief", "Informe", "Presentation", "Report", "Internal Brief"]);
  const deskItems = allContent.filter(item =>
    item.desk === "Design" ||
    (!item.desk && (
      designTypes.has(item.contentType) ||
      (item.contentType && (
        item.contentType.toLowerCase().includes("deck") ||
        item.contentType.toLowerCase().includes("brief") ||
        item.contentType.toLowerCase().includes("informe") ||
        item.contentType.toLowerCase().includes("report") ||
        item.contentType.toLowerCase().includes("one-pager") ||
        item.contentType.toLowerCase().includes("propuesta")
      ))
    ))
  );

  const pending   = deskItems.filter(i => !i.draftText && !i.slideHtml);
  const generated = deskItems.filter(i => i.draftText || i.slideHtml);

  // Visual layout styles only — 3 options max
  const designStyleProfiles = styleProfiles.filter(p => DESIGN_STYLE_TYPES.has(p.styleType));

  // Project names from Notion (active projects)
  const projectNames = allProjects
    .map(p => p.name)
    .filter(Boolean)
    .sort();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">

        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Desks · Producción visual</p>
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
            Design <em className="font-black italic text-[#c8f55a]">Desk</em>
          </h1>
          <p className="text-sm text-white/40 mt-3 leading-relaxed">
            Solicitudes, producción y entrega de piezas visuales — decks, one-pagers, propuestas, informes.
          </p>
        </header>

        <div className="px-12 py-9">
          <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-start">

            {/* Request form */}
            <div className="bg-white border border-[#E0E0D8] rounded-[14px] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E0E0D8]">
                <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#0e0e0e]/28 mb-1">Nueva solicitud</p>
                <p className="text-sm font-bold text-[#0e0e0e] tracking-[-0.3px]">Design Desk</p>
              </div>
              <DeskRequestForm
                deskType="design"
                contentTypes={DESIGN_TYPES}
                channelOrProjectOptions={projectNames.length > 0 ? projectNames : ["CH Institucional", "Auto Mercado", "Fair Cycle", "LATAM NGO"]}
                channelOrProjectLabel="Proyecto"
                styleProfiles={designStyleProfiles}
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
