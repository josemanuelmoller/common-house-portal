/**
 * Drive folder constants — importable en Client Components sin arrastrar googleapis.
 */
export const DEFAULT_FOLDERS = [
  { name: "💰 Finanzas",       description: "OC, facturas, presupuestos" },
  { name: "📋 Documentación",  description: "Contratos, acuerdos, briefings" },
  { name: "📊 Presentaciones", description: "Decks, pitches, reportes" },
  { name: "🎨 Multimedia",     description: "Imágenes, videos, assets" },
] as const;

export type FolderName = typeof DEFAULT_FOLDERS[number]["name"];
