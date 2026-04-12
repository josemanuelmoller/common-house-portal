import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { getAllPeople } from "@/lib/notion";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const people = await getAllPeople();
  return NextResponse.json(people.map(p => ({
    id:         p.id,
    name:       p.name,
    jobTitle:   p.jobTitle,
    location:   p.location,
    roles:      p.roles,
    visibility: (p as { visibility?: string }).visibility ?? "",
    linkedin:   p.linkedin,
  })));
}
