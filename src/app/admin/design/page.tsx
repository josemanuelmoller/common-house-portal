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

        <div className="px-8 py-8 flex gap-8 items-start">

          {/* Form panel — sticky */}
          <div className="flex-shrink-0 sticky top-6">
            <DeskRequestForm
              deskType="design"
              deskLabel="Design Desk"
              contentTypes={DESIGN_TYPES}
              channelOrProjectOptions={projectNames.length > 0 ? projectNames : ["CH Institucional", "Auto Mercado", "Fair Cycle", "LATAM NGO"]}
              channelOrProjectLabel="Proyecto"
              styleProfiles={designStyleProfiles}
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
