import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
import { scanOrphans } from "@/lib/orphan-scanner";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}

// POST /api/resolve-orphans
// Admin-only. Thin HTTP wrapper around scanOrphans(). Safe to re-run.
export async function POST() {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const sb = getSupabase();
  const result = await scanOrphans(sb);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
