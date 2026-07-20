"use client";

/**
 * Inline PDF preview for a same-origin document (served by the /materials/[id]/file
 * route). The browser renders it natively — no runtime, no external viewer, works
 * for a client logged into the room. Download button forces a save.
 */
export function PdfEmbed({ url, title }: { url: string; title: string }) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ width: "100%", height: 520, borderRadius: 10, overflow: "hidden", border: "1px solid var(--hall-line)", background: "var(--hall-paper-2)" }}>
        <iframe src={`${url}#toolbar=1&view=FitH`} title={title} style={{ width: "100%", height: "100%", border: 0 }} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{title}</span>
        <span className="flex items-center gap-3">
          <a className="text-[11px] hover:underline" href={`${url}?download=1`} style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Descargar ↓</a>
          <a className="text-[11px] hover:underline" href={url} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Pantalla completa ↗</a>
        </span>
      </div>
    </div>
  );
}
