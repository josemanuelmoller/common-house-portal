import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import {
  getContentPipeline,
  getStyleProfiles,
  getAllProjects,
} from "@/lib/notion";
import DeskRequestForm from "@/components/DeskRequestForm";
import { DeskQueueSection } from "@/components/ContentCard";

const COMMERCIAL_TYPES = ["Proposal", "One-pager", "Offer Deck", "Exec Summary", "Scope Document"];
const COMMERCIAL_VISUAL_TYPES = new Set(["Proposal", "One-pager", "Offer Deck", "Exec Summary"]); // used in deskItems filter


export default async function OffersPage() {
  await requireAdmin();

  const [allContent, styleProfiles, allProjects] = await Promise.all([
    getContentPipeline(),
    getStyleProfiles(),
    getAllProjects(),
  ]);

  // ── Content Pipeline queue (same pattern as Design/Comms) ────────────────────
  const deskItems = allContent.filter(item =>
    item.desk === "Commercial" ||
    (!item.desk && (
      COMMERCIAL_VISUAL_TYPES.has(item.contentType) ||
      item.contentType?.toLowerCase().includes("proposal") ||
      item.contentType?.toLowerCase().includes("offer deck")
    ))
  );

  // Deck + Proposal style profiles only
  const commercialStyleProfiles = styleProfiles.filter(p =>
    p.styleType === "Proposal Style" ||
    p.styleType === "Deck Style" ||
    p.styleType === "One-pager Style"
  );

  const projectNames = allProjects.map(p => p.name).filter(Boolean).sort();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">

        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Desks · Producción visual</p>
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
            Offers &amp; <em className="font-black italic text-[#c8f55a]">Proposals</em>
          </h1>
          <p className="text-sm text-white/40 mt-3 leading-relaxed">
            Propuestas, offer decks y scope documents — generados con el brand de CH, listos para presentar.
          </p>
        </header>

        <div className="px-8 py-8 flex gap-8 items-start">

          <div className="flex-shrink-0 sticky top-6">
            <DeskRequestForm
              deskType="commercial"
              deskLabel="Offers & Proposals"
              contentTypes={COMMERCIAL_TYPES}
              channelOrProjectOptions={projectNames.length > 0 ? projectNames : ["Common House", "CH Portfolio", "Greenleaf Retail", "SUFI", "Fair Cycle"]}
              channelOrProjectLabel="Cliente / Proyecto"
              styleProfiles={commercialStyleProfiles}
            />
          </div>

          <div className="flex-1 min-w-0">
            <DeskQueueSection items={deskItems} />
          </div>

        </div>
      </main>
    </div>
  );
}
