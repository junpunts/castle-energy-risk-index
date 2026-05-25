-- 000-research.sql
-- Research scaffolds: the long-form scenario brief, hedges/contracts library,
-- and freeform analyst notes that ground every LLM call. Edited from the
-- admin UI; revisable via trigger.

create table archetype_research (
  archetype_id text primary key,
  scaffold_md text not null,
  contracts_library jsonb not null default '[]'::jsonb,
  notes_md text,
  updated_at timestamptz not null default now()
);

create table archetype_research_revisions (
  id bigserial primary key,
  archetype_id text not null,
  scaffold_md text not null,
  contracts_library jsonb not null,
  notes_md text,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create index idx_research_rev on archetype_research_revisions(archetype_id, updated_at desc);

-- Trigger writes a revision row on every update.
create or replace function snapshot_research_revision() returns trigger language plpgsql as $$
begin
  insert into archetype_research_revisions
    (archetype_id, scaffold_md, contracts_library, notes_md, updated_by)
    values (old.archetype_id, old.scaffold_md, old.contracts_library, old.notes_md,
            coalesce(current_setting('app.updated_by', true), 'unknown'));
  return new;
end $$;

create trigger trg_research_revision
  before update on archetype_research
  for each row
  execute function snapshot_research_revision();
