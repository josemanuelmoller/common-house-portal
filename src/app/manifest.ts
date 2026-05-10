import type { MetadataRoute } from "next";

// Common House PWA manifest.
// Metadata API: Next.js serves this at /manifest.webmanifest with correct content-type.
//
// Includes:
//   - install metadata (name, icons, theme, scope)
//   - share_target → POSTs to /api/inbox/share-target so Android share sheet
//     can route notes / links / photos into the inbox (Fase 2)
//   - shortcuts → long-press launcher icon shows "Captura" and "Bandeja"
//     (paths land in surfaces built in Fase 3)
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
    shortcuts: [
      {
        name: "Captura rápida",
        short_name: "Capturar",
        description: "Nueva nota, foto, voz o recordatorio",
        url: "/admin/capture/new",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
      },
      {
        name: "Bandeja",
        short_name: "Bandeja",
        description: "Capturas pendientes y recordatorios activos",
        url: "/admin/capture",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
      },
    ],
    // Web Share Target API. Android Share menu will list "Common House"
    // when sharing text/links/images. Receiver: src/app/api/inbox/share-target/route.ts.
    // Type cast: MetadataRoute.Manifest in Next.js 16 doesn't yet expose share_target
    // in its public type, but it serializes any extra fields onto the JSON.
    ...({
      share_target: {
        action: "/api/inbox/share-target",
        method: "POST",
        enctype: "multipart/form-data",
        params: {
          title: "title",
          text: "text",
          url: "url",
          files: [
            {
              name: "file",
              accept: ["image/*"],
            },
          ],
        },
      },
    } as Record<string, unknown>),
  };
}
