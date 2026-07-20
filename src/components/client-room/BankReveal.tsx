"use client";

import { useState } from "react";
import { CopyButton } from "@/components/client-room/CopyButton";

/**
 * Bank details are collapsed by default — click "Ver detalles bancarios" to
 * reveal. Avoids showing account numbers casually; copy button for quick paste.
 */
export function BankReveal({ details }: { details: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="hall-btn-outline mt-3" onClick={() => setOpen(true)}>Ver detalles bancarios</button>
    );
  }
  return (
    <div className="mt-3 p-3" style={{ background: "var(--hall-lime-paper)", border: "1px solid var(--hall-lime)", borderRadius: 8 }}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-lime-ink)" }}>Datos bancarios</p>
        <span className="flex items-center gap-2">
          <CopyButton text={details} label="Copiar" />
          <button type="button" className="hall-btn-ghost" onClick={() => setOpen(false)}>Ocultar</button>
        </span>
      </div>
      <div className="text-[12.5px] leading-[1.6]" style={{ whiteSpace: "pre-line" }}>{details}</div>
    </div>
  );
}
