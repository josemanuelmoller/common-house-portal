-- Multi-email people + atomic person merge.
--
-- RECOVERED FROM PRODUCTION. This DDL was applied to rjcsasbaxihaubkkkxrt on
-- 2026-07-23 (recorded version 20260723214421, name multi_email_people_and_merge_person_fn)
-- via the Supabase MCP `apply_migration` without a companion file in the repo.
-- The SQL below is the verbatim `statements` payload recorded in
-- supabase_migrations.schema_migrations — not a reconstruction. `add column if
-- not exists` + `create or replace function` make it idempotent.

-- Multi-email people: one human can hold several email accounts. `email` stays
-- the primary; `email_accounts` holds ALL of them so the resolver maps every
-- address → the person's org.
alter table public.people add column if not exists email_accounts text[];

-- Atomic, complete person merge — reassigns ALL 9 FK relationships (the existing
-- /api/hall-contacts/merge route only moved conversation_messages and let the
-- rest CASCADE-delete / SET NULL, silently losing relationship_signals etc.).
create or replace function public.merge_person(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source is null or p_target is null or p_source = p_target then return; end if;
  if not exists (select 1 from people where id = p_target) then return; end if;
  if not exists (select 1 from people where id = p_source) then return; end if;

  update people t set
    email_accounts = (
      select array_agg(distinct e order by e) from unnest(
        coalesce(t.email_accounts,'{}'::text[])
        || case when t.email is not null and t.email<>'' then array[lower(t.email)] else '{}'::text[] end
        || coalesce(s.email_accounts,'{}'::text[])
        || case when s.email is not null and s.email<>'' then array[lower(s.email)] else '{}'::text[] end
      ) e where e is not null and e <> ''
    ),
    aliases = (
      select array_agg(distinct a) from unnest(
        coalesce(t.aliases,'{}'::text[]) || coalesce(s.aliases,'{}'::text[])
        || array_remove(array[s.full_name, s.display_name], null)
      ) a where a is not null and a<>'' and lower(a) <> lower(coalesce(t.full_name,''))
    ),
    meeting_count      = coalesce(t.meeting_count,0)      + coalesce(s.meeting_count,0),
    email_thread_count = coalesce(t.email_thread_count,0) + coalesce(s.email_thread_count,0),
    transcript_count   = coalesce(t.transcript_count,0)   + coalesce(s.transcript_count,0),
    org_notion_id      = coalesce(t.org_notion_id, s.org_notion_id),
    person_classification = coalesce(t.person_classification, s.person_classification),
    updated_at = now()
  from people s where t.id = p_target and s.id = p_source;

  update conversation_messages     set sender_person_id        = p_target where sender_person_id        = p_source;
  update action_items              set owner_person_id         = p_target where owner_person_id         = p_source;
  update action_items              set counterparty_contact_id = p_target where counterparty_contact_id = p_source;
  update people_news_mentions      set person_id               = p_target where person_id               = p_source;
  update linkedin_enrichment_audit set person_id               = p_target where person_id               = p_source;
  update orphan_match_candidates   set candidate_person_id     = p_target where candidate_person_id     = p_source;
  update zwd_cities                set primary_contact_id      = p_target where primary_contact_id      = p_source;

  update relationship_signals r set contact_id = p_target
    where r.contact_id = p_source and not exists (select 1 from relationship_signals r2 where r2.contact_id = p_target);
  delete from relationship_signals where contact_id = p_source;

  update person_organization_memberships m set person_id = p_target
    where m.person_id = p_source and not exists (select 1 from person_organization_memberships m2 where m2.person_id = p_target and m2.organization_id = m.organization_id);
  delete from person_organization_memberships where person_id = p_source;

  begin
    insert into people_merge_audit (source_id, target_id, actor, merged_at) values (p_source, p_target, 'merge_person_fn', now());
  exception when others then null; end;

  delete from people where id = p_source;
end;
$$;

revoke all on function public.merge_person(uuid,uuid) from anon, authenticated;
