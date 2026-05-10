import type { MetadataRoute } from "next";

// Common House PWA manifest.
// Metadata API: Next.js serves this at /manifest.webmanifest with correct content-type.
// Phase 1: install + standalone display + icons. Share target + shortcuts arrive in later phases.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Common House",
    short_name: "Common House",
    description:
      "Common House operating system — Hall, plan, evidence, decisions, captures.",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Hall tokens. Keep in sync with --hall-ink-0 / --hall-paper-0 in globals.css.
    background_color: "#FAFAF7",
    theme_color: "#0E0E10",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
