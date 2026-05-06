"use client";

/**
 * KnowledgeAssetEditor — inline editor + create form for `knowledge_assets`.
 *
 * Used on /admin/knowledge/[id]. Toggleable form (closed by default).
 * On save:
 *   - existing row → PATCH /api/admin/knowledge-assets/[id]
 *   - mode="create" → POST /api/admin/knowledge-assets/[id] (id = "new")
 *
 * Calls router.refresh() after success to re-render the server-rendered
 * detail page (per AGENTS.md client-component-refresh-rules).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const ASSET_TYPES = [
  "Playbook",
  "Template",
  "Reference",
  "Insight",
  "Pattern",
  "Decision Record",
] as const;
const STATUSES = ["Draft", "Live", "Archived"] as const;

export type KnowledgeAssetEditable = {
  title: string;
  asset_type: string | null;
  status: string | null;
  summary: string | null;
  body_md: string | null;
};

type Props = {
  /** uuid `id` (or notion_id) of an existing row, OR the literal "new" to create. */
  id: string;
  initial: KnowledgeAssetEditable;
  /** When "create", the form is open by default and submits via POST. */
  mode?: "edit" | "create";
};

export function KnowledgeAssetEditor({ id, initial, mode = "edit" }: Props) {
  const router = useRouter();
  const isCreate = mode === "create";
  const [open, setOpen] = useState(isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeAssetEditable>({
    title: initial.title ?? "",
    asset_type: initial.asset_type ?? "",
    status: initial.status ?? "",
    summary: initial.summary ?? "",
    body_md: initial.body_md ?? "",
  } as KnowledgeAssetEditable);

  if (!open) {
    return (
      <button
        type="button"
        className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded border"
        style={{
          fontFamily: "var(--font-hall-mono)",
          color: "var(--hall-ink-0)",
          borderColor: "var(--hall-ink-0)",
          background: "transparent",
        }}
        onClick={() => setOpen(true)}
      >
        Edit knowledge asset
      </button>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (!form.title || !form.title.trim()) {
        throw new Error("Title is required");
      }
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        asset_type: form.asset_type || null,
        status: form.status || null,
        summary: form.summary || null,
        body_md: form.body_md || null,
      };

      const res = await fetch(
        `/api/admin/knowledge-assets/${encodeURIComponent(isCreate ? "new" : id)}`,
        {
          method: isCreate ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        knowledge_asset?: { id: string };
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      if (isCreate && json.knowledge_asset?.id) {
        router.push(`/admin/knowledge-assets/${json.knowledge_asset.id}`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="p-4 space-y-3"
      style={{
        background: "var(--hall-paper-1)",
        border: "1px solid var(--hall-line)",
        borderRadius: 3,
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title (required)">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            required
            style={inputStyle()}
          />
        </Field>
        <Select
          label="Asset type"
          value={form.asset_type ?? ""}
          options={ASSET_TYPES}
          onChange={(v) => setForm((s) => ({ ...s, asset_type: v || null }))}
        />
        <Select
          label="Status"
          value={form.status ?? ""}
          options={STATUSES}
          onChange={(v) => setForm((s) => ({ ...s, status: v || null }))}
        />
      </div>

      <Field label="Summary">
        <textarea
          rows={2}
          value={form.summary ?? ""}
          onChange={(e) => setForm((s) => ({ ...s, summary: e.target.value }))}
          style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Body (markdown)">
        <textarea
          rows={14}
          value={form.body_md ?? ""}
          onChange={(e) => setForm((s) => ({ ...s, body_md: e.target.value }))}
          style={{
            ...inputStyle(),
            resize: "vertical",
            lineHeight: 1.55,
            fontFamily: "var(--font-hall-mono)",
            fontSize: 12,
          }}
        />
      </Field>

      {error && (
        <p
          className="text-[11px]"
          style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}
        >
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          type="button"
          className="hall-btn-primary"
          style={{ padding: "6px 14px", fontSize: 11, fontFamily: "var(--font-hall-mono)" }}
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : isCreate ? "Create" : "Save"}
        </button>
        {!isCreate && (
          <button
            type="button"
            className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded border"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
              borderColor: "var(--hall-line)",
            }}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            disabled={saving}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    fontFamily: "var(--font-hall-sans)",
    fontSize: 12.5,
    color: "var(--hall-ink-0)",
    background: "var(--hall-paper-0)",
    border: "1px solid var(--hall-line)",
    padding: "7px 9px",
    borderRadius: 3,
    outline: "none",
    width: "100%",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[9.5px] uppercase tracking-[0.08em]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Select<T extends readonly string[]>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: T;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle()}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}
