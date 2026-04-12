import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getKnowledgeAssets, getReusableEvidence } from "@/lib/notion";
import { isAdminUser } from "@/lib/clients";
import { ADMIN_NAV as NAV } from "@/lib/admin-nav";
import type { LibraryContentFamily } from "@/types/house";

// Map Notion assetType → Library content family
function toFamily(assetType: string): LibraryContentFamily {
  const t = assetType.toLowerCase();
  if (t.includes("signal") || t.includes("observation") || t.includes("trend")) return "signal";
  if (t.includes("case") || t.includes("precedent") || t.includes("reference")) return "case";
  if (t.includes("viewpoint") || t.includes("framework") || t.includes("position") || t.includes("perspective")) return "viewpoint";
  if (t.includes("pattern") || t.includes("dynamic") || t.includes("recurring")) return "pattern";
  return "viewpoint"; // safe fallback
}

const FAMILY_META: Record<
  LibraryContentFamily,
  { label: string; description: string; rationale: string }
> = {
  signal: {
    label: "Signals",
    description: "Observations and trends from the field",
    rationale: "Early evidence of what's changing — before it becomes consensus.",
  },
  case: {
    label: "Cases",
    description: "Project references and precedents",
    rationale: "Real examples from CH-adjacent work, sanitized for cross-project use.",
  },
  viewpoint: {
    label: "Viewpoints",
    description: "CH frameworks and positions",
    rationale: "How Common House sees the problem — not just what others think.",
  },
  pattern: {
    label: "Patterns",
    description: "Recurring dynamics across projects",
    rationale: "What keeps showing up. Validated through multiple project cycles.",
  },
};

export default async function LibraryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAdminUser(userId)) redirect("/hall");

  const [assets, reusable] = await Promise.all([
    getKnowledgeAssets(),
    getReusableEvidence(),
  ]);

  // Group assets by family
  const byFamily: Record<LibraryContentFamily, typeof assets> = {
    signal: [], case: [], viewpoint: [], pattern: [],
  };
  for (const asset of assets) {
    byFamily[toFamily(asset.assetType)].push(asset);
  }

  // Canonical evidence — highest-confidence cross-project items
  const canonical = reusable.filter((e) => e.reusability === "Canonical");

  const families: LibraryContentFamily[] = ["signal", "case", "viewpoint", "pattern"];
  const populated = families.filter((f) => byFamily[f].length > 0);
  const totalItems = assets.length + canonical.length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">

        {/* Header — reading room */}
        <div className="bg-[#131218] px-8 py-8 border-b border-white/8">
          <div className="max-w-4xl mx-auto">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-4">
              The Library
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Institutional Intelligence
            </h1>
            <p className="text-white/35 text-sm mt-2 max-w-2xl leading-relaxed">
              Curated knowledge from across the Common House network — signals, cases,
              viewpoints, and patterns that accumulate as the work deepens.
            </p>
            {totalItems > 0 && (
              <div className="flex items-center gap-2 mt-5">
                <span className="text-[10px] font-bold text-[#131218] bg-[#B2FF59] px-3 py-1.5 rounded-full uppercase tracking-widest">
                  {totalItems} item{totalItems !== 1 ? "s" : ""}
                </span>
                {canonical.length > 0 && (
                  <span className="text-[10px] font-bold text-white/40 border border-white/15 px-3 py-1.5 rounded-full uppercase tracking-widest">
                    {canonical.length} canonical
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="max-w-4xl mx-auto space-y-10">

            {/* Canonical — most authoritative, featured treatment */}
            {canonical.length > 0 && (
              <section>
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
                      Canonical
                    </p>
                    <span className="text-[10px] font-bold text-[#131218] bg-[#B2FF59] px-2 py-0.5 rounded-full">
                      {canonical.length}
                    </span>
                  </div>
                  <p className="text-xs text-[#131218]/35 leading-relaxed">
                    The highest-confidence cross-project evidence — validated, reusable, and
                    worth reading regardless of which project you're in.
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="h-1 bg-[#131218]" />
                  <div className="divide-y divide-[#EFEFEA]">
                    {canonical.map((e) => (
                      <div key={e.id} className="px-6 py-5 flex gap-4">
                        <span className="text-[#B2FF59] bg-[#131218] rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          ✦
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#131218] leading-snug">
                            {e.title}
                          </p>
                          {e.excerpt && (
                            <p className="text-sm text-[#131218]/50 mt-2 leading-relaxed">
                              {e.excerpt}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-3">
                            <span className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
                              {e.type}
                            </span>
                            {e.confidence && (
                              <span className="text-[10px] text-[#131218]/20 uppercase tracking-widest">
                                · {e.confidence} confidence
                              </span>
                            )}
                            {e.dateCaptured && (
                              <span className="text-[10px] text-[#131218]/20">
                                · {new Date(e.dateCaptured).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Knowledge assets grouped by family */}
            {populated.map((family) => {
              const meta = FAMILY_META[family];
              const items = byFamily[family];
              return (
                <section key={family}>
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
                        {meta.label}
                      </p>
                      <span className="text-[10px] font-bold text-[#131218]/40 bg-[#EFEFEA] border border-[#E0E0D8] px-2 py-0.5 rounded-full">
                        {items.length}
                      </span>
                    </div>
                    <p className="text-xs text-[#131218]/35 leading-relaxed">
                      {meta.rationale}
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                    <div className="h-1 bg-[#EFEFEA]" />
                    <div className="divide-y divide-[#EFEFEA]">
                      {items.map((asset) => (
                        <div key={asset.id} className="px-6 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#131218] leading-snug">
                                {asset.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {asset.assetType && (
                                  <span className="text-[10px] font-medium text-[#131218]/35 bg-[#EFEFEA] px-2 py-0.5 rounded-full">
                                    {asset.assetType}
                                  </span>
                                )}
                                {asset.category && (
                                  <span className="text-[10px] text-[#131218]/25 font-medium">
                                    {asset.category}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {asset.status === "Active" || asset.status === "Live" ? (
                                <span className="text-[10px] font-bold text-[#131218] bg-[#B2FF59] px-2 py-0.5 rounded-full uppercase tracking-widest">
                                  {asset.status}
                                </span>
                              ) : asset.status ? (
                                <span className="text-[10px] font-medium text-[#131218]/25 uppercase tracking-widest">
                                  {asset.status}
                                </span>
                              ) : null}
                              {asset.lastUpdated && (
                                <span className="text-[10px] text-[#131218]/20 font-medium">
                                  {new Date(asset.lastUpdated).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}

            {/* Empty state */}
            {totalItems === 0 && (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] p-12 text-center">
                <div className="w-12 h-12 bg-[#131218] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#B2FF59] text-lg">◉</span>
                </div>
                <p className="text-sm font-bold text-[#131218]">The Library is building</p>
                <p className="text-xs text-[#131218]/40 mt-2 max-w-xs mx-auto leading-relaxed">
                  Knowledge assets emerge from validated, reusable evidence across projects.
                  They accumulate as the work deepens.
                </p>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
