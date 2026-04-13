import Anthropic from "@anthropic-ai/sdk";
import { notion, DB } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Brand context (base) ─────────────────────────────────────────────────────

const CH_BRAND_CONTEXT = `
ABOUT COMMON HOUSE:
Common House is a startup ecosystem operator and portfolio accelerator based in London and LATAM.
They work with early-stage startups in circular economy, sustainable retail, and impact sectors.
Key portfolio: iRefill (refill station network), SUFI (financial inclusion), Fair Cycle (circular fashion), Auto Mercado (sustainable grocery), Beeok, Yenxa.
Investors and funders: impact-focused, ESG-aligned, LATAM and UK.

BRAND VOICE (default):
- Confident but not arrogant. Founder-facing, not corporate.
- Data-informed: uses specific numbers and outcomes when available, not vague claims.
- Warm ecosystem tone: we're insiders talking to other insiders.
- Clear and direct. Avoids buzzword overload ("synergy", "leverage", "unlock").
- Spanish or English depending on audience. Mix only if intentional.
`.trim();

// ─── Visual content types ─────────────────────────────────────────────────────

const VISUAL_TYPES = new Set(["Deck", "One-pager", "Proposal", "Offer Deck", "Exec Summary"]);

// ─── Channel × Format instruction matrix ─────────────────────────────────────
// Each combination produces genuinely different structure, length, and tone rules.

const CHANNEL_FORMAT_INSTRUCTIONS: Record<string, Record<string, string>> = {

  "LinkedIn": {
    "Post corto": `Write a LinkedIn post. Target length: 150–250 words.
STRUCTURE:
- Line 1: Hook — one sentence that stops the scroll. A surprising stat, contrarian take, or bold claim. No intro, no "I've been thinking about...".
- Lines 2–8: 2–3 short paragraphs (1–2 lines each). Develop one idea with a real example or number. White space is intentional — blank lines between paragraphs.
- Final line: A question or soft CTA that invites engagement ("What's your experience with this?" / "Worth a conversation — DM me.").
- Optional: 3–4 hashtags on their own last line.
RULES: No markdown headers. No bullet lists inside the post. First person. One idea only — resist adding more.`,

    "Artículo": `Write a LinkedIn article. Target length: 700–1000 words.
STRUCTURE:
- Headline: 8–12 words. Clear, slightly provocative, SEO-aware.
- Intro paragraph (80–100 words): State the problem or insight directly. No fluff opener. Tell the reader exactly what they'll get.
- 3–4 ## sections: Each section makes one argument with supporting evidence or example.
- Closing (80 words): Practical takeaway + one forward-looking sentence. No "In conclusion".
RULES: Use ## headers. Data and real examples required in every section. Professional but personal — first person allowed. Avoid "In today's rapidly changing world" and any hollow opener.`,

    "Commentary": `Write a LinkedIn commentary. Target length: 100–160 words.
STRUCTURE:
- Line 1: Reference the trigger briefly (article, news, event, post). One sentence max.
- Lines 2–4: Your reaction — direct, specific, opinionated. Take a clear side. No "it depends" hedging.
- Final line: What this means or what should happen next. One sentence, forward-looking.
RULES: Written as genuine reaction, not summary. Every sentence must add a new idea. Short. No "Great point!" or soft openers. No hashtags.`,
  },

  "Instagram": {
    "Caption": `Write an Instagram caption. Target length: 90–160 words.
STRUCTURE:
- Line 1: Hook — bold statement or provocative question. This appears above the "more" fold — make it count.
- Lines 2–5: Story or insight in very short paragraphs (1–2 lines each). White space = visual rhythm.
- Closing line: Soft CTA — "Save this", "Tag someone who needs to read this", "Tell me in the comments".
- Last line: 8–12 relevant hashtags, separated from body by a blank line.
RULES: Emojis allowed sparingly (1–3 max, only where they add meaning, not decoration). Conversational and warm, not corporate. Hashtags always on their own final line.`,

    "Carrusel": `Write an Instagram carousel. Format as labeled slides.
OUTPUT FORMAT — write each slide explicitly:
SLIDE 1 (Cover): One bold claim or question. Max 8 words. This is the scroll-stopper.
SLIDES 2–6 (Content): One insight per slide. Each slide = one short title (5–7 words) + 1–2 supporting sentences. Progressive logic — each slide builds on the previous.
SLIDE 7 (Takeaway, optional): "What this means for you" — one practical action or insight.
SLIDE 8 / LAST (CTA): "Save this / Follow for more / Comment [X] if..."
RULES: Each slide must be readable standalone. Short text per slide — these are visual, not essays. Output each slide labeled clearly as SLIDE 1, SLIDE 2, etc.`,
  },

  "Newsletter": {
    "Bloque": `Write a newsletter section block. Target length: 130–200 words.
STRUCTURE:
- Section eyebrow + header: e.g. "🔍 SEÑAL DE LA SEMANA" followed by a bold title on the next line.
- 2–3 paragraphs: context → insight → implication. Each paragraph 2–3 sentences.
- Closing sentence: Clear one-line takeaway or "what to watch".
- Optional: One link or CTA at the end.
RULES: This is ONE section inside a larger newsletter — no full intro or outro for the whole issue. Data or real example required. Moderate formality: smart but approachable. Third person or first person depending on voice profile.`,

    "Intro": `Write a newsletter intro section. Target length: 80–120 words.
STRUCTURE:
- Opening: Warm but direct. Set the theme for this issue — what's the thread that connects it?
- 1–2 sentences: What's inside and why it matters *this week specifically*.
- Bridge sentence: Lead the reader into the first section without listing everything.
RULES: Personal and conversational — first person preferred ("This week I've been sitting with a question..."). No headers or bullet points. No "In this edition you will find...". Don't summarise every article — create anticipation. Reads like a letter, not a table of contents.`,

    "Full Issue": `Write a complete newsletter issue. Target length: 500–750 words.
STRUCTURE:
1. Subject line: One suggestion, in brackets at the top — [Subject: ...]
2. Intro (70–90 words): Warm opener that sets the issue theme. See Intro rules above.
3. ## Signal / Insight (150 words): Key story, data point, or development. Header + 3 short paragraphs.
4. ## Analysis (130 words): What it means. One clear argument with evidence.
5. ## What to do / Read next (100 words): One actionable recommendation or resource.
6. Closing (50 words): Human sign-off. One personal note + one soft CTA.
RULES: Each section has a clear ## header. Mix of prose and short lists acceptable. Ends with a human sign-off — not "Best regards", something real.`,
  },

  "Web": {
    "Artículo": `Write a web article. Target length: 850–1300 words.
STRUCTURE:
- Title: Clear, SEO-optimised, 8–12 words. Include primary keyword.
- Intro (100 words): State the problem, why it matters now, what the reader will learn. No warm-up filler.
- 3–4 ## sections: Each = one argument, one piece of evidence, one example.
- Conclusion (80–100 words): Key takeaway + one forward-looking sentence.
RULES: SEO — primary keyword in title and first paragraph. Use ## and ### headers throughout. Third person or neutral — no "I" unless specified by voice profile. External references and data required. No "In conclusion", no throat-clearing opener.`,

    "Blog post": `Write a blog post. Target length: 450–700 words.
STRUCTURE:
- Title: Punchy and direct. Can be more personal or opinionated than a formal article.
- Opening (60 words): Start with a specific story, scene, or moment — not a thesis statement. Hook via narrative.
- 2–3 informal sections (light ## headers): Each flows naturally from the opening story.
- Closing (60 words): Personal reflection + one specific, low-friction CTA (subscribe / comment / share).
RULES: First person encouraged. More conversational than a formal article. One personal anecdote or lived example required — not just research. CTA at the end must be specific, not generic.`,
  },
};

// ─── Legacy fallback for older content types stored in Notion ─────────────────

const LEGACY_INSTRUCTIONS: Record<string, string> = {
  "LinkedIn Post":    CHANNEL_FORMAT_INSTRUCTIONS["LinkedIn"]["Post corto"],
  "Newsletter Block": CHANNEL_FORMAT_INSTRUCTIONS["Newsletter"]["Bloque"],
  "Article Outline": `Create a structured article outline.
Format:
**Title:** [working title]
**Angle:** [1-sentence thesis]
**Estimated length:** [X words]

Then list 5–7 sections, each with:
- ## Section heading
  - 2–3 bullet points of key content, arguments, or examples for that section

End with: **Sources / data needed:** [list any specific data points to verify]`,
  "Commentary Note": `Write a brief internal commentary note (100–200 words).
Format:
**Topic:** [topic]
**Observation:** [what is happening — 2–3 sentences]
**Why it matters for CH:** [relevance — 2 sentences]
**Watch point / action:** [what CH should monitor or do — 1–2 sentences]
Tone: analytical, direct, internal. Not a press release.`,
  "Instagram Caption": CHANNEL_FORMAT_INSTRUCTIONS["Instagram"]["Caption"],
  "Internal Brief": `Write an internal brief.
Format:
**Objective:** [1 sentence]
**Background:** [2–3 sentences of context]
**Key Decisions Needed:**
- [Decision 1]
- [Decision 2]
- [Decision 3]
**Recommended Approach:** [1 short paragraph]
**Risks / Dependencies:** [2–3 bullets]
**Next Steps:**
- [ ] [Action] — Owner: [TBD] — By: [TBD]
- [ ] [Action] — Owner: [TBD] — By: [TBD]`,
};

// ─── HTML system prompts ──────────────────────────────────────────────────────

const HTML_SYSTEM_PROMPT = `You are a presentation designer and content strategist for Common House.
You generate complete, self-contained HTML documents — beautiful, minimal, professional.
Output ONLY raw HTML. No markdown, no explanation, no code fences. Just the full HTML document.`;

// Content types that render as a single page (not a slide carousel)
const ONE_PAGE_TYPES = new Set(["One-pager"]);

function buildOnePagerPrompt(brief: string, styleContext: string, contentType = "One-pager"): string {
  const typeStructure: Record<string, string> = {
    "One-pager": "Sections: Hero header, Problem (1–2 lines), Solution (2–3 lines), Impact/Traction (3 numbers in a row), Why Now (1–2 lines), CTA strip at bottom.",
    "Proposal":  "Sections: Hero (title + client + date), Context/Problem (2–3 lines), Proposed Approach (3 phases in a row), Deliverables (list), Timeline & Investment (side by side), Next Steps (3 bullets), CTA strip.",
    "Exec Summary": "Sections: Hero (title + date), Situation (2 lines), Key Findings (3 callout numbers), Recommendation (2–3 lines), Next Steps (3 bullets). Tight, decision-ready.",
    "Offer Deck": "Sections: Hero (offer name + tagline), The Opportunity (2 lines), What We Offer (3 service blocks side by side), Investment Tiers (2–3 tiers in a row), Why Common House (2–3 proof points), CTA.",
    "Deck":      "Sections: Hero (title + subtitle), Key Context (2 lines), 3 Main Points (cards in a row with icons), Supporting Data (2 numbers + label), Conclusion (1–2 lines), CTA strip.",
  };
  const structure = typeStructure[contentType] ?? typeStructure["One-pager"];

  return `${CH_BRAND_CONTEXT}

${styleContext ? `─── STYLE PROFILE ───\n${styleContext}\n` : ""}
─── REQUEST ───
Content type: ${contentType} (document mode — single page, PDF/print ready)
Brief: ${brief}

─── DOCUMENT LAYOUT INSTRUCTIONS ───
Create a single continuous page. All content visible at once — no slides, no navigation, no carousel.
${structure}

─── HTML REQUIREMENTS ───
Generate a complete, self-contained HTML5 document.

LAYOUT:
- Single page, NO slide navigation, NO click-to-advance
- Body: white background (#FFFFFF), width 900px, max-width 100%, centered with auto margins
- No overflow hidden — everything visible, no scrolling needed
- Print-ready: @media print { body { width: 100%; margin: 0; } }

SECTIONS:
1. HERO (dark): background #131218, padding 48px 56px. Large font-weight 300 title (2.8rem) + bold italic lime (#c8f55a) accent word. Eyebrow label above in 9px uppercase tracking-widest opacity 0.4. Subtitle in white/40.
2. PROBLEM + SOLUTION (light): background #EEEEE8, padding 40px 56px. Two columns side by side. Left: "Problema" label + 2-line text. Right: "Solución" label + 2-line text. Divider between them.
3. NUMBERS: white background, padding 40px 56px. Three stats side-by-side. Each: large number (3.5rem font-weight 900 #c8f55a) + label below in #131218/60.
4. WHY NOW (light): background #EEEEE8, padding 32px 56px. Single paragraph, max 2 sentences.
5. CTA STRIP (dark): background #131218, padding 28px 56px. Left: action text. Right: lime button pill.

DESIGN RULES:
- No shadows — use 1.5px borders #E0E0D8 between sections if needed
- Font: Inter (import from Google Fonts)
- Accent: #c8f55a (lime). Dark: #131218. Light bg: #EEEEE8. Border: #E0E0D8
- NO navigation arrows, NO slide counter, NO JS click handlers

OUTPUT: One complete HTML file. No external dependencies except Google Fonts Inter. All CSS in <style> tag. No JS needed.`;
}

function buildHtmlDeckPrompt(brief: string, contentType: string, styleContext: string): string {
  const typeInstructions: Record<string, string> = {
    "Deck": `Create a presentation deck with 8–12 slides. Each slide should have a clear title and 3–5 key points or one strong visual concept. Include: title slide, agenda/overview, 5–8 content slides, closing/CTA slide.`,
    "Proposal": `Create a proposal presentation with 6–8 slides: title, context/problem, proposed approach (3 phases), deliverables, timeline/investment framing, next steps.`,
    "Exec Summary": `Create a 3–4 slide executive summary using Situation → Complication → Resolution structure. Clean, data-forward, decision-ready.`,
    "Offer Deck": `Create a commercial offer deck with 6–8 slides: title + tagline, problem/opportunity, the offer (what we do + scope), delivery model (phases/timeline), investment range (tiers if applicable), why CH (credibility), next steps. Commercial and confident. Include specific numbers where given.`,
  };

  const instruction = typeInstructions[contentType] ?? typeInstructions["Deck"];

  return `${CH_BRAND_CONTEXT}

${styleContext ? `─── STYLE PROFILE ───\n${styleContext}\n` : ""}
─── REQUEST ───
Content type: ${contentType}
Brief: ${brief}

─── SLIDE DECK INSTRUCTIONS ───
${instruction}

─── HTML REQUIREMENTS ───
Generate a complete, self-contained HTML5 document with:

DESIGN SYSTEM:
- Background: #EEEEE8 (page bg) or #131218 (dark slides)
- Primary dark: #131218
- Accent lime: #c8f55a
- White: #FFFFFF
- Border: #E0E0D8
- Font: Inter (import from Google Fonts)
- No shadows — use borders and contrast instead

SLIDE LAYOUT:
- Each slide: full-viewport section (100vw × 100vh), flex layout
- Slide types: "dark" (#131218 bg, white text, lime accents), "light" (#EEEEE8 bg, dark text)
- Title slides: dark background, large font-weight 300 title + bold italic lime accent word
- Content slides: light background, left-aligned, clean grid
- Max 5 bullet points per slide — if more, split into 2 slides

NAVIGATION:
- Arrow key navigation (← →) between slides
- Slide counter bottom-right (e.g. "3 / 8")
- Click anywhere to advance
- IMPORTANT: expose navigation as window globals: window.nextSlide = nextSlide; window.prevSlide = prevSlide; so parent frame can control navigation

TYPOGRAPHY:
- Eyebrow labels: 9px, font-weight 700, letter-spacing 2.5px, uppercase, opacity 0.4
- Titles: 2.5–4rem, font-weight 300 + bold italic accent
- Body: 14–16px, font-weight 400, line-height 1.6
- Data callouts: large (3–5rem) font-weight 900, lime color

CARDS / BULLETS:
- Key points in white cards with 1.5px border #E0E0D8, border-radius 14px, padding 20px 24px
- Numbers/stats: large bold lime text above label text

OUTPUT: One complete HTML file. No external dependencies except Google Fonts Inter. All CSS inline in <style> tag. All JS inline in <script> tag.`;
}

// ─── Text prompt builder ──────────────────────────────────────────────────────

function buildTextPrompt(brief: string, contentType: string, platform: string, styleContext: string): string {
  // Try channel×format matrix first, then legacy map, then generic fallback
  const instruction =
    CHANNEL_FORMAT_INSTRUCTIONS[platform]?.[contentType]
    ?? LEGACY_INSTRUCTIONS[contentType]
    ?? `Create a draft for this ${contentType} request. Be specific, actionable, and on-brand.`;

  return [
    CH_BRAND_CONTEXT,
    "",
    styleContext ? `─── STYLE PROFILE ───\n${styleContext}` : "",
    "─── REQUEST ───",
    `Content type: ${contentType}`,
    platform ? `Platform: ${platform}` : "",
    `Brief: ${brief}`,
    "",
    "─── INSTRUCTIONS ───",
    instruction,
    "",
    "Generate the draft now. Output only the draft — no preamble, no explanation.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Chunk text for Notion rich_text (2000 char limit per object) ─────────────

function toRichText(text: string) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 1990) {
    chunks.push({ text: { content: text.slice(i, i + 1990) } });
  }
  return chunks;
}

// ─── Ensure Slide HTML property exists in Content Pipeline DB ─────────────────

let slideHtmlPropertyEnsured = false;
async function ensureSlideHtmlProperty() {
  if (slideHtmlPropertyEnsured) return;
  try {
    await notion.databases.update({
      database_id: DB.contentPipeline,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: { "Slide HTML": { rich_text: {} } } as any,
    });
    slideHtmlPropertyEnsured = true;
  } catch {
    slideHtmlPropertyEnsured = true; // already exists or can't add — don't retry
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

const AUDIENCE_INSTRUCTIONS: Record<string, string> = {
  "Inversor":       "AUDIENCE: Investors / VCs. Tone: data-forward, confident, outcome-focused. Lead with traction and numbers. Avoid jargon. Every claim needs a stat or example.",
  "Cliente":        "AUDIENCE: Potential clients. Tone: persuasive, solutions-focused, clear ROI. Lead with the problem they have. Use 'you/your' framing. Commercial and warm.",
  "Equipo interno": "AUDIENCE: Internal team. Tone: direct, no fluff, action-oriented. Bullet-heavy. Skip the pitch — go straight to what, why, and next steps.",
  "Institución":    "AUDIENCE: Funders / institutions / NGOs. Tone: formal, evidence-based, impact-driven. Use sector language. Lead with mission alignment and measurable outcomes.",
};

export async function generateDraft(pageId: string, audience?: string, outputMode?: "slides" | "document"): Promise<void> {
  try {
    // 1. Read the page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await notion.pages.retrieve({ page_id: pageId }) as any;
    const props = page.properties;

    const brief       = props["Title"]?.title?.[0]?.plain_text ?? "";
    const contentType = props["Content Type"]?.select?.name ?? "";
    const platform    = props["Platform"]?.select?.name ?? "";

    if (!brief) return;

    // 2. Build audience context
    const styleContext = audience ? (AUDIENCE_INSTRUCTIONS[audience] ?? `AUDIENCE: ${audience}.`) : "";

    const isVisual   = VISUAL_TYPES.has(contentType);
    // One-pager is always document; other visual types respect outputMode (default: slides)
    const isOnePage  = ONE_PAGE_TYPES.has(contentType) || outputMode === "document";

    if (isVisual) {
      // 3a. Generate HTML visual (slide deck or single-page document)
      await ensureSlideHtmlProperty();

      const prompt = isOnePage
        ? buildOnePagerPrompt(brief, styleContext, contentType)
        : buildHtmlDeckPrompt(brief, contentType, styleContext);
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: HTML_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const html = (msg.content[0] as { type: string; text: string }).text
        // Strip markdown code fences if Claude wrapped it
        .replace(/^```html\n?/, "").replace(/\n?```$/, "").trim();

      // Also create a text summary for Draft Text
      const summary = `[HTML Deck — ${contentType}]\n\nBrief: ${brief}\n\nThis item contains an HTML slide deck. Open the preview to view it.`;

      await notion.pages.update({
        page_id: pageId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties: {
          Status: { select: { name: "Briefed" } },
          "Draft Text": { rich_text: toRichText(summary) },
          "Slide HTML": { rich_text: toRichText(html) },
        } as any,
      });

    } else {
      // 3b. Generate text draft
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system:
          "You are a content strategist and copywriter for Common House. " +
          "You write clear, specific, actionable content drafts. " +
          "Output only the requested draft — no preamble, no meta-commentary.",
        messages: [{ role: "user", content: buildTextPrompt(brief, contentType, platform, styleContext) }],
      });

      const draft = (msg.content[0] as { type: string; text: string }).text;

      await notion.pages.update({
        page_id: pageId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties: {
          Status: { select: { name: "Briefed" } },
          "Draft Text": { rich_text: toRichText(draft) },
        } as any,
      });
    }

  } catch (err) {
    console.error("[generate-draft] Error for page", pageId, err);
    // Leave as Draft — a human can still handle it
  }
}
