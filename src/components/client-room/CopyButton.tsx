"use client";

import { useState } from "react";

/** Copies `text` to the clipboard with brief "Copiado" feedback. */
export function CopyButton({ text, label = "Copiar", className = "hall-btn-ghost" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch { /* clipboard blocked — no-op */ }
  }
  return (
    <button type="button" className={className} onClick={() => void copy()}>
      {done ? "Copiado ✓" : label}
    </button>
  );
}
