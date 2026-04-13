import Anthropic from "@anthropic-ai/sdk";
import { notion } from "@/lib/notion";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Brand context ────────────────────────────────────────────────────────────

const CH_BRAND_CONTEXT = `
ABOUT COMMON HOUSE:
Common House is a startup ecosystem operator and portfolio accelerator based in London and LATAM.
They work with early-stage startups in circular economy, sustainable retail, and impact sectors.
Key portfolio: iRefill (refill station network), SUFI (financial inclusion), Fair Cycle (circular fashion), Auto Mercado (sustainable grocery), Beeok, Yenxa.
Investors and funders: impact-focused, ESG-aligned, LATAM and UK.

BRAND VOICE:
- Confident but not arrogant. Founder-facing, not corporate.
- Data-informed: uses specific numbers and outcomes when available, not vague claims.
- Warm ecosystem tone: we're insiders talking to other insiders.
- Clear and direct. Avoids buzzword overload ("synergy", "leverage", "unlock").
- Spanish or English depending on audience. Mix only if intentional.
`.trim();

// ─── Prompt builders per content type ────────────────────────────────────────

const INSTRUCTIONS: Record<string, string> = {
  "LinkedIn Post": `Write a LinkedIn post (150–250 words).
- First sentence: a bold hook — a surprising fact, counterintuitive take, or strong statement.
- Body: 2–3 short paragraphs developing the idea with a specific example or data point.
- Close: a question or CTA that invites engagement.
- End: 4–5 relevant hashtags on their own line.
- Format: paragraph breaks, NO bullet points inside the post body.`,

  "Newsletter Block": `Write a newsletter block (250–400 words).
- Start with a clear subheading (##).
- 3 short, punchy paragraphs.
- Include one specific example or number.
- End with a 1-sentence takeaway or "what to watch".
- Tone: thoughtful analyst, not marketing copy.`,

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

  "Instagram Caption": `Write an Instagram caption (60–100 words).
- Opening line: short and punchy, stands alone.
- 2–3 sentences of context or insight.
- CTA: a question or "link in bio" style prompt.
- New line: 6–8 hashtags.
Tone: warmer and more visual than LinkedIn.`,

  "Deck": `Create a slide deck outline.
Format:
**Deck title:** [title]
**Objective:** [1-sentence goal]
**Audience:** [who will see this]

Then list 8–12 slides:
- **[Slide #]: [Slide title]** ← mark KEY slides with ⭐
  - Key message (1 sentence)
  - Content: [what goes on this slide — 2–3 bullets]

End with: **Design notes:** any visual or data suggestions.`,

  "One-pager": `Create a one-pager structure.
Format each section clearly:
**Headline:** [punchy 1-line headline]
**Problem:** [2–3 sentences — the pain point]
**Solution:** [3–4 sentences — what CH / the startup does]
**Traction / Impact:** [3 bullet points with specific numbers if possible]
**Why Now:** [1–2 sentences — market timing]
**Call to Action:** [1 sentence — what you want the reader to do]
Keep it tight — this is a one-pager, not a report.`,

  "Proposal": `Create a proposal outline.
Format:
**Proposal title:** [title]
**For:** [client/partner name from brief]

Sections:
1. Executive Summary (3 sentences)
2. Context & Objective (short paragraph)
3. Proposed Approach — 3–4 phases, each with name + 2-sentence description
4. Deliverables (bulleted list)
5. Timeline guidance (rough milestones, no exact dates)
6. Investment framing (describe value/scope, not specific prices)
7. Next Steps (3 bullets)`,

  "Exec Summary": `Write an executive summary (200–300 words) using Situation → Complication → Resolution structure.
- **Situation:** what is the context (1–2 sentences)
- **Complication:** what problem or opportunity has emerged (2–3 sentences)
- **Resolution:** what CH proposes or has done (2–3 sentences)
- **Ask / Decision point:** what is needed from the reader (1 sentence)
Professional, concise, no fluff.`,

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

function buildPrompt(brief: string, contentType: string, platform: string): string {
  const instruction = INSTRUCTIONS[contentType]
    ?? `Create a draft for this ${contentType} request. Be specific, actionable, and on-brand.`;

  return [
    CH_BRAND_CONTEXT,
    "",
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

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateDraft(pageId: string): Promise<void> {
  try {
    // 1. Read the page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await notion.pages.retrieve({ page_id: pageId }) as any;
    const props = page.properties;

    const brief       = props["Title"]?.title?.[0]?.plain_text ?? "";
    const contentType = props["Content Type"]?.select?.name ?? "";
    const platform    = props["Platform"]?.select?.name ?? "";

    if (!brief) return;

    // 2. Generate with Claude
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system:
        "You are a content strategist and copywriter for Common House. " +
        "You write clear, specific, actionable content drafts. " +
        "Output only the requested draft — no preamble, no meta-commentary.",
      messages: [{ role: "user", content: buildPrompt(brief, contentType, platform) }],
    });

    const draft = (msg.content[0] as { type: string; text: string }).text;

    // 3. Save draft + advance status to "Briefed"
    await notion.pages.update({
      page_id: pageId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: {
        Status: { select: { name: "Briefed" } },
        "Draft Text": { rich_text: toRichText(draft) },
      } as any,
    });
  } catch (err) {
    console.error("[generate-draft] Error for page", pageId, err);
    // Leave as Draft — a human can still handle it
  }
}
