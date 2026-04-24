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
              COMMS · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Comms <em className="hall-flourish">Desk</em>
            </h1>
          </div>
          <span
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            {deskItems.length} ITEMS
          </span>
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
