/**
 * office-text-extract.ts — minimal serverless-safe text extraction for
 * .docx and .pptx files. Avoids `officeparser` which uses dynamic imports
 * (file-type, etc.) that Vercel's lambda tracer fails to bundle.
 *
 * Tradeoff: text only. Layout, tables (in docx), images, charts, and
 * embedded objects are NOT extracted. For Phase B (proposal drafting) this
 * is acceptable for text-heavy decks/reports. For image-heavy materials,
 * the user is told to "Save as PDF" and use the native PDF path instead.
 */

import mammoth from "mammoth";
import JSZip from "jszip";

/** Extract raw text from a DOCX buffer using mammoth. */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Extract text from a PPTX buffer.
 *
 * PPTX is a ZIP archive. Slide text lives in `ppt/slides/slideN.xml` and
 * speaker notes in `ppt/notesSlides/notesSlideN.xml`. Inside those XML
 * files all visible text is wrapped in `<a:t>...</a:t>` runs. We extract
 * those, decode XML entities, and emit a deterministic per-slide layout
 * so the drafter can reason about slide order.
 */
export async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

  type SlideEntry = { num: number; text: string; notes: string };
  const byNum = new Map<number, SlideEntry>();

  const get = (n: number): SlideEntry => {
    const existing = byNum.get(n);
    if (existing) return existing;
    const fresh: SlideEntry = { num: n, text: "", notes: "" };
    byNum.set(n, fresh);
    return fresh;
  };

  const tasks: Promise<void>[] = [];
  zip.forEach((path, file) => {
    const slideMatch = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    const notesMatch = path.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
    if (!slideMatch && !notesMatch) return;

    tasks.push(
      file.async("string").then((xml: string) => {
        const text = extractATText(xml);
        if (slideMatch) {
          get(parseInt(slideMatch[1], 10)).text = text;
        } else if (notesMatch) {
          get(parseInt(notesMatch[1], 10)).notes = text;
        }
      }),
    );
  });

  await Promise.all(tasks);

  const ordered = Array.from(byNum.values()).sort((a, b) => a.num - b.num);

  return ordered
    .map((s) => {
      const lines = [`=== Slide ${s.num} ===`];
      if (s.text.trim()) lines.push(s.text.trim());
      if (s.notes.trim()) lines.push(`[Speaker notes]: ${s.notes.trim()}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function extractATText(xml: string): string {
  const matches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? [];
  const decoded = matches.map((m) => {
    const inner = m.replace(/^<a:t[^>]*>/, "").replace(/<\/a:t>$/, "");
    return decodeXmlEntities(inner);
  });
  // Slide text runs frequently break a single sentence into several <a:t>
  // segments (formatting changes). Join with a space so word boundaries
  // are preserved without inserting spurious newlines.
  return decoded.join(" ").replace(/[ \t]+/g, " ").trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "");
}
