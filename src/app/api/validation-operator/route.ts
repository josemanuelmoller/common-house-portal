import { NextResponse } from "next/server";
import { notion, getAllEvidence, DB } from "@/lib/notion";

export const maxDuration = 120;

// Auto-validate evidence that has been human-reviewed.
// Rules (matches validation-operator agent spec):
//   AUTO_VALIDATE  → Confidence High or Medium, has Source Excerpt → set "Validated"
//   AUTO_REVIEW    → Confidence Low, has Source Excerpt → leave as "Reviewed" (needs manual check)
//   ESCALATE       → No Source Excerpt regardless of confidence → leave as "Reviewed"
//
// Called by Vercel cron daily at 03:00 UTC (weekdays).
// Also callable manually via POST /api/validation-operator (no body required).

export async function POST() {
  if (!process.env.NOTION_TOKEN) {
    return NextResponse.json({ error: "NOTION_TOKEN not configured" }, { status: 500 });
  }

  const reviewed = await getAllEvidence("Reviewed");

  const results = {
    total: reviewed.length,
    validated: 0,
    skipped_low_confidence: 0,
    skipped_no_excerpt: 0,
    errors: 0,
  };

  for (const item of reviewed) {
    try {
      const hasExcerpt = Boolean(item.excerpt?.trim());
      const confidence = item.confidence; // "High" | "Medium" | "Low" | null

      if (!hasExcerpt) {
        // ESCALATE — missing source excerpt, can't verify origin
        results.skipped_no_excerpt++;
        continue;
      }

      if (confidence === "Low" || !confidence) {
        // AUTO_REVIEW — low confidence, leave for manual decision
        results.skipped_low_confidence++;
        continue;
      }

      // AUTO_VALIDATE — High or Medium confidence + has excerpt
      await notion.pages.update({
        page_id: item.id,
        properties: {
          "Validation Status": { select: { name: "Validated" } },
        },
      });
      results.validated++;
    } catch {
      results.errors++;
    }
  }

  console.log("[validation-operator]", results);
  return NextResponse.json(results);
}

// Vercel cron calls GET
export async function GET() {
  return POST();
}
