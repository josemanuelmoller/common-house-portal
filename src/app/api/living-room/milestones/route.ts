import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { getAllProjects } from "@/lib/notion";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // For admin curation, return ALL active projects (not just shared ones)
  // so the curator can toggle any project on/off
  const projects = await getAllProjects();
  return NextResponse.json(projects.map(p => ({
    id:             p.id,
    name:           p.name,
    stage:          p.stage,
    milestoneType:  (p as { milestoneType?: string }).milestoneType ?? "",
    communityTheme: (p as { communityTheme?: string }).communityTheme ?? "",
    geography:      p.geography,
    lastUpdate:     p.lastUpdate,
    shareToLivingRoom: (p as { shareToLivingRoom?: boolean }).shareToLivingRoom ?? false,
  })));
}
