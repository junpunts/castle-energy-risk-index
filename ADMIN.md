# Castle Energy Risk Index — Admin & Copilot Design

**Audience:** the engineer (or agent) building the admin layer and the agentic backend.
**Stack:** **one Next.js 14 app, Supabase for all state.** Public dashboard, admin pages, copilot chat, pipeline runner, daily cron — all in the same repo, same TS codebase, single deploy. Canonical archetype data and admin/agent state both live in Supabase.

> **Inspiration:** `castle-main/castle-dashboard` is the reference implementation. We match its substrate (Next.js + Supabase + Anthropic SDK) so ports of `run-registry.ts`, `checkpoints.ts`, `proposal-tools.ts`, and `apply-changes/route.ts` are mechanical. We do not lift its full pipeline (their problem of company-research-from-URL is harder than ours).

---

## 1. Stack

| Concern              | Choice                                              | Why                                                              |
|----------------------|-----------------------------------------------------|------------------------------------------------------------------|
| Framework            | Next.js 14 (app router)                             | Public site, admin pages, and API routes in one app.            |
| Public dashboard     | Next.js pages under `app/(public)/*`                | Replaces the current static `public/concepts/v2/*`. Keeps the same HTML structure, CSS, and SVG charts — just rendered by React. |
| Admin                | Next.js pages under `app/admin/*`                   | Behind auth.                                                     |
| Database            | **Supabase Postgres**                               | Canonical archetype state + admin/agent state in one DB. Supports relational queries across archetypes, row subscriptions, real backups, migrations. Matches castle-dashboard. |
| Auth                | Supabase Auth (email + magic link) gated to admin allowlist | Single admin today; trivial to add collaborators later.          |
| LLM                 | `@anthropic-ai/sdk` — Sonnet for everything, Opus only for new-risk surfacing | Same split castle-dashboard uses.                                |
| Pipeline runner     | In-process async worker pool + an in-memory abort registry | Single-host single-process. The castle-dashboard `run-registry.ts` pattern, ported. |
| Live telemetry      | Server-sent events from API routes                  | Same as castle-dashboard's `/regenerate/stream/route.ts`.        |
| Cron                | `vercel.json` cron or a Render cron hitting an internal API route | One entrypoint, two triggers.                                    |
| Hosting             | Vercel or Render — single deploy                    | Public + admin + cron all in one app.                            |

### Layout

```
castle-energy-risk-index/
├── src/
│   ├── app/
│   │   ├── (public)/                     # public dashboard routes
│   │   │   ├── page.tsx                  # composite + archetype grid
│   │   │   ├── archetypes/[id]/page.tsx
│   │   │   └── archetypes/[id]/risks/[riskId]/page.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx                  # admin dashboard
│   │   │   ├── archetypes/[id]/page.tsx  # archetype editor
│   │   │   ├── archetypes/[id]/risks/[riskId]/page.tsx
│   │   │   ├── proposals/page.tsx        # inbox
│   │   │   └── traces/[runId]/page.tsx   # pipeline trace detail
│   │   └── api/
│   │       ├── public/
│   │       │   └── archetypes/[id]/route.ts   # JSON for public pages (cached)
│   │       ├── admin/
│   │       │   ├── auth/login/route.ts
│   │       │   ├── pipelines/…
│   │       │   ├── proposals/…
│   │       │   └── copilot/…
│   │       └── cron/daily-refresh/route.ts
│   ├── components/
│   │   ├── public/                       # archetype grid, waterfall, risk table
│   │   ├── admin/                        # editable risk row, proposal card, trace timeline
│   │   └── copilot/                      # chat panel, proposal rail
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts                 # service-role client (admin + cron)
│   │   │   ├── browser.ts                # anon client
│   │   │   └── types.ts                  # generated DB types
│   │   ├── archetypes/
│   │   │   ├── read.ts                   # readArchetype(id), readAll()
│   │   │   ├── write.ts                  # writeArchetype, atomically + revision
│   │   │   └── derive.ts                 # composite, risks_total, attention_weekly
│   │   ├── pipeline/
│   │   │   ├── index.ts                  # registry of pipeline definitions
│   │   │   ├── checkpoints.ts            # ported from castle-dashboard
│   │   │   ├── run-registry.ts           # ported from castle-dashboard
│   │   │   ├── stages/                   # one file per stage
│   │   │   └── daily-refresh.ts          # composes stages
│   │   ├── adapters/                     # federal register, congress.gov, kalshi, …
│   │   ├── agent/
│   │   │   ├── tools.ts                  # propose_* tools
│   │   │   ├── system-prompt.ts
│   │   │   └── chat.ts                   # tool-calling loop
│   │   └── research/                     # static read of data/research/*
│   └── types/                            # shared TS types
├── data/research/                        # source materials (unchanged) — committed to git
├── supabase/
│   ├── migrations/                       # numbered .sql files, applied with `supabase db push`
│   └── seed.sql                          # initial archetype seed (offshore-wind)
├── public/
│   └── assets/                           # colors_and_type.css, svgs, fonts
├── BACKEND.md
├── ADMIN.md                              # this file
├── next.config.js
├── package.json
└── tsconfig.json
```

### What happens to the current `public/concepts/v2/` files

They become React components. HTML structure, CSS, and SVG chart code preserved verbatim. Page-level data fetch is `await readArchetype(id)` which now hits Supabase:

- `public/concepts/v2/index.html` → `app/(public)/page.tsx` + `<ArchetypeGrid />`.
- `public/concepts/v2/archetype.html` → `app/(public)/archetypes/[id]/page.tsx` + `<Waterfall />`, `<NewsList />`, `<RisksTable />`. The waterfall's SVG generator becomes a function in `lib/charts/waterfall.ts`.
- `public/concepts/v2/risk.html` → `app/(public)/archetypes/[id]/risks/[riskId]/page.tsx` + `<AttentionBars />`, `<Timeline />`, `<HedgesList />`.

### Public-side caching

Public pages should not hit Supabase on every request. Two options:

1. **ISR with revalidation tag.** Pages use `export const revalidate = 60` and call `revalidateTag('archetype:<id>')` from `apply-changes` after every applied proposal. Page is rendered once per minute or on demand, served from CDN otherwise.
2. **Static export of the public route group** if you want a CDN-only public site. The `apply-changes` endpoint triggers a rebuild webhook on the host.

Either works. ISR is simpler; static export is cheaper to serve.

### `data/archetypes/<id>.json` files

Removed. Canonical state moves to Supabase. The seed file we already wrote (`public/data/offshore-wind.json`) becomes the initial INSERT in `supabase/seed.sql`.

`data/research/*` stays in git — those are static inputs (research scaffold, hedges universe, critical contracts) that the daily refresh diffs against.

---

## 2. Mental model

Three things to manage:

1. **Pipelines** — multi-stage data updates. Each pipeline has stages; each stage produces a checkpoint; the whole run is resumable and abortable.
2. **Proposals** — *suggested edits* to an archetype's canonical state. Either the agent emits these (copilot, daily-refresh pass B, news monitor) or you author them by hand. Nothing in the `archetypes` table changes until a proposal is `applied`.
3. **The copilot** — a chat scoped to the page you opened it from. Its only output mechanism is to emit proposals via tool calls. Never writes directly.

This three-way split keeps automation, suggestion, and human authority cleanly separable, and makes every change auditable through the `archetype_revisions` table (see §6).

---

## 3. Database schema

All in Supabase Postgres. One migration per logical group.

### 3.1 Canonical state (`supabase/migrations/001-archetypes.sql`)

```sql
-- One row per archetype. The `state` jsonb is the same blob the public dashboard reads.
create table archetypes (
  id text primary key,                       -- 'offshore-wind', 'utility-solar', …
  state jsonb not null,                      -- ArchetypeBundle (see BACKEND.md §2)
  state_version int not null default 1,      -- monotonic; bumped on every apply
  schema_version text not null default '1.0.0',
  composite int generated always as ((state->'archetype'->>'composite')::int) stored,
  risks_total int generated always as ((state->'archetype'->>'risks_total')::int) stored,
  updated_at timestamptz not null default now()
);

-- Full revision history. Every applied proposal writes a row here BEFORE updating
-- archetypes.state. This is our audit log (replaces git log on the JSON files).
create table archetype_revisions (
  id bigserial primary key,
  archetype_id text not null references archetypes(id),
  state_version int not null,
  state jsonb not null,                      -- the resulting blob after this proposal
  proposal_id uuid references proposals(id), -- nullable for the initial seed
  applied_at timestamptz not null default now(),
  applied_by text not null,                  -- user id or 'cron:<run_id>'
  unique (archetype_id, state_version)
);

create index idx_revisions_archetype on archetype_revisions(archetype_id, state_version desc);
```

`archetypes.state` is the live blob. `archetype_revisions` is append-only. To see what `ow5.probability` was on 2026-04-01, query `archetype_revisions` for the row at or before that timestamp.

### 3.2 Pipelines (`supabase/migrations/002-pipelines.sql`)

```sql
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_name text not null,               -- 'daily_refresh', 'rebuild_archetype', …
  archetype_id text references archetypes(id),
  status text not null,                      -- 'running' | 'completed' | 'failed' | 'aborted'
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  current_stage text,
  error_message text,
  cost_usd numeric(10,4) default 0,
  triggered_by text not null                 -- 'cron' | 'admin:<user>' | 'copilot:<session_id>'
);

create index idx_runs_status on pipeline_runs(status);
create index idx_runs_archetype on pipeline_runs(archetype_id);

create table pipeline_traces (
  id bigserial primary key,
  pipeline_run_id uuid not null references pipeline_runs(id) on delete cascade,
  stage_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms int,
  input_json jsonb,
  output_json jsonb,                         -- null while in-flight, populated on success
  error text,
  cost_usd numeric(10,4) default 0
);

create index idx_traces_run on pipeline_traces(pipeline_run_id);
create unique index uq_traces_run_stage on pipeline_traces(pipeline_run_id, stage_name);
```

The unique index on `(run_id, stage_name)` is how resume works: re-running a stage UPSERTs, so a re-run of an in-flight stage replaces the prior null row.

### 3.3 Proposals (`supabase/migrations/003-proposals.sql`)

```sql
create table proposals (
  id uuid primary key default gen_random_uuid(),
  archetype_id text not null references archetypes(id),
  op text not null,                          -- 'update_risk' | 'add_risk' | 'remove_risk' | 'pin_news' | 'update_hedge'
  target text,                               -- risk_id or hedge ticker
  payload_json jsonb not null,               -- the proposed change
  reasoning text not null,
  source text not null,                      -- 'cron-passB' | 'copilot:<session_id>' | 'manual' | 'news-monitor'
  created_by text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending',    -- 'pending' | 'applied' | 'rejected' | 'superseded'
  applied_at timestamptz,
  applied_revision_id bigint references archetype_revisions(id)
);

create index idx_props_status on proposals(status, archetype_id);
create index idx_props_source on proposals(source);
```

### 3.4 Copilot (`supabase/migrations/004-copilot.sql`)

```sql
create table copilot_sessions (
  id uuid primary key default gen_random_uuid(),
  archetype_id text references archetypes(id),
  risk_id text,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  summary text                               -- LLM-generated 1-line summary for the inbox
);

create table copilot_messages (
  id bigserial primary key,
  session_id uuid not null references copilot_sessions(id) on delete cascade,
  role text not null,                        -- 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content_json jsonb not null,
  cost_usd numeric(10,4) default 0,
  created_at timestamptz not null default now()
);

create index idx_msgs_session on copilot_messages(session_id, created_at);
```

### 3.5 News cache (`supabase/migrations/005-news-cache.sql`)

```sql
create table news_cache (
  id bigserial primary key,
  source text not null,                      -- 'federal_register' | 'congress_gov' | 'kalshi' | …
  url text not null unique,
  title text not null,
  body text,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  matched_archetypes text[],                 -- array of archetype ids
  matched_risks text[]                       -- array of risk ids (qualified: 'offshore-wind:ow5')
);

create index idx_news_source_pub on news_cache(source, published_at desc);
create index idx_news_archetypes on news_cache using gin(matched_archetypes);
create index idx_news_risks on news_cache using gin(matched_risks);
```

### 3.6 RLS (Row-Level Security)

Public `archetypes` and `archetype_revisions` are readable by `anon` (we serve the public dashboard via the anon key with read-only access). Everything else requires `service_role` (used server-side only in admin/cron routes) or an authenticated admin user.

```sql
alter table archetypes enable row level security;
create policy "anon read archetypes" on archetypes for select to anon using (true);

alter table archetype_revisions enable row level security;
create policy "anon read revisions" on archetype_revisions for select to anon using (true);

-- pipeline_runs, pipeline_traces, proposals, copilot_*, news_cache:
-- service_role only. No anon read.
alter table pipeline_runs enable row level security;
alter table pipeline_traces enable row level security;
alter table proposals enable row level security;
alter table copilot_sessions enable row level security;
alter table copilot_messages enable row level security;
alter table news_cache enable row level security;
-- (no policies = no access by default; service_role bypasses RLS)
```

### 3.7 Seeding

`supabase/seed.sql` does one thing: inserts the offshore-wind archetype as the first row.

```sql
insert into archetypes (id, state) values
  ('offshore-wind', $${{json_blob_from_public_data_offshore_wind_json}}$$::jsonb);

insert into archetype_revisions (archetype_id, state_version, state, applied_by)
  select id, 1, state, 'seed' from archetypes;
```

Build it as part of `npm run db:seed`, which reads the JSON blob from disk so the seed stays human-editable.

---

## 4. Data-access layer

`lib/archetypes/read.ts` and `lib/archetypes/write.ts` are the only places that touch the `archetypes` and `archetype_revisions` tables. Every other file goes through these.

```ts
// lib/archetypes/read.ts
import { createServerClient } from '@/lib/supabase/server'
import type { ArchetypeBundle } from '@/types'

export async function readArchetype(id: string): Promise<ArchetypeBundle | null> {
  const sb = createServerClient()
  const { data } = await sb.from('archetypes').select('state').eq('id', id).single()
  return (data?.state ?? null) as ArchetypeBundle | null
}

export async function readAllArchetypes(): Promise<ArchetypeBundle[]> {
  const sb = createServerClient()
  const { data } = await sb.from('archetypes').select('state').order('id')
  return (data ?? []).map(r => r.state as ArchetypeBundle)
}

export async function readArchetypeAt(id: string, at: Date): Promise<ArchetypeBundle | null> {
  const sb = createServerClient()
  const { data } = await sb
    .from('archetype_revisions')
    .select('state')
    .eq('archetype_id', id)
    .lte('applied_at', at.toISOString())
    .order('state_version', { ascending: false })
    .limit(1)
    .single()
  return (data?.state ?? null) as ArchetypeBundle | null
}
```

```ts
// lib/archetypes/write.ts
import { createServerClient } from '@/lib/supabase/server'
import { deriveFields } from './derive'
import { validateBundle } from './validate'
import type { ArchetypeBundle, Proposal } from '@/types'

export async function applyProposalToArchetype(
  proposalId: string,
  appliedBy: string,
): Promise<{ revisionId: number; newVersion: number }> {
  const sb = createServerClient()

  // 1. Load proposal + current state, both in one trip via PostgREST.
  const [{ data: prop }, { data: arch }] = await Promise.all([
    sb.from('proposals').select('*').eq('id', proposalId).single(),
    // (joined to archetype via prop.archetype_id below)
    sb.from('archetypes').select('state, state_version').eq('id', /* prop.archetype_id */ '').single(),
  ])
  // (real code does the join properly; condensed here)

  // 2. Apply op in memory.
  const next = applyOp(arch.state, prop.op, prop.payload_json)

  // 3. Recompute derived fields.
  const final = deriveFields(next)

  // 4. Validate.
  validateBundle(final)

  // 5. Append revision row, then update archetypes.state in a transaction.
  const newVersion = arch.state_version + 1
  const { data: rev } = await sb.rpc('apply_archetype_revision', {
    p_archetype_id: prop.archetype_id,
    p_state_version: newVersion,
    p_state: final,
    p_proposal_id: proposalId,
    p_applied_by: appliedBy,
  })

  // 6. Trigger ISR revalidation for the public page.
  await fetch(`${process.env.NEXT_INTERNAL_URL}/api/revalidate?tag=archetype:${prop.archetype_id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.REVALIDATE_TOKEN}` },
  })

  return { revisionId: rev.id, newVersion }
}
```

`apply_archetype_revision` is a SQL function that runs steps 5 atomically:

```sql
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
  -- Optimistic concurrency: error if state_version moved underneath us.
  update archetypes
    set state = p_state, state_version = p_state_version, updated_at = now()
    where id = p_archetype_id and state_version = p_state_version - 1;

  if not found then
    raise exception 'concurrent modification: state_version moved';
  end if;

  insert into archetype_revisions (archetype_id, state_version, state, proposal_id, applied_by)
    values (p_archetype_id, p_state_version, p_state, p_proposal_id, p_applied_by)
    returning * into rev;

  update proposals
    set status = 'applied', applied_at = now(), applied_revision_id = rev.id
    where id = p_proposal_id;

  return rev;
end $$;
```

Optimistic concurrency catches the "two admins approved two proposals at the same instant" case without locking. The losing apply call retries against the new base.

---

## 5. Pipelines

### 5.1 Stage shape

```ts
type Stage<TIn, TOut> = {
  name: string
  run: (ctx: PipelineContext, input: TIn) => Promise<TOut>
}

type PipelineContext = {
  runId: string
  archetypeId: string
  priorState: ArchetypeBundle | null     // last applied state, for diffing
  signal: AbortSignal                     // checkAbort() pattern from castle-dashboard
  log: (msg: string) => void              // streams into the SSE telemetry channel
  cost: (model: string, inTok: number, outTok: number, usd: number) => void
  llm: Anthropic
  sb: SupabaseClient
}
```

### 5.2 Daily-refresh stages

| # | Stage                       | Output                                                 |
|---|-----------------------------|--------------------------------------------------------|
| 1 | `pull_sources`              | New rows in `news_cache`.                              |
| 2 | `snapshot_hedge_prices`     | For every ticker referenced in any archetype's hedges, read the latest price + 7d change from the castle-scraper Supabase. Held in memory for the next stages. |
| 3 | `diff_against_prior`        | `changes` packet keyed by risk_id (vs `priorState`). Includes hedge-price moves above the 5pp threshold. |
| 4 | `update_existing_risks`     | One LLM call per affected risk → proposals (auto-applied for high-confidence updates, queued for review otherwise). Hedge price refreshes auto-apply by default. |
| 5 | `surface_new_risks`         | Pass B → proposals (always queued for review).         |
| 6 | `apply_auto_proposals`      | Calls `applyProposalToArchetype` for each auto-approved proposal. Each call recomputes derived fields and writes a revision. |
| 7 | `notify`                    | Slack/email summary if configured.                     |

Note: stages 5–7 from BACKEND.md (`recompute_derived`, `validate`, `write_and_commit`) are now internal to `applyProposalToArchetype` and run *per proposal*, not as separate pipeline stages. This is cleaner because every state change — whether from cron, copilot, or manual edit — flows through the same write path.

### 5.3 Checkpoints & resume

Same shape as castle-dashboard's `loadCompletedCheckpoints`. Load all `pipeline_traces` rows with non-null `output_json` for the run, skip those stages, start from the first unfinished one.

### 5.4 Run registry (abort)

Module-level `Map<string, AbortController>` in `lib/pipeline/run-registry.ts`. Ported from castle-dashboard verbatim — 36 lines, works on Next.js as-is. Caveat: it's process-local, so if you scale to >1 instance, swap for Postgres `LISTEN/NOTIFY` polled from each instance.

### 5.5 Cron

```jsonc
// vercel.json
{
  "crons": [
    { "path": "/api/cron/daily-refresh?archetype=all", "schedule": "0 10 * * 1-5" }
  ]
}
```

`app/api/cron/daily-refresh/route.ts` validates `CRON_SECRET` header and kicks off the same pipeline registry the admin UI uses.

---

## 6. Admin pages

Same five pages as before — substrate didn't change anything here:

1. **`/admin`** — active runs + recent runs + open proposals.
2. **`/admin/archetypes/[id]`** — archetype editor. Re-run refresh / refresh hedges / open copilot in the header.
3. **`/admin/archetypes/[id]/risks/[riskId]`** — deep risk editor.
4. **`/admin/proposals`** — full proposal inbox, filterable.
5. **`/admin/traces/[runId]`** — stage-by-stage trace inspector.

Patterns lifted: castle-dashboard's `/admin/page.tsx`, `/admin/curate/[id]/page.tsx`, `/admin/traces/[runId]/page.tsx`.

### Live updates via Supabase Realtime

Active runs, in-flight traces, and proposal inbox subscribe to the relevant Supabase tables via the browser client. No SSE polling needed for these — the SSE channel is reserved for per-pipeline-run telemetry streams (log messages, cost ticks). This is a meaningful UX improvement over the SQLite version.

```ts
// components/admin/ActiveRuns.tsx (excerpt)
useEffect(() => {
  const sb = createBrowserClient()
  const ch = sb
    .channel('admin:runs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_runs' }, payload => {
      // update local state
    })
    .subscribe()
  return () => { sb.removeChannel(ch) }
}, [])
```

---

## 7. The copilot

Same tools as before; only the storage backend changed.

### 7.1 Tools (`lib/agent/tools.ts`)

| Tool                       | Purpose                                                                 |
|---------------------------|--------------------------------------------------------------------------|
| `read_archetype`          | Get the current archetype JSON via `readArchetype(id)`.                  |
| `read_risk`               | Get one risk's `risk_detail`.                                            |
| `read_research_scaffold`  | Get the research-scaffold markdown section.                              |
| `search_hedges_universe`  | Search the contract library + the castle-scraper Kalshi/Polymarket mirror. |
| `search_news_cache`       | Postgres full-text search against `news_cache`.                          |
| `propose_risk_update`     | Insert a `proposals` row. Required: `risk_id`, `field`, `new_value`, `reasoning`. |
| `propose_add_risk`        | Same.                                                                    |
| `propose_remove_risk`     | Same.                                                                    |
| `propose_news_item`       | Same.                                                                    |
| `propose_hedge_update`    | Same.                                                                    |
| `trigger_pipeline`        | Insert a `pipeline_runs` row and kick off the registry.                  |
| `web_search`              | Anthropic web-search tool — same flag castle-dashboard uses on Opus event-research. |

**Hard rule:** the copilot has *no* direct-write tool. Every state change flows through `propose_*` + `apply`. Mirrors castle-dashboard's `proposal-tools.ts` exactly.

### 7.2 Chat endpoint

`POST /api/admin/copilot/sessions/[id]/chat` — SSE stream, same shape as castle-dashboard's `agent/route.ts`.

### 7.3 System prompt

```
You are Castle's risk-book copilot. You help the admin maintain the
offshore-wind risk book (and other archetypes).

You can:
- Read the current risk book and research scaffold.
- Search the hedges universe and the news cache.
- Propose edits — never write directly. The admin reviews every proposal.
- Trigger pipelines.

Constraints:
- Risk IDs are stable. Never reuse or renumber.
- `tracked_since` never changes.
- composite, risks_total, news_this_week, attention_weekly are derived —
  do not propose direct edits to them.
- Hedges must reference a known ticker (library-*, kalshi:*, poly:*); use
  search_hedges_universe to find candidates.
- Castle voice: direct, quantified, sources cited inline.

Current context:
- Archetype: {archetype.name} ({archetype.id})
- Composite: {archetype.composite} (delta {archetype.composite_delta} WoW)
- Risks tracked: {archetype.risks_total}, {archetype.risks_high} high
- Page-scoped risk: {risk.title or '—'}
```

### 7.4 What this looks like in practice

You open the offshore-wind archetype, click **Copilot**, type:

> "The Senate dropped FEOC tightening from the reconciliation text yesterday. Update ow5 probability down and add a news item."

Copilot:
1. Calls `read_risk('ow5')` and `search_news_cache('FEOC reconciliation Senate')`.
2. Replies: "Found the Politico item from yesterday. ow5 was 0.70; proposing 0.62 — material narrowing remains in the House version. Also proposing a news pin."
3. Emits `propose_risk_update` and `propose_news_item` tool calls — both insert `proposals` rows.
4. The right rail shows both proposals (live via Supabase Realtime). You hit Approve on both.
5. `applyProposalToArchetype` runs for each, recomputes composite, writes the revision, updates `archetypes.state`, triggers ISR revalidation. The public page re-renders within seconds.

---

## 8. API surface

```
# Public (anon Supabase access, ISR-cached)
GET    /api/public/archetypes                  → list of archetype summaries
GET    /api/public/archetypes/[id]             → full canonical state
GET    /api/public/archetypes/[id]/revisions   → history (paginated)

# Auth
POST   /api/admin/auth/login                   { email } → magic link

# Pipelines
GET    /api/admin/pipelines
POST   /api/admin/pipelines/[name]/run         { archetypeId, args… } → { runId }
GET    /api/admin/pipelines/runs
GET    /api/admin/pipelines/runs/[id]
POST   /api/admin/pipelines/runs/[id]/abort
POST   /api/admin/pipelines/runs/[id]/resume
GET    /api/admin/pipelines/runs/[id]/stream   → SSE

# Proposals
GET    /api/admin/proposals                    { archetypeId?, status? }
POST   /api/admin/proposals
POST   /api/admin/proposals/[id]/apply
POST   /api/admin/proposals/[id]/reject

# Copilot
POST   /api/admin/copilot/sessions
POST   /api/admin/copilot/sessions/[id]/chat   → SSE
GET    /api/admin/copilot/sessions/[id]/messages

# Cron
GET    /api/cron/daily-refresh                 → ?archetype=all|<id>, auth via CRON_SECRET

# Internal
POST   /api/revalidate                         → bumps ISR tag for an archetype
```

---

## 9. Environment

```
# Required
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# castle-scraper — hedge prices read from its Supabase, populated by its own
# daily cron. We are a read-only consumer. Read https://github.com/castle-main/castle-scraper.
SCRAPER_SUPABASE_URL=
SCRAPER_SUPABASE_SERVICE_ROLE_KEY=

# Cron / internal
CRON_SECRET=                                   # validates the daily-refresh cron call
REVALIDATE_TOKEN=                              # validates /api/revalidate calls

# Admin auth
ADMIN_EMAILS=you@example.com                   # comma-separated allowlist

# Optional
SLACK_WEBHOOK_URL=                             # daily-refresh notification target
SENTRY_DSN=                                    # error reporting (drop-in later)
```

Three projects in Supabase: `local` (CLI), `dev` (preview deploys), `prod`. Migrations go through `supabase db push`. Castle-dashboard's `README.md` documents the exact `npm run db:dev` / `db:prod` setup — copy verbatim.

---

## 10. Iteration order

1. **Supabase project + migrations + seed.** Run all five migrations against a fresh dev project. Seed it with the offshore-wind blob (already authored).
2. **Next.js scaffold + public dashboard.** Port `public/concepts/v2/*` to server components, read from Supabase via `readArchetype`. The public site should look pixel-identical to the static version today.
3. **Admin shell.** Login (magic link, allowlist), read-only pipelines list, archetype list, empty proposals inbox. Live updates via Supabase Realtime.
4. **Pipeline runner.** Port `run-registry`, `checkpoints`, stage runner from castle-dashboard. Wire up trigger / abort / resume / SSE telemetry.
5. **Proposals + apply.** Manual proposal flow + the SQL function for atomic apply. Hand-edit a risk's view paragraph end-to-end.
6. **Pass-B cron new-risk surfacing.** Emits proposals into the inbox.
7. **Copilot.** Chat endpoint with `propose_*` tools. Reuses the same proposal apply path.
8. **News monitor stream.** Periodic adapter polling, dumps to `news_cache`, emits proposals.

Skip Slack, Langfuse, Sentry until the rest is solid.

---

## 11. What we're not copying from castle-dashboard

- **The dependency-decomposition / event-research / portfolio pipeline** — they figure out a company's risks from a URL. Our archetypes start from a curated research scaffold, so the pipeline is shorter and the agent is more constrained.
- **Multi-tenant ownership, sharing** — one admin allowlist. Easy to expand later because we're already on Supabase Auth.
- **Langfuse / Sentry** — add later as drop-ins if needed.
- **The synthetic-contracts library service** — we have `offshore-wind-hedges.json` as a filtered static input. If we ever need a cross-archetype live library, lift their `synthetic-library/*` endpoints then.

Everything else — the run registry, checkpoint pattern, propose-* tools, apply-changes endpoint, trace inspector, SSE telemetry, copilot chat shape — we lift file-by-file. Same substrate.
