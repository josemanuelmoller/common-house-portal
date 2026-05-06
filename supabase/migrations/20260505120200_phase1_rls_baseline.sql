-- Phase 1.3 — RLS baseline
-- See docs/SUPABASE_CONSOLIDATION_FREEZE.md §5.
--
-- Strategy: enable RLS on every public table with NO policies.
-- The portal uses SUPABASE_SERVICE_KEY which bypasses RLS by default
-- (see src/lib/supabase-server.ts). The anon key, if ever used in this
-- workspace, will read/write nothing. This closes the public-data leak
-- flagged by the Supabase advisory.
--
-- If a future surface needs anon read access (e.g. a public Hall page),
-- explicit policies must be added per table.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY on a table that already has it
-- enabled is a no-op.

-- Existing canonical tables flagged by advisory
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chief_of_staff_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_ignores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggested_time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._deprecated_hall_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_calendar_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_email_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_transcript_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_self_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_commitment_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_thread_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orphan_match_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_node_changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_node_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_merge_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_enrichment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_news_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestor_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestor_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_health_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestor_dlq ENABLE ROW LEVEL SECURITY;

-- Mirror tables (will be dropped at Phase 6)
ALTER TABLE public.notion_decision_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_insight_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_competitive_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_agent_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_content_pipeline ENABLE ROW LEVEL SECURITY;

-- New canonical tables created in 20260505120100
ALTER TABLE public.decision_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cap_table_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_room_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pipeline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Other tables not in the original advisory but present in schema
ALTER TABLE public.comms_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pitch_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_runs ENABLE ROW LEVEL SECURITY;
