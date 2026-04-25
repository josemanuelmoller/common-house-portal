/**
 * digest-pipeline.ts — Phase B drafter for the `ingest-document` skill.
 *
 * Two intake modes:
 *   - generateDigestionProposal(pdfBuffer, ...) → native PDF document content
 *   - generateDigestionProposalFromText(text, ...) → for DOCX/PPTX after
 *     server-side text extraction
 *
 * Both call Claude with tool_use forcing structured output that conforms to
 * the DigestProposal type (see src/types/digest-proposal.ts). The drafter
 * MUST return a valid tool_use block with the full proposal — markdown for
 * display, source/evidence/KA records ready for Phase C, and structured
 * questions that gate the push to Notion.
 *
 * Phase C (push to Notion) lives in src/lib/notion-push.ts and runs from
 * /api/ingest-library/digest/execute.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import path from "path";
import type { DigestProposal } from "@/types/digest-proposal";

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

Your job: read an external research paper / industry report / whitepaper / standard / internal document, plus any user-provided scope hints, and produce a structured digestion proposal that an admin can review and push to Notion.

You MUST call the \`submit_digestion_proposal\` tool with the full proposal. Do not answer in plain text — every output goes through the tool.

## What the proposal contains

1. **markdown** — a human-readable rendering of the full proposal (sections: source identification, scope decision, evidence preview, KA preview, cross-references, open questions, push effort). Same content as the structured fields, just formatted for display.

2. **source** — the metadata for the CH Sources [OS v2] record we will create. Every field must use schema-valid values.

3. **evidence** — 8–14 atomic claim records. Each must:
   - have a clear, ≤120-char title
   - cite a source_excerpt (1–2 sentences verbatim from the document)
   - have evidence_type from the schema's allowlist
   - have reusability following the triage rubric strictly
   - tag topics, geography, and affected_themes from the schema's allowlists (these are 3 DIFFERENT allowlists, do NOT mix them)
   - point to ka_indices (which KAs this evidence feeds)

4. **knowledge_assets** — 3–8 candidate KAs. Each must:
   - have a name with explicit geographic scope marker (e.g. "[LATAM / Chile]", "[Global Analogue]", "[California]")
   - have asset_type from the schema's allowlist
   - have a body with a "## Geographic scope disclaimer" section if the source is non-Canonical
   - point to evidence_indices (the evidence that feeds this KA)

5. **questions** — the open questions that block a confident push. Each must:
   - be specific and actionable
   - have type single_choice with explicit options when there are obvious alternatives (e.g. date ambiguity, sensitivity, partner role)
   - have type text only when the answer is genuinely free-form
   - mark required=true unless the answer is purely optional
   - have an \`affects\` string that explains in plain language what the answer changes (e.g. "Source.source_date — picks correct publication year")

## Triage targets

- Peer-reviewed multi-market research: ~50–65% Canonical, 25–35% Reusable, 5–10% Possibly Reusable, 0–5% Project-Specific
- Single-company internal retrospective: ~5–15% Canonical, 20–35% Reusable, 30–50% Possibly Reusable, 5–25% Project-Specific
- For closed companies: be more conservative. Specific NUMBERS (NPS, conversion rates, market shares) are usually Project-Specific. PATTERNS (operational constraints, UX confusion patterns, churn drivers) can be Reusable if grounded in physics/economics.

## Drafting rules — STRICT

1. Use only schema-valid values for select / multi-select fields. If unsure of a value, omit it from the array (do NOT invent values).
2. Every non-Canonical KA must include a geographic-scope marker in the title.
3. Skip methodology and appendices. Focus on substantive claims.
4. \`source.dedup_key\` is a stable slug like \`{publisher-slug}-{topic-slug}-{year}\`.
5. \`source.source_date\` is YYYY-MM-DD. If ambiguous, pick the most likely value and add a question for confirmation.
6. \`source.summary\` ≤ 500 chars.
7. Each KA's \`summary\` ≤ 500 chars.
8. Evidence \`source_excerpt\` is verbatim quote ≤ 1500 chars.

## Schema cache (authoritative)

\`\`\`json
${schema}
\`\`\`

## Triage rubric

${rubric}
`;
  return cachedSystemPrompt;
}

const PROPOSAL_TOOL: Anthropic.Tool = {
  name: "submit_digestion_proposal",
  description:
    "Submit the digestion proposal as structured data ready for review and Phase C push to Notion.",
  input_schema: {
    type: "object",
    required: ["markdown", "source", "evidence", "knowledge_assets", "questions"],
    properties: {
      markdown: {
        type: "string",
        description:
          "Full human-readable markdown rendering of the proposal. Same content as the structured fields, formatted for display in the portal.",
      },
      source: {
        type: "object",
        required: [
          "title",
          "source_type",
          "source_date",
          "dedup_key",
          "summary",
          "sanitized_notes",
        ],
        properties: {
          title: { type: "string" },
          source_type: {
            type: "string",
            enum: [
              "Document",
              "Note",
              "Email",
              "Meeting",
              "Email Thread",
              "Conversation",
              "Clipping",
              "Research Report",
              "Industry Report",
              "Whitepaper",
              "Standard",
            ],
          },
          source_date: {
            type: "string",
            description: "YYYY-MM-DD",
          },
          dedup_key: {
            type: "string",
            description: "Stable slug like 'publisher-topic-year'",
          },
          summary: { type: "string", description: "≤500 chars synthesis" },
          sanitized_notes: { type: "string" },
          publisher: { type: "string" },
          partner_org: { type: "string" },
        },
      },
      evidence: {
        type: "array",
        minItems: 5,
        maxItems: 30,
        items: {
          type: "object",
          required: [
            "title",
            "statement",
            "evidence_type",
            "reusability",
            "confidence",
            "topics",
            "geography",
            "affected_themes",
            "source_excerpt",
            "ka_indices",
          ],
          properties: {
            title: { type: "string", maxLength: 120 },
            statement: { type: "string" },
            evidence_type: {
              type: "string",
              enum: [
                "Approval",
                "Blocker",
                "Process Step",
                "Stakeholder",
                "Risk",
                "Objection",
                "Decision",
                "Requirement",
                "Dependency",
                "Outcome",
                "Assumption",
                "Contradiction",
                "Insight Candidate",
                "Milestone",
                "Traction",
              ],
            },
            reusability: {
              type: "string",
              enum: ["Project-Specific", "Possibly Reusable", "Reusable", "Canonical"],
            },
            confidence: {
              type: "string",
              enum: ["Low", "Medium", "High"],
            },
            topics: {
              type: "array",
              items: { type: "string" },
              description:
                "From CH Evidence schema 'Topics / Themes' allowlist (e.g. Refill, Reuse, Retail, Behaviour Change, Investment / Finance).",
            },
            geography: {
              type: "array",
              items: { type: "string" },
              description:
                "From CH Evidence schema 'Geography' allowlist (UK / EU / LATAM / North America / Africa / MENA / Asia / Global).",
            },
            affected_themes: {
              type: "array",
              items: { type: "string" },
              description:
                "From CH Evidence schema 'Affected Theme' allowlist (Operations / Stakeholders / Commercial / etc.). DIFFERENT allowlist from topics.",
            },
            source_excerpt: { type: "string", maxLength: 1500 },
            ka_indices: {
              type: "array",
              items: { type: "integer" },
              description:
                "Indices into the knowledge_assets array that reference this evidence (0-based).",
            },
          },
        },
      },
      knowledge_assets: {
        type: "array",
        minItems: 2,
        maxItems: 10,
        items: {
          type: "object",
          required: [
            "name",
            "asset_type",
            "summary",
            "domain_themes",
            "subthemes",
            "main_body",
            "evidence_indices",
          ],
          properties: {
            name: {
              type: "string",
              description:
                "Asset Name. Must include geographic-scope marker like '[LATAM / Chile]' or '[Global Analogue]' or '[California]'.",
            },
            asset_type: {
              type: "string",
              enum: [
                "Playbook",
                "Pattern Library",
                "Method",
                "Checklist",
                "Template",
                "Benchmark",
                "Insight Memo",
                "Market Research",
                "Model Validation",
                "Sector Insight",
                "Framework",
              ],
            },
            summary: { type: "string", description: "≤500 chars" },
            domain_themes: {
              type: "array",
              items: { type: "string" },
              description:
                "From CH KA schema 'Domain / Theme' allowlist. Different from Evidence Topics.",
            },
            subthemes: {
              type: "array",
              items: { type: "string" },
              description:
                "From CH KA schema 'Subthemes' allowlist (Approvals / Training / Operations / Stakeholders / Rollout / Procurement / Legal / Metrics).",
            },
            main_body: {
              type: "string",
              description:
                "Markdown for the Canonical Guidance / Main Body field. Include a Geographic scope disclaimer section for non-Canonical KAs.",
            },
            evidence_indices: {
              type: "array",
              items: { type: "integer" },
              description: "Indices into evidence[] that this KA uses as sources (0-based).",
            },
          },
        },
      },
      questions: {
        type: "array",
        minItems: 0,
        maxItems: 10,
        items: {
          type: "object",
          required: ["id", "question", "type", "affects"],
          properties: {
            id: {
              type: "string",
              description: "Stable identifier like 'q1', 'q2'.",
            },
            question: { type: "string" },
            hint: { type: "string" },
            type: {
              type: "string",
              enum: ["single_choice", "text", "boolean", "date"],
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Required for type=single_choice. 2-5 explicit options.",
            },
            default_value: { type: "string" },
            required: { type: "boolean" },
            affects: {
              type: "string",
              description:
                "Plain-language description of what this answer modifies (e.g. 'Source date - picks correct publication year').",
            },
          },
        },
      },
    },
  },
};

export type ProposalResult = {
  proposal: DigestProposal;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  modelUsed: string;
};

async function callDrafter(
  client: Anthropic,
  model: string,
  maxTokens: number,
  userContent: Anthropic.MessageParam["content"],
): Promise<ProposalResult> {
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
    tools: [PROPOSAL_TOOL],
    tool_choice: { type: "tool", name: PROPOSAL_TOOL.name },
    messages: [{ role: "user", content: userContent }],
  });

  const toolBlock = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === PROPOSAL_TOOL.name,
  );
  if (!toolBlock) {
    throw new Error(
      `Drafter did not call ${PROPOSAL_TOOL.name}. Got blocks: ${resp.content
        .map((b) => b.type)
        .join(", ")}`,
    );
  }

  const proposal = toolBlock.input as DigestProposal;
  if (!proposal.source || !Array.isArray(proposal.evidence) || !Array.isArray(proposal.knowledge_assets)) {
    throw new Error("Drafter output is missing required fields (source / evidence / knowledge_assets)");
  }

  return {
    proposal,
    inputTokens: resp.usage.input_tokens,
    cachedTokens:
      (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    outputTokens: resp.usage.output_tokens,
    modelUsed: model,
  };
}

/**
 * Phase A + B for PDF documents — Claude reads the PDF natively (vision +
 * text), so layout, charts, and embedded images all reach the drafter.
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
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in environment");

  const client = new Anthropic({ apiKey });
  const model = options.model ?? "claude-sonnet-4-6";
  const maxTokens = options.maxTokens ?? 16000;

  const pdfBase64 = pdfBuffer.toString("base64");
  const userText = `## Scope hints from user / agent\n\n\`\`\`json\n${JSON.stringify(
    scopeHints,
    null,
    2,
  )}\n\`\`\`\n\n## Now read the attached PDF document and submit the digestion proposal via the submit_digestion_proposal tool.`;

  return callDrafter(client, model, maxTokens, [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    },
    { type: "text", text: userText },
  ]);
}

/**
 * Phase B for non-PDF Office documents — text was extracted server-side via
 * mammoth (DOCX) or our JSZip extractor (PPTX). Layout / images are LOST in
 * this path; flagged in scope hints so the drafter knows.
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
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in environment");

  const client = new Anthropic({ apiKey });
  const model = options.model ?? "claude-sonnet-4-6";
  const maxTokens = options.maxTokens ?? 16000;

  const userText = `## Scope hints from user / agent\n\n\`\`\`json\n${JSON.stringify(
    scopeHints,
    null,
    2,
  )}\n\`\`\`\n\n## Document source\n\nExtracted text from \`${sourceLabel}\` (Office document — text-only, layout/images discarded).\n\n---\n\n${extractedText}\n\n---\n\n## Now submit the digestion proposal via the submit_digestion_proposal tool.`;

  return callDrafter(client, model, maxTokens, [{ type: "text", text: userText }]);
}
