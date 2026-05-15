/**
 * /admin/landscape — browse the reuse landscape reference dataset.
 *
 * Source: public.reuse_landscape (1.4K+ rows imported from the PR3/EMF reuse
 * atlas). Distinct from CH-tracked `organizations`; this is market intel.
 *
 * Filters: category, region, country, stage, status, free-text search.
 * Each row exposes a "Promote → organizations" action that creates a CH
 * organizations row and links back via reuse_landscape.organization_id.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { LandscapeFilters } from "@/components/landscape/LandscapeFilters";
import { LandscapeTable, type LandscapeRow } from "@/components/landscape/LandscapeTable";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = {
  q?: string;
  cat?: string;
  region?: string;
  country?: string;
  stage?: string;
  status?: string;
  promoted?: string;
  node?: string;   // knowledge_nodes.path filter, e.g. "reuse/packaging/refill/at-home"
  page?: string;
};

type NodeFacet = { id: string; path: string; title: string; atlas_total: number };

export default async function LandscapePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const sb = getSupabaseServerClient();

  // Build the row query.
  // Resolve node filter → uuid up front so the table query can use the FK.
  let nodeId: string | null = null;
  if (sp.node) {
    const { data: n } = await sb
      .from("knowledge_nodes")
      .select("id")
      .eq("path", sp.node)
      .maybeSingle();
    nodeId = (n as { id: string } | null)?.id ?? null;
  }

  let q = sb
    .from("reuse_landscape")
    .select(
      "id, solution_name, organization_name, website, description, solution_category, sub_category, waste_types, stage, hq_country, active_regions, status, year_founded, organization_id, channels, employees_band, knowledge_node_id, knowledge_nodes!inner(path, title)",
      { count: "exact" }
    )
    .order("organization_name", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim().replace(/[%_]/g, "\\$&");
    q = q.or(
      `solution_name.ilike.%${term}%,organization_name.ilike.%${term}%,description.ilike.%${term}%`
    );
  }
  if (sp.cat)      q = q.eq("solution_category", sp.cat);
  if (sp.stage)    q = q.eq("stage", sp.stage);
  if (sp.country)  q = q.eq("hq_country", sp.country);
  if (sp.status)   q = q.eq("status", sp.status);
  if (sp.region)   q = q.contains("active_regions", [sp.region]);
  if (sp.promoted === "yes") q = q.not("organization_id", "is", null);
  if (sp.promoted === "no")  q = q.is("organization_id", null);
  if (nodeId)       q = q.eq("knowledge_node_id", nodeId);

  const [{ data: rows, count, error }, facetsRes] = await Promise.all([
    q,
    getFacets(sb),
  ]);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PortalShell
      eyebrow={{ label: "REUSE ATLAS", accent: `${total.toLocaleString()} SOLUTIONS` }}
      title="Reuse"
      flourish="atlas"
      subtitle="External reference dataset of reuse-economy organizations and solutions. Filter to find operators by category, region, or material. Promote a row to push it into CH's canonical organizations table."
      meta={
        <span
          className="text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {total.toLocaleString()} ROWS · {facetsRes.countries.length} COUNTRIES
        </span>
      }
      metaMobile={
        <span
          className="text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          <b style={{ color: "var(--hall-ink-0)" }}>{total.toLocaleString()}</b>
        </span>
      }
    >
      <LandscapeFilters
        categories={facetsRes.categories}
        regions={facetsRes.regions}
        countries={facetsRes.countries}
        stages={facetsRes.stages}
        nodes={facetsRes.nodes}
        initial={{
          q: sp.q ?? "",
          cat: sp.cat ?? "",
          node: sp.node ?? "",
          region: sp.region ?? "",
          country: sp.country ?? "",
          stage: sp.stage ?? "",
          status: sp.status ?? "",
          promoted: sp.promoted ?? "",
        }}
      />

      <HallSection
        title="Solutions"
        flourish={
          totalActive(sp) > 0
            ? `${totalActive(sp)} active filter${totalActive(sp) > 1 ? "s" : ""}`
            : undefined
        }
        meta={`PAGE ${page} OF ${totalPages.toLocaleString()}`}
      >
        {error && (
          <p
            className="text-[11px] mb-3"
            style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}
          >
            Error loading landscape: {error.message}
          </p>
        )}

        <LandscapeTable rows={(rows ?? []) as LandscapeRow[]} />

        {totalPages > 1 && (
          <nav
            className="flex items-center justify-between mt-5 pt-3 text-[11px]"
            style={{
              borderTop: "1px solid var(--hall-line-soft)",
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
            }}
          >
            <span>
              Showing {(offset + 1).toLocaleString()}–
              {Math.min(offset + PAGE_SIZE, total).toLocaleString()} of{" "}
              {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildHref(sp, { page: String(page - 1) })}
                  className="px-2 py-1 underline"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildHref(sp, { page: String(page + 1) })}
                  className="px-2 py-1 underline"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  Next →
                </Link>
              )}
            </div>
          </nav>
        )}
      </HallSection>
    </PortalShell>
  );
}

function totalActive(sp: SP) {
  return ["q", "cat", "node", "region", "country", "stage", "status", "promoted"].filter(
    (k) => sp[k as keyof SP] && sp[k as keyof SP] !== ""
  ).length;
}

function buildHref(sp: SP, override: Partial<SP>) {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...override })) {
    if (v && v !== "") merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return `/admin/landscape${qs ? `?${qs}` : ""}`;
}

async function getFacets(
  sb: ReturnType<typeof getSupabaseServerClient>
): Promise<{
  categories: string[];
  regions: string[];
  countries: string[];
  stages: string[];
  nodes: NodeFacet[];
}> {
  // Cheap distinct queries. With 1.5K rows these are sub-100ms.
  const [cats, ctries, stages, nodes] = await Promise.all([
    sb
      .from("reuse_landscape")
      .select("solution_category")
      .not("solution_category", "is", null)
      .order("solution_category"),
    sb
      .from("reuse_landscape")
      .select("hq_country")
      .not("hq_country", "is", null)
      .order("hq_country"),
    sb
      .from("reuse_landscape")
      .select("stage")
      .not("stage", "is", null)
      .order("stage"),
    sb
      .from("vw_knowledge_node_operators")
      .select("node_id, path, title, atlas_total")
      .gt("atlas_total", 0)
      .order("atlas_total", { ascending: false }),
  ]);
  const uniq = (arr: ({ [k: string]: string | null } | null)[] | null, key: string) =>
    Array.from(
      new Set(((arr ?? []) as { [k: string]: string | null }[]).map((r) => r[key] ?? "").filter(Boolean))
    ).sort();

  return {
    categories: uniq(cats.data, "solution_category"),
    regions: [
      "Africa",
      "Asia",
      "Europe",
      "Middle East",
      "North America",
      "Oceana",
      "South America",
      "Global",
    ],
    countries: uniq(ctries.data, "hq_country"),
    stages: uniq(stages.data, "stage"),
    nodes: ((nodes.data ?? []) as Array<{ node_id: string; path: string; title: string; atlas_total: number }>)
      .map((n) => ({ id: n.node_id, path: n.path, title: n.title, atlas_total: n.atlas_total })),
  };
}
