import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { HallSection } from "@/components/HallSection";
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
    <div className="flex min-h-screen bg-[#f4f4ef]">
      <Sidebar adminNav />
      <main
        className="flex-1 ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              DESIGN · <b style={{ color: "var(--hall-ink-0)" }}>DESK</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Design{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                desk
              </em>.
            </h1>
          </div>
        </header>

        <div className="px-9 py-6 flex gap-8 items-start">

          {/* Form panel — sticky */}
          <div className="flex-shrink-0 sticky top-6">
            <HallSection title="New " flourish="request">
              <DeskRequestForm
                deskType="design"
                deskLabel="Design Desk"
                contentTypes={DESIGN_TYPES}
                channelOrProjectOptions={projectNames.length > 0 ? projectNames : ["CH Institucional", "Auto Mercado", "Fair Cycle", "LATAM NGO"]}
                channelOrProjectLabel="Proyecto"
                styleProfiles={designStyleProfiles}
              />
            </HallSection>
          </div>

          {/* Production list — fills remaining space */}
          <div className="flex-1 min-w-0">
            <HallSection title="Desk " flourish="queue" meta={`${deskItems.length} ITEM${deskItems.length !== 1 ? "S" : ""}`}>
              <DeskQueueSection items={deskItems} />
            </HallSection>
          </div>

        </div>
      </main>
    </div>
  );
}
