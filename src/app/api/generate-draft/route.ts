import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { generateDraft } from "@/lib/generate-draft";

// Allow up to 5 minutes — generation of HTML decks can take 30–90s
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { pageId: string; audience?: string; outputMode?: "slides" | "document" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { pageId, audience, outputMode } = body;
  if (!pageId) {
    return NextResponse.json({ error: "pageId is required" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    await generateDraft(pageId, audience, outputMode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[generate-draft POST]", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
