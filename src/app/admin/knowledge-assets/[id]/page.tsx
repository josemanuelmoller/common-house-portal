/**
 * /admin/knowledge-assets/[id] — Knowledge Asset detail + editor.
 *
 * Loads one row from `knowledge_assets` (Supabase). The route is a sibling
 * of /admin/knowledge (which renders the knowledge_nodes tree — a distinct
 * table per the Phase 0 freeze, §3.1).
 *
 * Use /admin/knowledge-assets/new to create a brand new asset.
 *
 * Editing is delegated to <KnowledgeAssetEditor> which PATCHes
 * /api/admin/knowledge-assets/[id] and calls router.refresh() on success.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { KnowledgeAssetEditor } from "@/components/KnowledgeAssetEditor";

export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  notion_id: string | null;
  title: string;
  asset_type: string | null;
  status: string | null;
  summary: string | null;
  body_md: string | null;
  evidence_count: number | null;
  last_evidence_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function KnowledgeAssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  // Special-case create route.
  if (id === "new") {
    return (
      <PortalShell
        eyebrow={{ label: "KNOWLEDGE ASSET", accent: "NEW" }}
        title="Create"
        flourish="asset"
        meta={
          <Link
            href="/admin/knowledge"
            className="hall-btn-outline"
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
            ← Knowledge
          </Link>
        }
      >
        <HallSection title="New asset" flourish="record">
          <KnowledgeAssetEditor
            id="new"
            mode="create"
            initial={{
              title: "",
              asset_type: null,
              status: "Draft",
              summary: null,
              body_md: null,
            }}
          />
        </HallSection>
      </PortalShell>
    );
  }

  const sb = getSupabaseServerClient();
  const isUuid = UUID_RE.test(id);
  const { data, error } = isUuid
    ? await sb
        .from("knowledge_assets")
        .select(
          "id, notion_id, title, asset_type, status, summary, body_md, evidence_count, last_evidence_at, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle()
    : await sb
        .from("knowledge_assets")
        .select(
          "id, notion_id, title, asset_type, status, summary, body_md, evidence_count, last_evidence_at, created_at, updated_at"
        )
        .eq("notion_id", id)
        .maybeSingle();

  if (error || !data) notFound();
  const a = data as AssetRow;

  return (
    <PortalShell
      eyebrow={{ label: "KNOWLEDGE ASSET", accent: a.asset_type ?? "—" }}
      title={a.title}
      meta={
        <div
          className="flex items-center gap-3 text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          <span
            className="px-1.5 py-0.5 uppercase"
            style={{
              fontWeight: 700,
              letterSpacing: "0.08em",
              border: "1px solid var(--hall-line)",
              color: "var(--hall-ink-0)",
            }}
          >
            {a.status ?? "—"}
          </span>
          <span style={{ color: "var(--hall-line)" }}>·</span>
          <span>
            EVIDENCE <b style={{ color: "var(--hall-ink-0)" }}>{a.evidence_count ?? 0}</b>
          </span>
          <Link
            href="/admin/knowledge"
            className="hall-btn-outline"
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
            ← Knowledge
          </Link>
        </div>
      }
      metaMobile={
        <span
          className="text-[10px] whitespace-nowrap"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {a.status ?? "—"} · <b style={{ color: "var(--hall-ink-0)" }}>{a.evidence_count ?? 0}</b>
        </span>
      }
    >
      <HallSection
        title="Overview"
        meta={`UPDATED ${fmtDate(a.updated_at)}`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
          <Field label="Asset type">{a.asset_type ?? "—"}</Field>
          <Field label="Status">{a.status ?? "—"}</Field>
          <Field label="Last evidence">{fmtDate(a.last_evidence_at)}</Field>
        </div>
        {a.summary && (
          <p
            className="text-[12.5px] mt-4 leading-relaxed"
            style={{ color: "var(--hall-ink-3)" }}
          >
            {a.summary}
          </p>
        )}
      </HallSection>

      <HallSection title="Body" flourish="markdown">
        <pre
          className="text-[12px] leading-relaxed whitespace-pre-wrap p-4"
          style={{
            fontFamily: "var(--font-hall-mono)",
            background: "var(--hall-paper-1)",
            border: "1px solid var(--hall-line)",
            borderRadius: 3,
            color: "var(--hall-ink-3)",
          }}
        >
          {a.body_md?.trim() || "(empty)"}
        </pre>
      </HallSection>

      <HallSection title="Edit" flourish="record">
        <KnowledgeAssetEditor
          id={a.id}
          initial={{
            title: a.title,
            asset_type: a.asset_type,
            status: a.status,
            summary: a.summary,
            body_md: a.body_md,
          }}
        />
      </HallSection>
    </PortalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[9.5px] uppercase tracking-[0.08em] mb-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </p>
      <p className="text-[13px]" style={{ color: "var(--hall-ink-0)" }}>
        {children}
      </p>
    </div>
  );
}
