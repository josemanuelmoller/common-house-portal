import { NextResponse } from "next/server";
import { getInsightBriefs } from "@/lib/notion";
import { adminGuardApi } from "@/lib/require-admin";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  // Return all briefs for admin curation (not just community-relevant)
  const briefs = await getInsightBriefs(false);
  return NextResponse.json(briefs);
}
