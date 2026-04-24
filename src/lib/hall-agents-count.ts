/**
 * hall-agents-count.ts
 *
 * Reads the number of registered Common House agents from the
 * .claude/agents/ folder. Used by the Hall header readout
 * "N AGENTS ONLINE" — one source of truth, no hard-coded number.
 *
 * Returns null on error so the header can gracefully omit the readout.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";

let cached: { count: number; at: number } | null = null;
const TTL_MS = 60_000;

export async function getAgentsOnlineCount(): Promise<number | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.count;
  try {
    const dir = path.join(process.cwd(), ".claude", "agents");
    const files = await readdir(dir);
    const count = files.filter((f) => f.endsWith(".md")).length;
    cached = { count, at: Date.now() };
    return count;
  } catch {
    return null;
  }
}
