import { NextResponse } from "next/server";
import { getAllProjects } from "@/lib/notion";
import { adminGuardApi } from "@/lib/require-admin";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

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
