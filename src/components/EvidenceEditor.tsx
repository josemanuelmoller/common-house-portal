"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const VALIDATION = ["New", "Reviewed", "Validated", "Rejected", "Superseded", "Archived"] as const;
const CONFIDENCE = ["Low", "Medium", "High"] as const;
const REUSABILITY = ["Single-use", "Candidate-reusable", "Reusable"] as const;
const RESOLUTION = ["Open", "Resolved", "Stale"] as const;

type Props = {
  evidenceId: string;
  initial: {
    validation_status?: string | null;
    confidence_level?: string | null;
    reusability_level?: string | null;
    resolution_status?: string | null;
    evidence_statement?: string | null;
  };
  /** Optional inline / compact / dialog hint. Default inline. */
  variant?: "inline" | "card";
};

export function EvidenceEditor({ evidenceId, initial, variant = "inline" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    validation_status:  initial.validation_status  ?? "",
    confidence_level:   initial.confidence_level   ?? "",
    reusability_level:  initial.reusability_level  ?? "",
    resolution_status:  initial.resolution_status  ?? "",
    evidence_statement: initial.evidence_statement ?? "",
  });

  if (!open) {
    return (
      <button
        type="button"
        className="text-[10px] uppercase tracking-widest px-2 py-1 rounded border"
        style={{
          fontFamily: "var(--font-hall-mono)",
          color: "var(--hall-muted-2)",
          borderColor: "var(--hall-rule-1)",
          background: "transparent",
        }}
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) body[k] = v === "" ? null : v;
      const res = await fetch(`/api/admin/evidence/${evidenceId}`, {
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
      className={variant === "card" ? "p-4 rounded-lg space-y-3 mt-2" : "p-3 rounded space-y-2 mt-2"}
      style={{ background: "var(--hall-paper-1)", border: "1px solid var(--hall-rule-1)" }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Sel label="Validation"  value={form.validation_status}  options={VALIDATION}  onChange={(v) => setForm((s) => ({ ...s, validation_status: v }))} />
        <Sel label="Confidence"  value={form.confidence_level}   options={CONFIDENCE}  onChange={(v) => setForm((s) => ({ ...s, confidence_level: v }))} />
        <Sel label="Reusability" value={form.reusability_level}  options={REUSABILITY} onChange={(v) => setForm((s) => ({ ...s, reusability_level: v }))} />
        <Sel label="Resolution"  value={form.resolution_status}  options={RESOLUTION}  onChange={(v) => setForm((s) => ({ ...s, resolution_status: v }))} />
      </div>

      <label className="block">
        <span
          className="block text-[9px] uppercase tracking-widest mb-1"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Statement
        </span>
        <textarea
          rows={3}
          className="w-full text-[11px] px-2 py-1.5 rounded"
          style={{
            fontFamily: "var(--font-hall-sans)",
            background: "var(--hall-paper-0)",
            border: "1px solid var(--hall-rule-1)",
            color: "var(--hall-ink-0)",
          }}
          value={form.evidence_statement}
          onChange={(e) => setForm((s) => ({ ...s, evidence_statement: e.target.value }))}
        />
      </label>

      {error && (
        <p className="text-[10px]" style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="hall-btn-primary text-[10px] uppercase tracking-widest px-3 py-1 rounded"
          style={{ fontFamily: "var(--font-hall-mono)" }}
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="text-[10px] uppercase tracking-widest px-3 py-1 rounded border"
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

function Sel<T extends readonly string[]>({
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
    <label className="block">
      <span
        className="block text-[9px] uppercase tracking-widest mb-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </span>
      <select
        className="w-full text-[11px] px-1.5 py-1 rounded"
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
    </label>
  );
}
