import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getKnowledgeAssets, getReusableEvidence } from "@/lib/notion";
import { ADMIN_NAV as NAV } from "@/lib/admin-nav";
import { isAdminUser, isAdminEmail, isSuperAdminUser, isSuperAdminEmail } from "@/lib/clients";
import type { LibraryContentFamily } from "@/types/house";
import { LibraryIngestPanel } from "@/components/LibraryIngestPanel";

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
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const isAdmin = isAdminUser(user.id) || isAdminEmail(email);
  const isSuperAdmin = isSuperAdminUser(user.id) || isSuperAdminEmail(email);

  const [allAssets, reusable] = await Promise.all([
    getKnowledgeAssets(),
    getReusableEvidence(),
  ]);

  // Role-based visibility filtering
  // Knowledge Assets (institutional IP) are super-admin only
  const assets = isSuperAdmin
    ? allAssets
    : isAdmin
    ? [] // admin but not super-admin: no Knowledge Assets
    : allAssets.filter(
        (a) => a.portalVisibility === "portfolio" || a.portalVisibility === "public"
      );
  const assetsFiltered = !isSuperAdmin && allAssets.length > 0;

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
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)" }}
      >
        {/* K-v2 thin 1-line header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              LIBRARY · <b style={{ color: "var(--hall-ink-0)" }}>COMMON HOUSE</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              External{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                references
              </em>
              .
            </h1>
          </div>
          {totalItems > 0 && (
            <div
              className="flex items-center gap-2 text-[10px] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              <span className="uppercase tracking-[0.08em]" style={{ color: "var(--hall-ink-0)", fontWeight: 600 }}>
                {totalItems} ITEM{totalItems !== 1 ? "S" : ""}
              </span>
              {canonical.length > 0 && (
                <>
                  <span style={{ color: "var(--hall-muted-3)" }}>·</span>
                  <span className="uppercase tracking-[0.08em]">
                    {canonical.length} CANONICAL
                  </span>
                </>
              )}
            </div>
          )}
        </header>

        <div className="px-9 py-4">
          <p
            className="text-[11.5px] max-w-[640px] leading-relaxed"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Papers, reports, playbooks y documentos externos subidos manualmente.
            Para conocimiento destilado desde reuniones y emails por el OS, ver{" "}
            <a href="/admin/knowledge" className="underline underline-offset-2" style={{ color: "var(--hall-ink-0)", textDecorationColor: "var(--hall-ink-0)" }}>
              Knowledge
            </a>
            .
          </p>
          {assetsFiltered && (
            <p className="text-[11px] mt-2" style={{ color: "var(--hall-muted-3)" }}>
              Mostrando recursos disponibles para tu perfil
            </p>
          )}
        </div>

        <div className="px-9 pb-10 max-w-4xl space-y-8">

            {/* Ingest panel — super-admin only */}
            {isSuperAdmin && (
              <LibraryIngestPanel />
            )}

            {/* Canonical — most authoritative, featured treatment */}
            {canonical.length > 0 && (
              <section>
                <div
                  className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                  style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
                >
                  <h2
                    className="text-[19px] font-bold leading-none"
                    style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                  >
                    Canonical{" "}
                    <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                      references
                    </em>
                  </h2>
                  <span
                    className="uppercase"
                    style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
                  >
                    {canonical.length} CANONICAL
                  </span>
                </div>
                <p
                  className="text-[11.5px] leading-relaxed mb-4"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  The highest-confidence cross-project evidence — validated, reusable, and
                  worth reading regardless of which project you&apos;re in.
                </p>
                <ul className="flex flex-col">
                  {canonical.map((e) => (
                    <li
                      key={e.id}
                      className="flex gap-4 py-4"
                      style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                    >
                      <span
                        className="shrink-0 mt-0.5 flex items-center justify-center"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--hall-ink-0)",
                          color: "var(--hall-paper-0)",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        ✦
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--hall-ink-0)" }}>
                          {e.title}
                        </p>
                        {e.excerpt && (
                          <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>
                            {e.excerpt}
                          </p>
                        )}
                        <div
                          className="flex items-center gap-3 mt-3 text-[10px] uppercase"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)", letterSpacing: "0.06em" }}
                        >
                          <span>{e.type}</span>
                          {e.confidence && <span>· {e.confidence} CONFIDENCE</span>}
                          {e.dateCaptured && (
                            <span>
                              · {new Date(e.dateCaptured).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Knowledge assets grouped by family */}
            {populated.map((family) => {
              const meta = FAMILY_META[family];
              const items = byFamily[family];
              return (
                <section key={family}>
                  <div
                    className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                    style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
                  >
                    <h2
                      className="text-[19px] font-bold leading-none"
                      style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                    >
                      {meta.label}
                    </h2>
                    <span
                      className="uppercase"
                      style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
                    >
                      {items.length} ITEM{items.length !== 1 ? "S" : ""}
                    </span>
                  </div>
                  <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: "var(--hall-muted-2)" }}>
                    {meta.rationale}
                  </p>
                  <ul className="flex flex-col">
                    {items.map((asset) => (
                      <li
                        key={asset.id}
                        className="flex items-start justify-between gap-4 py-3"
                        style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--hall-ink-0)" }}>
                            {asset.name}
                          </p>
                          <div
                            className="flex items-center gap-2 mt-1.5 flex-wrap text-[10px]"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                          >
                            {asset.assetType && (
                              <span
                                className="uppercase px-2 py-0.5 rounded-[2px]"
                                style={{ background: "var(--hall-fill-soft)", letterSpacing: "0.08em" }}
                              >
                                {asset.assetType}
                              </span>
                            )}
                            {asset.category && (
                              <span>{asset.category}</span>
                            )}
                            {asset.sourceFileUrl && (
                              <a
                                href={asset.sourceFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                style={{ color: "var(--hall-muted-2)" }}
                              >
                                ↓ archivo
                              </a>
                            )}
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-2 shrink-0 text-[10px]"
                          style={{ fontFamily: "var(--font-hall-mono)" }}
                        >
                          {asset.status === "Active" || asset.status === "Live" ? (
                            <span
                              className="uppercase px-1.5 py-0.5 rounded-[2px] font-bold"
                              style={{
                                background: "var(--hall-ok-soft)",
                                color: "var(--hall-ok)",
                                letterSpacing: "0.08em",
                              }}
                            >
                              {asset.status}
                            </span>
                          ) : asset.status ? (
                            <span className="uppercase" style={{ color: "var(--hall-muted-3)", letterSpacing: "0.08em" }}>
                              {asset.status}
                            </span>
                          ) : null}
                          {asset.lastUpdated && (
                            <span style={{ color: "var(--hall-muted-3)" }}>
                              {new Date(asset.lastUpdated).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {/* Knowledge Assets locked — admin but not super-admin */}
            {isAdmin && !isSuperAdmin && allAssets.length > 0 && (
              <div
                className="p-10 text-center rounded-[3px]"
                style={{ border: "1px solid var(--hall-line-soft)" }}
              >
                <div
                  className="flex items-center justify-center mx-auto mb-3"
                  style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--hall-ink-0)", color: "var(--hall-paper-0)" }}
                >
                  <span className="text-sm">⊘</span>
                </div>
                <p className="text-[13px] font-bold" style={{ color: "var(--hall-ink-0)" }}>Knowledge Assets — acceso restringido</p>
                <p className="text-[11px] mt-2 max-w-[320px] mx-auto leading-relaxed" style={{ color: "var(--hall-muted-3)" }}>
                  Los Knowledge Assets contienen IP institucional de Common House y están disponibles
                  solo para super-admins.
                </p>
              </div>
            )}

            {/* Empty state — no accessible content at all */}
            {totalItems === 0 && !(isAdmin && !isSuperAdmin && allAssets.length > 0) && (
              <div
                className="p-12 text-center rounded-[3px]"
                style={{ border: "1px solid var(--hall-line-soft)" }}
              >
                <div
                  className="flex items-center justify-center mx-auto mb-4"
                  style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--hall-ink-0)", color: "var(--hall-lime)" }}
                >
                  <span className="text-lg">◉</span>
                </div>
                <p className="text-[13px] font-bold" style={{ color: "var(--hall-ink-0)" }}>The Library is building</p>
                <p className="text-[11px] mt-2 max-w-xs mx-auto leading-relaxed" style={{ color: "var(--hall-muted-3)" }}>
                  Knowledge assets emerge from validated, reusable evidence across projects.
                  They accumulate as the work deepens.
                </p>
              </div>
            )}

        </div>
      </main>
    </div>
  );
}
