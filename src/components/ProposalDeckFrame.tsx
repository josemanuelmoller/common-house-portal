"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ProposalDeckFrame — embeds a static HTML deck in a 16:9 (or 4:3) iframe and
 * exposes a fullscreen toggle. The deck itself owns slide navigation (arrow
 * keys, click-to-advance, etc.) — this component only handles framing.
 */

type Props = {
  src: string;
  aspect: "16:9" | "4:3";
  title: string;
};

export function ProposalDeckFrame({ src, aspect, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen state changes (esc key, browser UI, etc.)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Re-focus the iframe on mount + after fullscreen toggle so deck keyboard
  // shortcuts (← →) work without needing a manual click.
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const onLoad = () => {
      try { el.contentWindow?.focus(); } catch { /* cross-origin can throw, ignore */ }
    };
    el.addEventListener("load", onLoad);
    return () => el.removeEventListener("load", onLoad);
  }, []);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try { await el.requestFullscreen(); } catch { /* ignore */ }
    } else {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
    }
  }

  const aspectPadding = aspect === "16:9" ? "56.25%" : "75%";

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{
          background: "var(--hall-ink-0)",
          border: isFullscreen ? "none" : "1px solid var(--hall-ink-0)",
        }}
      >
        <div style={{ paddingTop: isFullscreen ? "0" : aspectPadding, position: "relative" }}>
          <iframe
            ref={iframeRef}
            src={src}
            title={title}
            className="absolute inset-0 w-full h-full"
            style={{ border: "none", background: "white" }}
            allow="fullscreen"
            // sandbox left off so the deck's deck-stage.js can run scripts.
            // src is from /public so it shares origin with the host page.
          />
        </div>

        {/* Floating fullscreen toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded transition-opacity"
          style={{
            background: "rgba(10, 10, 10, 0.75)",
            color: "var(--hall-paper-0)",
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10.5,
            letterSpacing: "0.08em",
            border: "1px solid rgba(255, 255, 255, 0.15)",
          }}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? "EXIT FULLSCREEN ✕" : "FULLSCREEN ⛶"}
        </button>
      </div>

      <p
        className="text-center"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          color: "var(--hall-muted-3)",
          letterSpacing: "0.06em",
        }}
      >
        USE ← / → TO NAVIGATE SLIDES · CLICK INSIDE THE DECK FIRST IF KEYS DON&apos;T RESPOND
      </p>
    </div>
  );
}
