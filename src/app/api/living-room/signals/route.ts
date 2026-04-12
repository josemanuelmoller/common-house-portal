import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { getInsightBriefs } from "@/lib/notion";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Return all briefs for admin curation (not just community-relevant)
  const briefs = await getInsightBriefs(false);
  return NextResponse.json(briefs);
}
