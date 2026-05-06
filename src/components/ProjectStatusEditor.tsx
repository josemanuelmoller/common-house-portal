"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PROJECT_STATUSES = ["Not started", "In progress", "Active", "On hold", "Completed", "Archived", "Cancelled"] as const;
const CURRENT_STAGES = ["Discovery", "Scoping", "Proposal", "Kickoff", "Delivery", "Review", "Closed"] as const;
const ENGAGEMENT_STAGES = ["Lead", "Qualifying", "Proposal", "Negotiation", "Won", "Active", "Closed", "Lost"] as const;
const ENGAGEMENT_MODELS = ["Consulting", "Venture Studio", "Grant", "Internal", "Mixed"] as const;

type Props = {
  projectId: string;
  initial: {
    project_status?: string | null;
    current_stage?: string | null;
    engagement_stage?: string | null;
    engagement_model?: string | null;
    status_summary?: string | null;
    draft_status_update?: string | null;
  };
};

export function ProjectStatusEditor({ projectId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    project_status:      initial.project_status      ?? "",
    current_stage:       initial.current_stage       ?? "",
    engagement_stage:    initial.engagement_stage    ?? "",
    engagement_model:    initial.engagement_model    ?? "",
    status_summary:      initial.status_summary      ?? "",
    draft_status_update: initial.draft_status_update ?? "",
  });

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
        Edit status
      </button>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Send only fields that changed (or use empty-string → null sentinel).
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) body[k] = v === "" ? null : v;
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
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
      className="p-4 rounded-lg space-y-3"
      style={{ background: "var(--hall-paper-1)", border: "1px solid var(--hall-rule-1)" }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Project status"  value={form.project_status}    options={PROJECT_STATUSES} onChange={(v) => setForm((s) => ({ ...s, project_status: v }))} />
        <Select label="Current stage"   value={form.current_stage}     options={CURRENT_STAGES}   onChange={(v) => setForm((s) => ({ ...s, current_stage: v }))} />
        <Select label="Engagement stage" value={form.engagement_stage} options={ENGAGEMENT_STAGES} onChange={(v) => setForm((s) => ({ ...s, engagement_stage: v }))} />
        <Select label="Engagement model" value={form.engagement_model} options={ENGAGEMENT_MODELS} onChange={(v) => setForm((s) => ({ ...s, engagement_model: v }))} />
      </div>

      <Field label="Status summary (canonical)">
        <textarea
          rows={3}
          className="w-full text-[12px] px-2 py-1.5 rounded"
          style={{
            fontFamily: "var(--font-hall-sans)",
            background: "var(--hall-paper-0)",
            border: "1px solid var(--hall-rule-1)",
            color: "var(--hall-ink-0)",
          }}
          value={form.status_summary}
          onChange={(e) => setForm((s) => ({ ...s, status_summary: e.target.value }))}
        />
      </Field>

      <Field label="Draft status update (preview)">
        <textarea
          rows={3}
          className="w-full text-[12px] px-2 py-1.5 rounded"
          style={{
            fontFamily: "var(--font-hall-sans)",
            background: "var(--hall-paper-0)",
            border: "1px solid var(--hall-rule-1)",
            color: "var(--hall-ink-0)",
          }}
          value={form.draft_status_update}
          onChange={(e) => setForm((s) => ({ ...s, draft_status_update: e.target.value }))}
        />
      </Field>

      {error && (
        <p className="text-[11px]" style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="hall-btn-primary text-[11px] uppercase tracking-widest px-3 py-1.5 rounded"
          style={{ fontFamily: "var(--font-hall-mono)" }}
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
            borderColor: "var(--hall-rule-1)",
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block text-[10px] uppercase tracking-widest mb-1"
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
        className="w-full text-[12px] px-2 py-1.5 rounded"
        style={{
          fontFamily: "var(--font-hall-sans)",
          background: "var(--hall-paper-0)",
          border: "1px solid var(--hall-rule-1)",
          color: "var(--hall-ink-0)",
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
