"use client";

/**
 * OrganizationEditor — inline full editor for an `organizations` row.
 *
 * Toggleable form (closed by default → "Edit organization" button).
 * On save PATCHes /api/admin/organizations/[id] and calls router.refresh()
 * so the parent server-rendered org page re-reads the updated row.
 *
 * AGENTS.md client-component-refresh-rules:
 *   - The Hall org page server-renders org name, classes, domain stats —
 *     so router.refresh() is required after a successful PATCH.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const RELATIONSHIP_STAGES = [
  "Prospect",
  "Active Client",
  "Lapsed",
  "Archived",
  "Partner",
  "Investor",
  "Funder",
  "Vendor",
] as const;
const ORG_CATEGORIES = ["Startup", "Corporate", "NGO", "Public", "Other"] as const;
const ENGAGEMENT_TYPES = ["Client", "Partner", "Investor", "Funder", "Vendor"] as const;

export type OrganizationEditable = {
  name: string;
  relationship_stage: string | null;
  org_category: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  notes: string | null;
  engagement_type: string | null;
  engagement_value: number | null;
};

type Props = {
  /** Either uuid id or notion_id; the API matches by either. */
  id: string;
  initial: OrganizationEditable;
};

export function OrganizationEditor({ id, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OrganizationEditable>({
    name: initial.name ?? "",
    relationship_stage: initial.relationship_stage ?? "",
    org_category: initial.org_category ?? "",
    country: initial.country ?? "",
    city: initial.city ?? "",
    website: initial.website ?? "",
    notes: initial.notes ?? "",
    engagement_type: initial.engagement_type ?? "",
    engagement_value: initial.engagement_value ?? null,
  } as OrganizationEditable);

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
        Edit organization
      </button>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      // Required field: must be non-empty string.
      if (!form.name || !form.name.trim()) {
        throw new Error("Name is required");
      }
      body.name = form.name.trim();
      body.relationship_stage = form.relationship_stage || null;
      body.org_category = form.org_category || null;
      body.country = form.country || null;
      body.city = form.city || null;
      body.website = form.website || null;
      body.notes = form.notes || null;
      body.engagement_type = form.engagement_type || null;
      body.engagement_value = form.engagement_value ?? null;

      const res = await fetch(`/api/admin/organizations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
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
        <Field label="Name (required)">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            required
            style={inputStyle()}
          />
        </Field>
        <Select
          label="Relationship stage"
          value={form.relationship_stage ?? ""}
          options={RELATIONSHIP_STAGES}
          onChange={(v) => setForm((s) => ({ ...s, relationship_stage: v || null }))}
        />
        <Select
          label="Category"
          value={form.org_category ?? ""}
          options={ORG_CATEGORIES}
          onChange={(v) => setForm((s) => ({ ...s, org_category: v || null }))}
        />
        <Select
          label="Engagement type"
          value={form.engagement_type ?? ""}
          options={ENGAGEMENT_TYPES}
          onChange={(v) => setForm((s) => ({ ...s, engagement_type: v || null }))}
        />
        <Field label="Country">
          <input
            type="text"
            value={form.country ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))}
            style={inputStyle()}
          />
        </Field>
        <Field label="City">
          <input
            type="text"
            value={form.city ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
            style={inputStyle()}
          />
        </Field>
        <Field label="Website">
          <input
            type="url"
            value={form.website ?? ""}
            placeholder="https://…"
            onChange={(e) => setForm((s) => ({ ...s, website: e.target.value }))}
            style={inputStyle()}
          />
        </Field>
        <Field label="Engagement value (USD)">
          <input
            type="number"
            step="any"
            value={form.engagement_value == null ? "" : String(form.engagement_value)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") setForm((s) => ({ ...s, engagement_value: null }));
              else {
                const n = Number(v);
                setForm((s) => ({ ...s, engagement_value: Number.isFinite(n) ? n : null }));
              }
            }}
            style={inputStyle()}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }}
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
          {saving ? "Saving…" : "Save"}
        </button>
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
