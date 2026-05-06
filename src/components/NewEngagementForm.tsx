"use client";

/**
 * NewEngagementForm — minimal create form for an engagements row.
 *
 * POSTs to /api/admin/engagements (which calls adminGuardApi).
 * On success: router.push() to the new detail page (no router.refresh()
 * needed because this page does not server-render the row).
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const ENGAGEMENT_TYPES = ["Client", "Partner", "Investor", "Funder", "Vendor"] as const;
const RELATIONSHIP_STATUSES = ["Active", "Inactive", "Closed"] as const;

type FormState = {
  relationship_name: string;
  engagement_type: string;
  relationship_status: string;
  engagement_value: string; // string in form, coerced to number on submit
  org_notion_id: string;
  start_date: string;
  expected_close_date: string;
  notes: string;
};

const EMPTY: FormState = {
  relationship_name: "",
  engagement_type: "",
  relationship_status: "Active",
  engagement_value: "",
  org_notion_id: "",
  start_date: "",
  expected_close_date: "",
  notes: "",
};

export function NewEngagementForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setSaving(true);
    setErr(null);

    try {
      const payload = {
        relationship_name: form.relationship_name.trim(),
        engagement_type: form.engagement_type || null,
        relationship_status: form.relationship_status || null,
        engagement_value:
          form.engagement_value.trim() === ""
            ? null
            : Number.isFinite(Number(form.engagement_value))
              ? Number(form.engagement_value)
              : null,
        org_notion_id: form.org_notion_id.trim() || null,
        start_date: form.start_date || null,
        expected_close_date: form.expected_close_date || null,
        notes: form.notes.trim() || null,
      };

      if (!payload.relationship_name) {
        setErr("Relationship name is required.");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/admin/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string; row?: { id?: string } };
      if (!res.ok || !json.row?.id) {
        setErr(json.error ?? `Create failed (${res.status})`);
        setSaving(false);
        return;
      }
      router.push(`/admin/clients/${json.row.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <Field label="Relationship name (required)">
          <input
            type="text"
            required
            value={form.relationship_name}
            onChange={(e) => update("relationship_name", e.target.value)}
            style={inputStyle()}
            placeholder="e.g. Engatel · Q2 retainer"
          />
        </Field>
        <Field label="Engagement type">
          <select
            value={form.engagement_type}
            onChange={(e) => update("engagement_type", e.target.value)}
            style={inputStyle()}
          >
            <option value="">—</option>
            {ENGAGEMENT_TYPES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Relationship status">
          <select
            value={form.relationship_status}
            onChange={(e) => update("relationship_status", e.target.value)}
            style={inputStyle()}
          >
            <option value="">—</option>
            {RELATIONSHIP_STATUSES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Engagement value (USD)">
          <input
            type="number"
            step="any"
            value={form.engagement_value}
            onChange={(e) => update("engagement_value", e.target.value)}
            style={inputStyle()}
          />
        </Field>
        <Field label="Org notion_id (optional)">
          <input
            type="text"
            value={form.org_notion_id}
            onChange={(e) => update("org_notion_id", e.target.value)}
            style={inputStyle()}
            placeholder="links to organizations.notion_id"
          />
        </Field>
        <Field label="Start date">
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => update("start_date", e.target.value)}
            style={inputStyle()}
          />
        </Field>
        <Field label="Expected close">
          <input
            type="date"
            value={form.expected_close_date}
            onChange={(e) => update("expected_close_date", e.target.value)}
            style={inputStyle()}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={3}
          style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
        <button
          type="submit"
          disabled={saving}
          className="hall-btn-primary"
          style={{ padding: "8px 18px", fontSize: 12, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Creating…" : "Create engagement"}
        </button>
        {err && (
          <span
            className="text-[11px]"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
          >
            {err}
          </span>
        )}
      </div>
    </form>
  );
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
