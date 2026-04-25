/**
 * digest-pipeline.ts — TypeScript port of Phase A + B of the `ingest-document` skill.
 *
 * Used by the portal's "Full Digest" mode (vs. existing one-shot KA classification).
 *
 * Phase A: PDF text extraction is delegated to Claude's native document support
 *          (no pdf-parse dependency needed).
 * Phase B: Generates the digestion proposal markdown via Claude API with the same
 *          system prompt + schema cache + triage rubric as `.claude/lib/propose_digestion.py`.
 *
 * NOT included (Phase C — push to Notion): see notion_push.py CLI for now. The portal
 * generates the proposal; an admin reviews + approves; pushing happens via the agent.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import path from "path";

const SCHEMA_PATH = path.resolve(process.cwd(), ".claude/schemas/os-v2-schemas.json");
const RUBRIC_PATH = path.resolve(process.cwd(), ".claude/triage-rubric.md");

let cachedSystemPrompt: string | null = null;

function buildSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  let schema = "(missing)";
  let rubric = "(missing)";
  try {
    schema = readFileSync(SCHEMA_PATH, "utf-8");
  } catch {}
  try {
    rubric = readFileSync(RUBRIC_PATH, "utf-8");
  } catch {}

  cachedSystemPrompt = `You are the Phase B drafter for the Common House \`ingest-document\` digestion skill.

Your job: read an external research paper / industry report / whitepaper / standard, plus any user-provided scope hints, and produce the FIRST DRAFT of the digestion proposal markdown file. The agent that invokes you will review your draft, refine it, and route it to a human reviewer.

## Output format

Produce ONLY the markdown content. No preamble, no explanation, no code fences. Match the exact section structure below.

## Required sections in this order

# {Document title} - Digestion Proposal

**Status (YYYY-MM-DD):** Phase B - proposal draft (auto-generated from portal upload). Awaiting agent review then user confirmation before push.

## 1. Source identification

| Field | Value |
|---|---|
| Title | ... |
| Subtitle | ... |
| Author / publisher | ... |
| Contractor (if any) | ... |
| Date | ... |
| Pages | ... |
| Statutory anchor (if any) | ... |
| Suggested Source Type | ... (must be one of the schema's Source Type options) |
| Suggested Dedup Key | slug-format-key |
| Source URL | ... |

## 2. Scope decision

Table mapping sections → Core digest / Light digest / Skip with rationale.

Volume estimate: ~N atomic Evidence records, K candidate Knowledge Assets.

## 3. Evidence preview

8-12 representative atomic claims with type + reusability tier + 1-line statement.

## 4. Knowledge Asset preview

4-9 candidate KAs with name (geographic scope marker), Asset Type, 1-2 sentence description, evidence-record clusters.

## 5. Cross-references with existing CH KAs

If scope hints mention prior runs, surface 2-4 likely cross-references.

## 6. Open questions for the user

3-6 specific questions.

## 7. Estimated push effort

Single table: step / minutes / tool.

## Drafting rules — STRICT

1. Use only schema-valid values. Mark unsure as \`[verify]\`.
2. Triage targets: peer-reviewed = ~50-65% Canonical, 25-35% Reusable; single-company = ~5-15% Canonical, 20-35% Reusable, 30-50% Possibly Reusable.
3. Every non-Canonical KA must include geographic-scope marker in title.
4. Skip methodology + appendices.
5. Output one markdown file. No frontmatter, no JSON.

## Schema cache (authoritative)

\`\`\`json
${schema}
\`\`\`

## Triage rubric

${rubric}
`;
  return cachedSystemPrompt;
}

export type ProposalResult = {
  proposalMarkdown: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  modelUsed: string;
};

/**
 * Phase A + B combined: take a PDF buffer + optional scope hints, return
 * the digestion proposal markdown via Claude API.
 */
export async function generateDigestionProposal(
  pdfBuffer: Buffer,
  scopeHints: Record<string, unknown> = {},
  options: {
    model?: string;
    maxTokens?: number;
  } = {},
): Promise<ProposalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set in environment");
  }

  const client = new Anthropic({ apiKey });
  const model = options.model ?? "claude-sonnet-4-6";
  const maxTokens = options.maxTokens ?? 12000;

  const pdfBase64 = pdfBuffer.toString("base64");

  const userText = `## Scope hints from user / agent\n\n\`\`\`json\n${JSON.stringify(scopeHints, null, 2)}\n\`\`\`\n\n## Now read the attached PDF document and produce the proposal markdown per the system instructions.`;

  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  });

  const proposalMarkdown = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    proposalMarkdown,
    inputTokens: resp.usage.input_tokens,
    cachedTokens: (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    outputTokens: resp.usage.output_tokens,
    modelUsed: model,
  };
}

/**
 * Variant for non-PDF documents (DOCX / PPTX). The route extracts text
 * server-side via officeparser and passes it here as plain text, since the
 * Anthropic `type: "document"` content block only natively accepts PDF.
 *
 * Layout, embedded images, and charts are LOST in this path. For text-heavy
 * decks and reports this is fine; for image-heavy slides, ask the user to
 * "Save as PDF" and re-upload through the PDF path.
 */
export async function generateDigestionProposalFromText(
  extractedText: string,
  sourceLabel: string,
  scopeHints: Record<string, unknown> = {},
  options: {
    model?: string;
    maxTokens?: number;
  } = {},
): Promise<ProposalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set in environment");
  }

  const client = new Anthropic({ apiKey });
  const model = options.model ?? "claude-sonnet-4-6";
  const maxTokens = options.maxTokens ?? 12000;

  const userText = `## Scope hints from user / agent\n\n\`\`\`json\n${JSON.stringify(scopeHints, null, 2)}\n\`\`\`\n\n## Document source\n\nExtracted text from \`${sourceLabel}\` (Office document — text-only, layout/images discarded).\n\n---\n\n${extractedText}\n\n---\n\n## Now produce the proposal markdown per the system instructions.`;

  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: userText }],
      },
    ],
  });

  const proposalMarkdown = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    proposalMarkdown,
    inputTokens: resp.usage.input_tokens,
    cachedTokens: (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    outputTokens: resp.usage.output_tokens,
    modelUsed: model,
  };
}
