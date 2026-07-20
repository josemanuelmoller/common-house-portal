"use client";

/**
 * Inline Google Slides preview. Embeds the presentation via its /embed URL so it
 * shows inside the room like a native deck, plus an "open in Slides" link. Note:
 * for a client (not logged into the owner's Google) to see it, the deck must be
 * shared "anyone with the link (viewer)". For fully self-contained + downloadable,
 * prefer exporting to PDF and uploading.
 */
export function SlidesEmbed({ embedUrl, openUrl, title }: { embedUrl: string; openUrl: string; title: string }) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", border: "1px solid var(--hall-line)", background: "var(--hall-paper-2)" }}>
        <iframe src={embedUrl} title={title} allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{title}</span>
        <a className="text-[11px] hover:underline" href={openUrl} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Abrir en Slides ↗</a>
      </div>
    </div>
  );
}
