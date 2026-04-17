import { NextRequest, NextResponse } from "next/server";
import { notion, getAllEvidence, DB } from "@/lib/notion";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 120;

// Auto-validate evidence that has been human-reviewed.
// Rules (matches validation-operator agent spec):
//   AUTO_VALIDATE  → Confidence High or Medium, has Source Excerpt → set "Validated"
//   AUTO_REVIEW    → Confidence Low, has Source Excerpt → leave as "Reviewed" (needs manual check)
//   ESCALATE       → No Source Excerpt regardless of confidence → leave as "Reviewed"
//
// Called by Vercel cron daily at 03:00 UTC (weekdays).
// Also callable manually — requires x-agent-key or Authorization: Bearer <CRON_SECRET>.

function isAuthorized(req: NextRequest): boolean {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return agentKey === expected || cronKey === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reviewed = await getAllEvidence("Reviewed");
  const sb = getSupabaseServerClient();

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

      // Dual-write to Supabase — makes validation_status live immediately (no 7:30am sync lag)
      try {
        await sb.from("evidence")
          .update({ validation_status: "Validated", updated_at: new Date().toISOString() })
          .eq("notion_id", item.id);
      } catch { /* non-critical */ }

      results.validated++;
    } catch {
      results.errors++;
    }
  }

  console.log("[validation-operator]", results);
  return NextResponse.json(results);
}

// Vercel cron calls GET
export async function GET(req: NextRequest) {
  return POST(req);
}
