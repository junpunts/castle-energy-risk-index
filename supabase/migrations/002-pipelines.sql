-- 002-pipelines.sql
-- pipeline_runs is the queue and the run-state table. pipeline_traces is one
-- row per stage per run; output_json null while in-flight, populated on
-- success (this null/non-null distinction drives resume).

create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_name text not null,
  archetype_id text references archetypes(id),
  status text not null check (status in ('queued', 'claimed', 'running', 'completed', 'failed', 'aborted')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  current_stage text,
  error_message text,
  cost_usd numeric(10,4) default 0,
  triggered_by text not null,
  claimed_by text,
  claimed_at timestamptz,
  abort_requested boolean not null default false
);

create index idx_runs_status on pipeline_runs(status);
create index idx_runs_archetype on pipeline_runs(archetype_id);
create index idx_runs_queued_oldest on pipeline_runs(started_at) where status = 'queued';

create table pipeline_traces (
  id bigserial primary key,
  pipeline_run_id uuid not null references pipeline_runs(id) on delete cascade,
  stage_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms int,
  input_json jsonb,
  output_json jsonb,
  error text,
  cost_usd numeric(10,4) default 0
);

create index idx_traces_run on pipeline_traces(pipeline_run_id);
-- UPSERT on (run_id, stage_name) so a re-run replaces a prior null-output row.
create unique index uq_traces_run_stage on pipeline_traces(pipeline_run_id, stage_name);

-- ─── claim_next_run: worker pulls the oldest queued run atomically.
-- FOR UPDATE SKIP LOCKED means N concurrent workers each grab distinct rows.
create or replace function claim_next_run(worker_id text)
returns setof pipeline_runs
language sql
security definer
as $$
  update pipeline_runs
  set status = 'claimed',
      claimed_by = worker_id,
      claimed_at = now()
  where id = (
    select id from pipeline_runs
    where status = 'queued'
    order by started_at
    limit 1
    for update skip locked
  )
  returning *;
$$;

-- ─── reclaim_stuck_runs: zombie reaper. Runs every minute from the worker.
-- A run still in 'claimed' or 'running' with no trace activity in N minutes
-- is assumed to be from a crashed worker; flip it back to 'queued' so the
-- next worker boot picks it up at its last checkpoint.
create or replace function reclaim_stuck_runs(stuck_minutes int default 5)
returns int
language plpgsql
as $$
declare
  reclaimed int;
begin
  with stuck as (
    select r.id
    from pipeline_runs r
    where r.status in ('claimed', 'running')
      and (
        not exists (
          select 1 from pipeline_traces t
          where t.pipeline_run_id = r.id
            and (t.completed_at > now() - make_interval(mins => stuck_minutes)
                 or (t.completed_at is null and t.started_at > now() - make_interval(mins => stuck_minutes)))
        )
      )
      and r.claimed_at < now() - make_interval(mins => stuck_minutes)
  )
  update pipeline_runs
  set status = 'queued', claimed_by = null, claimed_at = null
  from stuck
  where pipeline_runs.id = stuck.id;
  get diagnostics reclaimed = row_count;
  return reclaimed;
end $$;

-- service-role only
alter table pipeline_runs enable row level security;
alter table pipeline_traces enable row level security;
