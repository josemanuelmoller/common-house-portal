/**
 * /admin/settings/project-roles
 *
 * Configure which CH Projects Jose manages operationally vs advises
 * (mentorship) vs just observes. Governs which projects' evidence and
 * loops emit ActionSignals to Jose's desk.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 (Management-level gate).
 */

import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { loadProjectRoles } from "@/lib/ingestors/project-roles";
import { notion, DB } from "@/lib/notion/core";
import { ProjectRolesTable } from "@/components/ProjectRolesTable";

export const dynamic = "force-dynamic";

type Row = {
  notionId: string;
  name:     string;
  status:   string;
  level:    "operational" | "mentorship" | "observer";
};

async function loadActiveProjects(): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | undefined;
  do {
    const res: {
      results: Array<{ id: string; properties: Record<string, unknown> }>;
      has_more: boolean;
      next_cursor: string | null;
    } = await (notion.databases as unknown as {
      query: (args: unknown) => Promise<{
        results: Array<{ id: string; properties: Record<string, unknown> }>;
        has_more: boolean;
        next_cursor: string | null;
      }>;
    }).query({
      database_id: DB.projects,
      page_size: 100,
      start_cursor: cursor,
      filter: {
        or: [
          { property: "Project Status", select: { equals: "Active" } },
          { property: "Project Status", select: { equals: "Proposed" } },
          { property: "Project Status", select: { equals: "Paused" } },
        ],
      },
      sorts: [{ property: "Project Name", direction: "ascending" }],
    });
    for (const p of res.results) {
      const props = p.properties as Record<string, unknown>;
      const title = extractTitle(props["Project Name"]);
      const status = extractSelect(props["Project Status"]) ?? "";
      const level = extractSelect(props["Management Level"]) as Row["level"] | null;
      out.push({ notionId: p.id, name: title, status, level: level ?? "operational" });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

function extractTitle(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as { title?: Array<{ plain_text?: string }> };
  return (p.title ?? []).map(t => t.plain_text ?? "").join("").trim();
}

function extractSelect(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as { select?: { name?: string } | null };
  return p.select?.name ?? null;
}

export default async function ProjectRolesPage() {
  await requireAdmin();
  const [rows, currentMap] = await Promise.all([
    loadActiveProjects(),
    loadProjectRoles(), // reuses the same Notion query; cheap enough for this page
  ]);
  // Merge in case loadProjectRoles returns stale or different data
  void currentMap;

  return (
    <div className="flex min-h-screen">
      <Sidebar adminNav />
      <main className="flex-1 md:ml-[228px]" style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}>
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              SETTINGS · <b style={{ color: "var(--hall-ink-0)" }}>PROJECT ROLES</b>
            </span>
            <h1 className="text-[16px] font-medium tracking-[-0.01em]" style={{ color: "var(--hall-ink-0)" }}>
              Management{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                level per project
              </em>
            </h1>
          </div>
        </header>

        <div className="px-9 py-7 max-w-5xl space-y-5">
          <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--hall-muted-2)" }}>
            <p className="mb-2">
              <strong style={{ color: "var(--hall-ink-0)" }}>Operational</strong> — Jose leads this project day-to-day. Every actionable item flows to his desk. <em>Default for new projects.</em>
            </p>
            <p className="mb-2">
              <strong style={{ color: "var(--hall-ink-0)" }}>Mentorship</strong> — Jose advises but does not lead. Only items where Jose is the <em>explicit</em> named actor pass through to his desk. Items owned by others do not.
            </p>
            <p>
              <strong style={{ color: "var(--hall-ink-0)" }}>Observer</strong> — Jose is aware but has no role. No action_items emitted.
              Conversations + relationship signals still recorded.
            </p>
          </div>

          <ProjectRolesTable initialRows={rows} />
        </div>
      </main>
    </div>
  );
}
