import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
import { createKnowledgeAssetDraft } from "@/lib/notion";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CLASSIFY_PROMPT = `You are a knowledge curator for Common House, a startup ecosystem operator in circular economy and sustainable retail.

Analyze the provided content and return a JSON object with this exact structure:
{
  "title": "concise descriptive title (max 80 chars)",
  "summary": "2-3 sentence summary of the core insight or content",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "assetType": one of: "Signal" | "Case Study" | "Framework" | "Viewpoint" | "Pattern" | "Reference" | "Insight Memo" | "Playbook",
  "tags": ["tag1", "tag2", "tag3"],
  "isExternal": true if this is external material (report, article, regulation, research), false if it's CH-originated insight
}

Asset type guidance:
- Signal: market trend, regulation update, early observation from the field
- Case Study: real project example, precedent, reference case
- Framework: methodology, classification system, decision tool
- Viewpoint: CH position or perspective on a topic
- Pattern: recurring dynamic observed across multiple projects
- Reference: external report, study, regulation text, benchmark
- Insight Memo: synthesized insight from multiple sources
- Playbook: how-to, process guide, operational procedure

Tags should be 2-5 keywords from: Refill, Packaging, Circular Economy, Zero Waste, Policy, EPR, Retail, LATAM, UK, Impact, ESG, Sustainability, Fundraising, Operations, Technology, Community, Food, Fashion, Finance, Regulation

Return ONLY the JSON object, no markdown, no explanation.`;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let textContent = "";
  let sourceNote = "";
  let isPdf = false;
  let pdfBase64 = "";

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    // File upload
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const pastedText = formData.get("text") as string | null;
    sourceNote = (formData.get("source") as string | null) ?? "";

    if (file) {
      sourceNote = sourceNote || file.name;
      if (file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        pdfBase64 = Buffer.from(buffer).toString("base64");
        isPdf = true;
      } else {
        textContent = await file.text();
      }
    } else if (pastedText) {
      textContent = pastedText;
    } else {
      return NextResponse.json({ error: "No file or text provided" }, { status: 400 });
    }
  } else {
    // JSON text paste
    const body = await req.json();
    textContent = body.text ?? "";
    sourceNote = body.source ?? "";
    if (!textContent.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Build Claude message — PDF via document block, text via text block
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = isPdf
    ? [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        },
        { type: "text", text: "Classify and extract knowledge from this document." },
      ]
    : [{ type: "text", text: textContent.slice(0, 40000) }];

  let raw = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
    raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch (err) {
    console.error("[ingest-library] Claude error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }

  // Parse JSON from Claude response
  let parsed: {
    title: string;
    summary: string;
    keyPoints: string[];
    assetType: string;
    tags: string[];
    isExternal: boolean;
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse classification", raw }, { status: 500 });
  }

  // Create Knowledge Asset draft in Notion
  let notionId: string | null = null;
  try {
    notionId = await createKnowledgeAssetDraft({
      title: parsed.title,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints ?? [],
      assetType: parsed.assetType ?? "Reference",
      tags: parsed.tags ?? [],
      sourceNote,
    });
  } catch (err) {
    console.error("[ingest-library] Notion create error:", err);
    return NextResponse.json({ error: "Notion create failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    notionId,
    title: parsed.title,
    assetType: parsed.assetType,
    tags: parsed.tags,
    summary: parsed.summary,
  });
}
