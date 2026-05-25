-- 001-archetypes.sql
-- Canonical state. One row per archetype; state jsonb is the full bundle
-- the public dashboard renders. archetype_revisions is the audit log.

create table archetypes (
  id text primary key,
  state jsonb not null,
  state_version int not null default 1,
  schema_version text not null default '1.0.0',
  -- Generated columns make composite/risks_total cheap to query without a join.
  composite int generated always as ((state->'archetype'->>'composite')::int) stored,
  risks_total int generated always as ((state->'archetype'->>'risks_total')::int) stored,
  updated_at timestamptz not null default now()
);

create table archetype_revisions (
  id bigserial primary key,
  archetype_id text not null references archetypes(id) on delete cascade,
  state_version int not null,
  state jsonb not null,
  proposal_id uuid,                 -- forward ref; FK added after 003-proposals
  applied_at timestamptz not null default now(),
  applied_by text not null,
  unique (archetype_id, state_version)
);

create index idx_revisions_archetype on archetype_revisions(archetype_id, state_version desc);

-- Now wire archetype_research → archetypes (couldn't FK in 000 because the
-- table didn't exist yet).
alter table archetype_research
  add constraint archetype_research_archetype_id_fkey
  foreign key (archetype_id) references archetypes(id) on delete cascade;

alter table archetype_research_revisions
  add constraint archetype_research_revisions_archetype_id_fkey
  foreign key (archetype_id) references archetypes(id) on delete cascade;

-- ─── RLS: public can read canonical state. Everything else is service-role only.
alter table archetypes enable row level security;
create policy "anon read archetypes" on archetypes for select to anon using (true);
create policy "auth read archetypes" on archetypes for select to authenticated using (true);

alter table archetype_revisions enable row level security;
create policy "anon read revisions" on archetype_revisions for select to anon using (true);
create policy "auth read revisions" on archetype_revisions for select to authenticated using (true);

alter table archetype_research enable row level security;
-- service-role only

alter table archetype_research_revisions enable row level security;
-- service-role only
