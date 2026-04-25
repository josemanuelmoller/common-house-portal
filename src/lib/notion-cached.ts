/**
 * Cached read layer for Notion data.
 *
 * Wraps the heavy Notion read functions with `unstable_cache` (5 min TTL).
 * Notion's API is slow (300-1500ms per query) and the Hall page calls 8+ of
 * these in parallel — caching cuts page load by 50-70% on warm hits.
 *
 * Cache scope: shared across all requests (this is an admin-only app, single
 * user). Tag-based invalidation lets writes bust specific caches.
 *
 * To force refresh after a write, call:
 *   import { revalidateTag } from "next/cache";
 *   revalidateTag("notion:decisions");
 */

import { unstable_cache } from "next/cache";
import {
  getProjectsOverview as _getProjectsOverview,
  getOpportunitiesByScope as _getOpportunitiesByScope,
  getRadarLoops as _getRadarLoops,
  getParkedLoops as _getParkedLoops,
  getCoSTasks as _getCoSTasks,
  getCandidateOpportunities as _getCandidateOpportunities,
  getReadyContent as _getReadyContent,
} from "@/lib/notion";
// Phase 1: these 5 read paths now go through Supabase mirrors (synced
// from Notion every 5 min via /api/cron/sync-notion-mirror). Originals
// in @/lib/notion/* stay intact for write paths and non-Hall callers.
import {
  getDailyBriefing as _getDailyBriefing,
  getRecentInsightBriefBriefs as _getRecentInsightBriefBriefs,
  getLatestMarketSignals as _getLatestMarketSignals,
  getRecentCompetitiveIntel as _getRecentCompetitiveIntel,
  getDecisionItems as _getDecisionItems,
} from "@/lib/notion-mirror";
import { getAgentDrafts as _getAgentDrafts, getOutboxDrafts as _getOutboxDrafts } from "@/lib/notion/drafts";
import { getColdRelationships as _getColdRelationships } from "@/lib/notion/people";

const TTL = 300; // 5 minutes

export const getProjectsOverview = unstable_cache(
  _getProjectsOverview,
  ["notion:projects-overview"],
  { revalidate: TTL, tags: ["notion", "notion:projects"] }
);

export const getOpportunitiesByScope = unstable_cache(
  _getOpportunitiesByScope,
  ["notion:opportunities-by-scope"],
  { revalidate: TTL, tags: ["notion", "notion:opportunities"] }
);

export const getRadarLoops = unstable_cache(
  _getRadarLoops,
  ["notion:radar-loops"],
  { revalidate: TTL, tags: ["notion", "notion:radar"] }
);

export const getParkedLoops = unstable_cache(
  _getParkedLoops,
  ["notion:parked-loops"],
  { revalidate: TTL, tags: ["notion", "notion:loops"] }
);

export const getCoSTasks = unstable_cache(
  _getCoSTasks,
  ["notion:cos-tasks"],
  { revalidate: TTL, tags: ["notion", "notion:cos"] }
);

export const getCandidateOpportunities = unstable_cache(
  _getCandidateOpportunities,
  ["notion:candidate-opportunities"],
  { revalidate: TTL, tags: ["notion", "notion:candidates"] }
);

export const getReadyContent = unstable_cache(
  _getReadyContent,
  ["notion:ready-content"],
  { revalidate: TTL, tags: ["notion", "notion:content"] }
);

export const getDailyBriefing = unstable_cache(
  _getDailyBriefing,
  ["notion:daily-briefing"],
  { revalidate: TTL, tags: ["notion", "notion:briefing"] }
);

export const getRecentInsightBriefBriefs = unstable_cache(
  _getRecentInsightBriefBriefs,
  ["notion:insight-brief-briefs"],
  { revalidate: TTL, tags: ["notion", "notion:briefs"] }
);

export const getLatestMarketSignals = unstable_cache(
  _getLatestMarketSignals,
  ["notion:latest-market-signals"],
  { revalidate: TTL, tags: ["notion", "notion:market-signals"] }
);

export const getRecentCompetitiveIntel = unstable_cache(
  _getRecentCompetitiveIntel,
  ["notion:recent-competitive-intel"],
  { revalidate: TTL, tags: ["notion", "notion:competitive"] }
);

export const getDecisionItems = unstable_cache(
  _getDecisionItems,
  ["notion:decision-items"],
  { revalidate: TTL, tags: ["notion", "notion:decisions"] }
);

export const getAgentDrafts = unstable_cache(
  _getAgentDrafts,
  ["notion:agent-drafts"],
  { revalidate: TTL, tags: ["notion", "notion:drafts"] }
);

export const getOutboxDrafts = unstable_cache(
  _getOutboxDrafts,
  ["notion:outbox-drafts"],
  { revalidate: TTL, tags: ["notion", "notion:drafts"] }
);

export const getColdRelationships = unstable_cache(
  _getColdRelationships,
  ["notion:cold-relationships"],
  { revalidate: TTL, tags: ["notion", "notion:relationships"] }
);
