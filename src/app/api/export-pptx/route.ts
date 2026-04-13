import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { notion } from "@/lib/notion";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require("pptxgenjs");

export const maxDuration = 60;

// ─── CH brand colors ──────────────────────────────────────────────────────────
const C = {
  dark:   "131218",
  light:  "EEEEE8",
  lime:   "c8f55a",
  white:  "FFFFFF",
  border: "E0E0D8",
  muted:  "9999aa",
};

// ─── Parse slideHtml into structured slides ───────────────────────────────────

type ParsedSlide = {
  dark: boolean;
  eyebrow: string;
  title: string;
  titleAccent: string;   // italic bold lime word (from <em>)
  subtitle: string;
  bullets: string[];
  stats: { value: string; label: string }[];
  body: string;
};

function parseHtmlSlides(html: string): ParsedSlide[] {
  const slides: ParsedSlide[] = [];

  // Split by <section (each section = one slide)
  const sections = html.split(/<section[^>]*>/i).slice(1);

  for (const sec of sections) {
    const content = sec.split(/<\/section>/i)[0] ?? sec;

    // Detect dark slide
    const dark = /background[:\s]*#?131218|bg-dark|class="[^"]*dark/i.test(content);

    // Eyebrow: small uppercase tracking text (often in <p> with small font-size or data-eyebrow)
    const eyebrowMatch = content.match(/<p[^>]*(?:eyebrow|tracking|uppercase|letter-spacing)[^>]*>([^<]{3,60})<\/p>/i)
      ?? content.match(/<!--\s*eyebrow\s*-->\s*<[^>]+>([^<]{3,60})<\//i);
    const eyebrow = eyebrowMatch ? stripTags(eyebrowMatch[1]).trim() : "";

    // Title: first h1 or h2
    const h1Match = content.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    let titleRaw = h1Match ? h1Match[1] : "";
    // Extract <em> accent word
    const emMatch = titleRaw.match(/<em[^>]*>([\s\S]*?)<\/em>/i);
    const titleAccent = emMatch ? stripTags(emMatch[1]).trim() : "";
    // Remove em from title
    titleRaw = titleRaw.replace(/<em[^>]*>[\s\S]*?<\/em>/gi, "").trim();
    const title = stripTags(titleRaw).trim();

    // Subtitle: second p or <p class="subtitle"> or first p after h1
    const h1End = h1Match ? content.indexOf(h1Match[0]) + h1Match[0].length : 0;
    const afterH1 = content.slice(h1End);
    const subMatch = afterH1.match(/<p[^>]*>([^<]{10,200})<\/p>/i);
    const subtitle = subMatch ? stripTags(subMatch[1]).trim() : "";

    // Bullets: li elements
    const bullets: string[] = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(content)) !== null) {
      const text = stripTags(liMatch[1]).trim();
      if (text && text.length < 300) bullets.push(text);
    }

    // Stats: look for large numbers (often in spans/divs with big font-size)
    const stats: { value: string; label: string }[] = [];
    // Pattern: big number followed by a label
    const statRegex = /<[^>]+(?:font-size:\s*[3-9]\d|font-weight:\s*9|text-[34]xl)[^>]*>([^<]{1,20})<\/[^>]+>\s*<[^>]+>([^<]{2,60})<\/[^>]+>/gi;
    let statMatch;
    while ((statMatch = statRegex.exec(content)) !== null) {
      const val = stripTags(statMatch[1]).trim();
      const lbl = stripTags(statMatch[2]).trim();
      if (val && lbl && val.length < 20) stats.push({ value: val, label: lbl });
    }

    // Body text: first substantial paragraph that isn't subtitle
    const bodyMatches = [...content.matchAll(/<p[^>]*>([^<]{30,500})<\/p>/gi)];
    const body = bodyMatches.length > 1
      ? bodyMatches.slice(1).map(m => stripTags(m[1]).trim()).join(" ").slice(0, 400)
      : "";

    if (title || bullets.length || stats.length) {
      slides.push({ dark, eyebrow, title, titleAccent, subtitle, bullets, stats, body });
    }
  }

  return slides;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

// ─── Build PPTX from parsed slides ───────────────────────────────────────────

function buildPptx(slides: ParsedSlide[], title: string): Buffer {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 16:9, 10" × 5.625"

  // Slide master defaults
  pptx.defineSlideMaster({
    title: "CH_MASTER",
    background: { color: C.light },
  });

  // If no slides parsed, make a single "no content" slide
  if (slides.length === 0) {
    const s = pptx.addSlide();
    s.background = { color: C.dark };
    s.addText(title || "No content", {
      x: 0.6, y: 2.2, w: 8.8, h: 1.2,
      fontSize: 32, color: C.white, bold: false,
    });
    return Buffer.from(pptx.write({ outputType: "arraybuffer" }));
  }

  for (const slide of slides) {
    const s = pptx.addSlide();
    s.background = { color: slide.dark ? C.dark : C.light };

    const textColor = slide.dark ? C.white : C.dark;
    let yPos = 0.55;

    // Eyebrow
    if (slide.eyebrow) {
      s.addText(slide.eyebrow.toUpperCase(), {
        x: 0.6, y: yPos, w: 8.8, h: 0.22,
        fontSize: 8, color: slide.dark ? "ffffff55" : "13121855",
        bold: true, charSpacing: 3,
      });
      yPos += 0.3;
    }

    // Title + accent
    if (slide.title || slide.titleAccent) {
      const parts: PptxTextPart[] = [];
      if (slide.title) {
        parts.push({ text: slide.title + (slide.titleAccent ? " " : ""), options: { bold: false, color: textColor } });
      }
      if (slide.titleAccent) {
        parts.push({ text: slide.titleAccent, options: { bold: true, italic: true, color: C.lime } });
      }
      s.addText(parts, {
        x: 0.6, y: yPos, w: 8.8, h: slide.bullets.length > 0 ? 1.1 : 1.6,
        fontSize: slide.eyebrow ? 30 : 36, valign: "top",
      });
      yPos += slide.eyebrow ? 1.25 : 1.7;
    }

    // Subtitle
    if (slide.subtitle && !slide.bullets.length) {
      s.addText(slide.subtitle, {
        x: 0.6, y: yPos, w: 8.8, h: 0.6,
        fontSize: 14, color: slide.dark ? "ffffff66" : "13121866",
      });
      yPos += 0.75;
    }

    // Stats row
    if (slide.stats.length > 0) {
      const statW = 8.8 / slide.stats.length;
      slide.stats.forEach((stat, i) => {
        s.addText(stat.value, {
          x: 0.6 + i * statW, y: yPos, w: statW - 0.2, h: 0.9,
          fontSize: 44, color: C.lime, bold: true, valign: "top",
        });
        s.addText(stat.label, {
          x: 0.6 + i * statW, y: yPos + 0.9, w: statW - 0.2, h: 0.4,
          fontSize: 12, color: textColor + "aa",
        });
      });
      yPos += 1.5;
    }

    // Bullets
    if (slide.bullets.length > 0) {
      const bulletItems = slide.bullets.slice(0, 6).map(b => ({
        text: b,
        options: { bullet: { type: "number" as const }, color: textColor, fontSize: 13, paraSpaceAfter: 6 },
      }));
      s.addText(bulletItems, {
        x: 0.6, y: yPos, w: 8.8, h: Math.min(slide.bullets.length * 0.45 + 0.3, 3.2),
        valign: "top",
      });
    }

    // Body fallback
    if (!slide.bullets.length && !slide.stats.length && slide.body) {
      s.addText(slide.body, {
        x: 0.6, y: yPos, w: 8.8, h: 2.5,
        fontSize: 13, color: textColor, wrap: true, valign: "top",
      });
    }

    // Slide number (bottom right, subtle)
    s.addText(String(slides.indexOf(slide) + 1), {
      x: 8.8, y: 5.2, w: 0.8, h: 0.25,
      fontSize: 8, color: slide.dark ? "ffffff33" : "13121833", align: "right",
    });
  }

  return Buffer.from(pptx.write({ outputType: "arraybuffer" }));
}

// pptxgenjs text part type
type PptxTextPart = { text: string; options: object };

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { pageId } = await req.json();
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  // Read page from Notion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.retrieve({ page_id: pageId }) as any;
  const props = page.properties;
  const pageTitle: string = props["Title"]?.title?.[0]?.plain_text ?? "Common House";
  const slideHtml: string = props["Slide HTML"]?.rich_text?.map((r: { plain_text: string }) => r.plain_text).join("") ?? "";

  let buffer: Buffer;

  if (slideHtml) {
    const slides = parseHtmlSlides(slideHtml);
    buffer = buildPptx(slides, pageTitle);
  } else {
    // No HTML — make a minimal title-only deck
    const slides: ParsedSlide[] = [{
      dark: true,
      eyebrow: "Common House",
      title: pageTitle,
      titleAccent: "",
      subtitle: "No slide content generated yet.",
      bullets: [],
      stats: [],
      body: "",
    }];
    buffer = buildPptx(slides, pageTitle);
  }

  const slug = pageTitle.slice(0, 60).replace(/[^a-z0-9 ]/gi, "_");
  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${slug}.pptx"`,
    },
  });
}
