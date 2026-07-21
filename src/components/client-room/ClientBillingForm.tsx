"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ClientBillingProfile } from "@/lib/client-room";

const fieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--hall-line)",
  background: "var(--hall-paper-1)",
  borderRadius: 6,
  padding: "9px 11px",
  fontSize: 13,
  color: "var(--hall-ink-0)",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontFamily: "var(--font-hall-mono)",
  fontSize: 9,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--hall-muted-2)",
};

type Fields = {
  legalName: string;
  taxId: string;
  address: string;
  billingEmail: string;
  billingContact: string;
  poReference: string;
  notes: string;
};

function toFields(p: ClientBillingProfile | null): Fields {
  return {
    legalName: p?.legalName ?? "",
    taxId: p?.taxId ?? "",
    address: p?.address ?? "",
    billingEmail: p?.billingEmail ?? "",
    billingContact: p?.billingContact ?? "",
    poReference: p?.poReference ?? "",
    notes: p?.notes ?? "",
  };
}

/**
 * Client-facing invoicing form inside the room's Administrative section.
 * The client fills their own billing details so Common House can invoice them.
 * Editable for collaborator/approver; viewers see it read-only.
 */
export function ClientBillingForm({
  projectId,
  profile,
  canEdit,
}: {
  projectId: string;
  profile: ClientBillingProfile | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Fields>(toFields(profile));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Fields) => (e: { target: { value: string } }) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  const hasAny = Object.values(fields).some((v) => v.trim());

  // Collapsed by default — a long form open by default reads as clutter.
  if (!open) {
    const label = !canEdit
      ? "Ver tus datos de facturación"
      : hasAny ? "Editar tus datos de facturación" : "Agregar tus datos de facturación";
    return (
      <div className="flex items-center gap-3">
        <button type="button" className="hall-btn-outline" onClick={() => setOpen(true)}>{label}</button>
        {hasAny && <span className="text-[11px]" style={{ color: "var(--hall-lime-ink)" }}>✓ Cargados</span>}
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/billing-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Error ${res.status}`);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  // Read-only view for viewers.
  if (!canEdit) {
    if (!hasAny) {
      return (
        <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>
          Aún no se han cargado los datos de facturación.
        </p>
      );
    }
    const rows = ([
      ["Razón social", fields.legalName],
      ["ID fiscal (RUT / VAT / N.º empresa)", fields.taxId],
      ["Dirección", fields.address],
      ["Email de facturación", fields.billingEmail],
      ["Contacto", fields.billingContact],
      ["Orden de compra / referencia", fields.poReference],
      ["Notas", fields.notes],
    ] as Array<[string, string]>).filter(([, v]) => v.trim());
    return (
      <div>
        <div className="flex justify-end mb-2"><button type="button" className="hall-btn-ghost" onClick={() => setOpen(false)}>Ocultar</button></div>
        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <p style={labelStyle}>{label}</p>
              <p className="text-[13px]" style={{ whiteSpace: "pre-line" }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-[12px] leading-[1.55]" style={{ color: "var(--hall-muted-2)" }}>
        Completa los datos con los que Common House debe emitir la factura. Puedes editarlos cuando quieras.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label><span style={labelStyle}>Razón social</span><input style={fieldStyle} value={fields.legalName} onChange={set("legalName")} placeholder="Nombre legal de la empresa" /></label>
        <label><span style={labelStyle}>ID fiscal · RUT / VAT / N.º empresa</span><input style={fieldStyle} value={fields.taxId} onChange={set("taxId")} placeholder="Identificador tributario" /></label>
        <label><span style={labelStyle}>Email de facturación</span><input type="email" style={fieldStyle} value={fields.billingEmail} onChange={set("billingEmail")} placeholder="donde enviar la factura" /></label>
        <label><span style={labelStyle}>Contacto de facturación</span><input style={fieldStyle} value={fields.billingContact} onChange={set("billingContact")} placeholder="nombre de la persona" /></label>
        <label><span style={labelStyle}>Orden de compra / referencia <span style={{ textTransform: "none" }}>(opcional)</span></span><input style={fieldStyle} value={fields.poReference} onChange={set("poReference")} placeholder="N.º de PO si aplica" /></label>
      </div>
      <label className="block"><span style={labelStyle}>Dirección de facturación</span><textarea style={{ ...fieldStyle, minHeight: 64, resize: "vertical" }} value={fields.address} onChange={set("address")} placeholder="Calle, ciudad, país, código postal" /></label>
      <label className="block"><span style={labelStyle}>Notas / instrucciones <span style={{ textTransform: "none" }}>(opcional)</span></span><textarea style={{ ...fieldStyle, minHeight: 52, resize: "vertical" }} value={fields.notes} onChange={set("notes")} placeholder="Cualquier instrucción especial de facturación" /></label>
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" className="hall-btn-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar datos"}</button>
        <button type="button" className="hall-btn-ghost" onClick={() => setOpen(false)}>Ocultar</button>
        {saved && <span className="text-[11px]" style={{ color: "var(--hall-lime-ink)" }}>✓ Guardado</span>}
        {error && <span className="text-[11px]" style={{ color: "var(--hall-danger, #b91c1c)" }}>{error}</span>}
      </div>
    </form>
  );
}
