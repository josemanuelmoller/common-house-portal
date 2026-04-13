import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getProposalBriefs, getCommercialOffers } from "@/lib/notion";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const [proposals, offers] = await Promise.all([
    getProposalBriefs(),
    getCommercialOffers(),
  ]);

  return NextResponse.json({ proposals, offers });
}
