import { NextResponse } from "next/server";
import { getAllPeople } from "@/lib/notion";
import { adminGuardApi } from "@/lib/require-admin";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

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
