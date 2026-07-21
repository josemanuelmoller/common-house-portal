"use client";

import { useState } from "react";

/**
 * Inline preview box for a same-origin HTML presentation (deck). Lazy: shows a
 * poster and only mounts the (heavy) iframe when the viewer clicks Preview, so
 * the room stays light on load. "Fullscreen" opens the deck in a new tab.
 */
export function DeckEmbed({ url, title }: { url: string; title: string }) {
  const [live, setLive] = useState(false);
  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", border: "1px solid var(--hall-line)", background: "#0a0a0a" }}>
        {live ? (
          <iframe
            src={url}
            title={title}
            loading="lazy"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setLive(true)}
            aria-label={`Preview ${title}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "#0a0a0a", color: "#f3f4ef" }}
          >
            <span style={{ width: 58, height: 58, borderRadius: "50%", border: "1.5px solid rgba(243,244,239,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, paddingLeft: 4 }}>▶</span>
            <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.85 }}>Preview presentation</span>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{title}</span>
        <a className="text-[11px] hover:underline" href={url} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>Fullscreen ↗</a>
      </div>
    </div>
  );
}
