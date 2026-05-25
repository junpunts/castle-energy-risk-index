-- 004-copilot.sql
-- Chat session + message log. Each session is scoped to an archetype (and
-- optionally a risk); each message is one turn — user prompt, assistant
-- response, tool call, or tool result.

create table copilot_sessions (
  id uuid primary key default gen_random_uuid(),
  archetype_id text references archetypes(id) on delete set null,
  risk_id text,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  summary text
);

create table copilot_messages (
  id bigserial primary key,
  session_id uuid not null references copilot_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool_call', 'tool_result')),
  content_json jsonb not null,
  cost_usd numeric(10,4) default 0,
  created_at timestamptz not null default now()
);

create index idx_msgs_session on copilot_messages(session_id, created_at);

-- service-role only
alter table copilot_sessions enable row level security;
alter table copilot_messages enable row level security;
