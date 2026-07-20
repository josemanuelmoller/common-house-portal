"use client";

import { useState } from "react";
import { CopyButton } from "@/components/client-room/CopyButton";
import type { BillingAccount } from "@/lib/client-room";

/**
 * Bank accounts are collapsed by default — click "Ver detalles bancarios" to
 * reveal. Each account (USD, GBP, local/international) is its own block with a
 * copy button; avoids showing account numbers casually.
 */
export function BankReveal({ accounts }: { accounts: BillingAccount[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="hall-btn-outline mt-3" onClick={() => setOpen(true)}>Ver detalles bancarios</button>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-lime-ink)" }}>Datos bancarios</p>
        <button type="button" className="hall-btn-ghost" onClick={() => setOpen(false)}>Ocultar</button>
      </div>
      {accounts.map((acc, i) => (
        <div key={`${acc.title}-${i}`} className="p-3" style={{ background: "var(--hall-lime-paper)", border: "1px solid var(--hall-lime)", borderRadius: 8 }}>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className="text-[12px] font-bold">{acc.title || "Cuenta"}</p>
            <CopyButton text={`${acc.title}\n${acc.details}`.trim()} label="Copiar" />
          </div>
          <div className="text-[12.5px] leading-[1.6]" style={{ whiteSpace: "pre-line" }}>{acc.details}</div>
        </div>
      ))}
    </div>
  );
}
