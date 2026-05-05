"use client";

/**
 * EngagementEditor — inline editor for an engagements row.
 *
 * Renders an admin-only form with every editable field on the engagement.
 * On save, PATCHes /api/admin/engagements/[id] (which calls adminGuardApi)
 * and then calls router.refresh() so the server-rendered detail page
 * re-reads the updated row.
 *
 * AGENTS.md client-component-refresh-rules:
 *   - This page server-renders the same engagement above, so router.refresh()
 *     is required after a successful PATCH.
 *   - We do NOT use window.location.reload() (would clear React state).
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const ENGAGEMENT_TYPES = ["Client", "Partner", "Investor", "Funder", "Vendor"] as const;
const RELATIONSHIP_STATUSES = ["Active", "Inactive", "Closed"] as const;

export type EngagementEditable = {
  relationship_name: string;
  engagement_type: string | null;
  relationship_status: string | null;
  engagement_value: number | null;
  budget_readiness: string | null;
  strategic_exposure: string | null;
  territories_covered: string | null;
  org_notion_id: string | null;
  start_date: string | null;
  end_date: string | null;
  expected_close_date: string | null;
  notes: string | null;
  notes_on_terms: string | null;
  ch_value_add_summary: string | null;
};

type Props = {
  id: string;
  initial: EngagementEditable;
};

export function EngagementEditor({ id, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<EngagementEditable>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function update<K extends keyof EngagementEditable>(key: K, value: EngagementEditable[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      const payload: EngagementEditable = {
        ...form,
        // Coerce empty strings to null for nullable text/date fields.
        engagement_type: form.engagement_type || null,
        relationship_status: form.relationship_status || null,
        budget_readiness: form.budget_readiness || null,
        strategic_exposure: form.strategic_exposure || null,
        territories_covered: form.territories_covered || null,
        org_notion_id: form.org_notion_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        expected_close_date: form.expected_close_date || null,
        notes: form.notes || null,
        notes_on_terms: form.notes_on_terms || null,
        ch_value_add_summary: form.ch_value_add_summary || null,
      };

      const res = await fetch(`/api/admin/engagements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: json.error ?? `Save failed (${res.status})` });
      } else {
        setMsg({ kind: "ok", text: "Saved." });
        router.refresh(); // re-renders the server detail page with new data
      }
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <TextInput
          label="Relationship name"
          value={form.relationship_name}
          onChange={(v) => update("relationship_name", v)}
          required
        />
        <SelectInput
          label="Engagement type"
          value={form.engagement_type ?? ""}
          options={ENGAGEMENT_TYPES}
          onChange={(v) => update("engagement_type", v || null)}
        />
        <SelectInput
          label="Relationship status"
          value={form.relationship_status ?? ""}
          options={RELATIONSHIP_STATUSES}
          onChange={(v) => update("relationship_status", v || null)}
        />
        <NumberInput
          label="Engagement value (USD)"
          value={form.engagement_value}
          onChange={(v) => update("engagement_value", v)}
        />
        <TextInput
          label="Org notion_id"
          value={form.org_notion_id ?? ""}
          onChange={(v) => update("org_notion_id", v || null)}
          placeholder="e.g. 1f8a…"
        />
        <TextInput
          label="Territories covered"
          value={form.territories_covered ?? ""}
          onChange={(v) => update("territories_covered", v || null)}
        />
        <TextInput
          label="Budget readiness"
          value={form.budget_readiness ?? ""}
          onChange={(v) => update("budget_readiness", v || null)}
        />
        <TextInput
          label="Strategic exposure"
          value={form.strategic_exposure ?? ""}
          onChange={(v) => update("strategic_exposure", v || null)}
        />
        <DateInput
          label="Start date"
          value={form.start_date}
          onChange={(v) => update("start_date", v)}
        />
        <DateInput
          label="End date"
          value={form.end_date}
          onChange={(v) => update("end_date", v)}
        />
        <DateInput
          label="Expected close"
          value={form.expected_close_date}
          onChange={(v) => update("expected_close_date", v)}
        />
      </div>

      <Textarea
        label="Notes"
        value={form.notes ?? ""}
        onChange={(v) => update("notes", v || null)}
      />
      <Textarea
        label="Notes on terms"
        value={form.notes_on_terms ?? ""}
        onChange={(v) => update("notes_on_terms", v || null)}
      />
      <Textarea
        label="CH value-add summary"
        value={form.ch_value_add_summary ?? ""}
        onChange={(v) => update("ch_value_add_summary", v || null)}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
        <button
          type="submit"
          disabled={saving}
          className="hall-btn-primary"
          style={{ padding: "8px 18px", fontSize: 12, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {msg && (
          <span
            className="text-[11px]"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: msg.kind === "ok" ? "var(--hall-ok)" : "var(--hall-danger)",
            }}
          >
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}

// ── Inputs ─────────────────────────────────────────────────────────────────────

function inputBaseStyle(): React.CSSProperties {
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

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
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

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <FieldShell label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={inputBaseStyle()}
      />
    </FieldShell>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <FieldShell label={label}>
      <input
        type="number"
        step="any"
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(null);
          else {
            const n = Number(v);
            onChange(Number.isFinite(n) ? n : null);
          }
        }}
        style={inputBaseStyle()}
      />
    </FieldShell>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  // value should be YYYY-MM-DD; date columns return that format already.
  const v = value ? value.slice(0, 10) : "";
  return (
    <FieldShell label={label}>
      <input
        type="date"
        value={v}
        onChange={(e) => onChange(e.target.value || null)}
        style={inputBaseStyle()}
      />
    </FieldShell>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <FieldShell label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputBaseStyle()}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldShell label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{ ...inputBaseStyle(), resize: "vertical", lineHeight: 1.5 }}
      />
    </FieldShell>
  );
}
