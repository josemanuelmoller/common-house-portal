import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Phase 7: promote a reviewed, source-backed implementation learning to a
 * knowledge asset. All work happens in the promote_learning_item RPC (guarded +
 * atomic); this maps RPC errors to HTTP statuses.
 */
export type PromoteResult =
  | { ok: true; assetId: string; assetTitle: string }
  | { ok: false; error: string; status: number };

export async function promoteLearning(
  projectId: string,
  learningId: string,
  actor: string,
  targetAssetId?: string | null,
): Promise<PromoteResult> {
  const { data, error } = await supabaseAdmin().rpc("promote_learning_item", {
    p_learning_id: learningId,
    p_project_id: projectId,
    p_actor: actor,
    p_target_asset_id: targetAssetId ?? null,
  });
  if (error) {
    const msg = error.message || "promotion failed";
    if (error.code === "55000" || /already promoted/i.test(msg)) return { ok: false, error: msg, status: 409 };
    if (/not found|does not belong/i.test(msg)) return { ok: false, error: msg, status: 404 };
    if (/must be marked|no evidence/i.test(msg)) return { ok: false, error: msg, status: 400 };
    return { ok: false, error: msg, status: 502 };
  }
  const asset = (Array.isArray(data) ? data[0] : data) as { id?: string; title?: string } | null;
  return { ok: true, assetId: asset?.id ?? "", assetTitle: asset?.title ?? "" };
}
