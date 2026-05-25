-- 003-proposals.sql
-- Every state-changing action flows through a proposal. The op discriminator
-- + payload_json shape is validated client-side by Zod (lib/schemas.ts).

create table proposals (
  id uuid primary key default gen_random_uuid(),
  archetype_id text not null references archetypes(id) on delete cascade,
  op text not null check (op in ('update_risk', 'add_risk', 'remove_risk', 'pin_news', 'update_hedge')),
  target text,
  payload_json jsonb not null,
  reasoning text not null,
  source text not null check (source in ('cron-passA', 'cron-passB', 'copilot', 'manual', 'news-monitor')),
  created_by text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'superseded')),
  applied_at timestamptz,
  applied_revision_id bigint references archetype_revisions(id)
);

create index idx_props_status on proposals(status, archetype_id);
create index idx_props_source on proposals(source);
create index idx_props_archetype_created on proposals(archetype_id, created_at desc);

-- Backfill the forward FK from 001-archetypes.
alter table archetype_revisions
  add constraint archetype_revisions_proposal_id_fkey
  foreign key (proposal_id) references proposals(id) on delete set null;

-- ─── apply_archetype_revision: the atomic write path.
-- Optimistic concurrency: state_version must equal current+1 (i.e. the caller
-- read the version it's incrementing from). If two admins try to apply
-- proposals simultaneously, the loser gets a raised exception and retries
-- against the new base. This avoids row locks and is the same pattern
-- castle-dashboard uses.
create or replace function apply_archetype_revision(
  p_archetype_id text,
  p_state_version int,
  p_state jsonb,
  p_proposal_id uuid,
  p_applied_by text
) returns archetype_revisions
language plpgsql
security definer
as $$
declare
  rev archetype_revisions;
begin
  update archetypes
  set state = p_state,
      state_version = p_state_version,
      updated_at = now()
  where id = p_archetype_id
    and state_version = p_state_version - 1;

  if not found then
    raise exception 'concurrent modification on archetype % (expected version %)',
      p_archetype_id, p_state_version - 1;
  end if;

  insert into archetype_revisions (archetype_id, state_version, state, proposal_id, applied_by)
    values (p_archetype_id, p_state_version, p_state, p_proposal_id, p_applied_by)
    returning * into rev;

  if p_proposal_id is not null then
    update proposals
    set status = 'applied',
        applied_at = now(),
        applied_revision_id = rev.id
    where id = p_proposal_id;
  end if;

  return rev;
end $$;

-- service-role only (admin proposals queries go through the service-role client)
alter table proposals enable row level security;
