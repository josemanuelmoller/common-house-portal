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

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />
      <main
        className="flex-1 ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              OFFERS · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Offers &amp; <em className="hall-flourish">Proposals</em>
            </h1>
          </div>
          <span
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            {deskItems.length} ITEMS
          </span>
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
