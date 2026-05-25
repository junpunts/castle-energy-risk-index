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

### 3.0 Research scaffolds (`supabase/migrations/000-research.sql`)

The long-form scenario brief, hedges library, and analyst notes that ground every LLM call live in Supabase too. Same audit pattern as canonical state.

```sql
create table archetype_research (
  archetype_id text primary key references archetypes(id) on delete cascade,
  scaffold_md text not null,                  -- long-form scenario brief, markdown
  contracts_library jsonb not null default '[]'::jsonb,  -- per-archetype synthetic + real contract universe
  notes_md text,                              -- freeform analyst notes
  updated_at timestamptz not null default now()
);

create table archetype_research_revisions (
  id bigserial primary key,
  archetype_id text not null references archetypes(id) on delete cascade,
  scaffold_md text not null,
  contracts_library jsonb not null,
  notes_md text,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create index idx_research_rev on archetype_research_revisions(archetype_id, updated_at desc);
```

Trigger writes a revision on every update to `archetype_research`:

```sql
create function snapshot_research_revision() returns trigger language plpgsql as $$
begin
  insert into archetype_research_revisions
    (archetype_id, scaffold_md, contracts_library, notes_md, updated_by)
    values (old.archetype_id, old.scaffold_md, old.contracts_library, old.notes_md,
            coalesce(current_setting('app.updated_by', true), 'unknown'));
  return new;
end $$;

create trigger trg_research_revision before update on archetype_research
  for each row execute function snapshot_research_revision();
```

The agent's `read_research_scaffold` tool reads from this table. The admin can edit scaffold/contracts_library/notes in a Markdown editor on the archetype page. The `data/research/offshore-wind-*` files in git become the **initial seed payload only** — loaded once by `supabase/seed.sql`, then they live in the DB and the git copies are static reference.

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
  status text not null,                      -- 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'aborted'
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  current_stage text,
  error_message text,
  cost_usd numeric(10,4) default 0,
  triggered_by text not null,                -- 'cron' | 'admin:<user>' | 'copilot:<session_id>'
  claimed_by text,                           -- worker id, set on claim_next_run
  claimed_at timestamptz,
  abort_requested boolean not null default false  -- web flips this; worker honors at stage boundaries
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

### 5.3 Concurrency

Two axes of parallelism, sharing one global limiter.

**Axis 1 — within stage 4 (`update_existing_risks`).** Each Sonnet call in stage 4 is independent: same shared inputs (research scaffold), different per-risk evidence packets, non-overlapping outputs. Fan out:

```ts
import pLimit from 'p-limit'

const limit = sharedLLMLimiter            // see Axis 2 below
const results = await Promise.allSettled(
  Object.entries(changes).map(([riskId, evidence]) =>
    limit(() => updateRisk(riskId, evidence, ctx))
  )
)

for (const r of results) {
  if (r.status === 'rejected') {
    // log and queue a requires_review proposal — do not crash the stage
  }
}
```

Three things to get right:
- **`Promise.allSettled`, not `Promise.all`.** A failed sibling must not discard the 8 successful proposals.
- **Cost / log telemetry merging.** Every `cost()` and `log()` invocation gets tagged with the `risk_id` it came from, so the admin trace UI can group interleaved messages.
- **Retry once on transient errors** (5xx, rate-limit, timeout) before marking the call's would-be proposal as `requires_review` with the error attached.

**Axis 2 — across archetypes (cron `?archetype=all`).** Different archetypes touch different rows; nothing is shared except the limiter. Run concurrently:

```ts
await Promise.allSettled(
  archetypeIds.map(id => limit(() => runDailyRefresh(id, ctx)))
)
```

**Global limiter** (`lib/llm/limiter.ts`): one `p-limit(10)` shared across the whole process. Internal-stage fan-out and cross-archetype fan-out both go through it. With Sonnet tier-2 limits (50 RPM, 40k input TPM, 8k output TPM) this keeps us well under ceiling while letting wall-time scale roughly linearly with parallelism. For an active news day across 5 archetypes × ~5 affected risks each, this turns a ~4-minute sequential run into ~30 seconds.

**What we do *not* parallelize:**

- **Stage 5 (Pass B, Opus).** One call per archetype already — parallelism here happens at Axis 2.
- **Stage 6 (`apply_auto_proposals`) within an archetype.** Each apply takes an optimistic-concurrency check on `archetypes.state_version` via the `apply_archetype_revision` SQL function. Concurrent applies on the same row produce retry-loops and wasted work. Apply *sequentially* per archetype; parallelism across archetypes is fine because they're different rows.

### 5.4 Checkpoints & resume

Same shape as castle-dashboard's `loadCompletedCheckpoints`. Load all `pipeline_traces` rows with non-null `output_json` for the run, skip those stages, start from the first unfinished one.

### 5.5 Run registry (abort)

Module-level `Map<string, AbortController>` in `lib/pipeline/run-registry.ts`. Ported from castle-dashboard verbatim — 36 lines, works on Next.js as-is. Caveat: it's process-local, so if you scale to >1 instance, swap for Postgres `LISTEN/NOTIFY` polled from each instance.

### 5.6 Cron

Render Cron Job. Runs `0 10 * * 1-5` ET. One curl call into the web service, which validates `CRON_SECRET` and enqueues one `pipeline_runs` row per archetype with `status='queued'`. The worker picks them up.

```bash
# scripts/trigger-cron.mjs
curl -fsS -X POST "$WEB_URL/api/cron/daily-refresh?archetype=all" \
  -H "x-cron-secret: $CRON_SECRET"
```

Cron and worker never talk directly. The `pipeline_runs` table is the seam.

### 5.7 Deployment topology

Three Render services, one repo, one Docker build.

**Service A — Web (`castle-energy-risk-index`).** Next.js. Public dashboard, admin UI, API routes. 24/7. No long-running work on the request thread — all it does for pipelines is insert `pipeline_runs` rows with `status='queued'` and tail trace logs over SSE for the admin run page.

**Service B — Worker (`castle-energy-risk-index-worker`).** Long-lived Node process polling Supabase for queued runs. Holds the run-registry, fans out LLM calls (per §5.3 concurrency), writes traces + proposals + applies. No HTTP surface.

**Service C — Cron.** Render Cron Job. Single curl to Service A.

Same Docker image for A and B; different start commands.

```yaml
# render.yaml
services:
  - type: web
    name: castle-energy-risk-index
    runtime: node
    plan: standard
    buildCommand: npm ci && npm run build
    startCommand: npm start
    envVars:
      - fromGroup: castle-eri-shared
    healthCheckPath: /api/health

  - type: worker
    name: castle-energy-risk-index-worker
    runtime: node
    plan: standard
    buildCommand: npm ci && npm run build
    startCommand: npm run worker
    envVars:
      - fromGroup: castle-eri-shared

  - type: cron
    name: castle-eri-daily-refresh
    runtime: node
    schedule: "0 10 * * 1-5"
    buildCommand: npm ci
    startCommand: node scripts/trigger-cron.mjs daily-refresh
    envVars:
      - key: WEB_URL
        sync: false
      - key: CRON_SECRET
        sync: false

envVarGroups:
  - name: castle-eri-shared
    envVars:
      - { key: ANTHROPIC_API_KEY, sync: false }
      - { key: NEXT_PUBLIC_SUPABASE_URL, sync: false }
      - { key: NEXT_PUBLIC_SUPABASE_ANON_KEY, sync: false }
      - { key: SUPABASE_SERVICE_ROLE_KEY, sync: false }
      - { key: SCRAPER_SUPABASE_URL, sync: false }
      - { key: SCRAPER_SUPABASE_SERVICE_ROLE_KEY, sync: false }
      - { key: CRON_SECRET, sync: false }
      - { key: REVALIDATE_TOKEN, sync: false }
      - { key: ADMIN_EMAILS, sync: false }
```

**Queue mechanics.** `pipeline_runs.status` gains two values: `queued` and `claimed`. Worker loop:

```ts
// scripts/worker.ts
const WORKER_ID = crypto.randomUUID()

while (!shuttingDown) {
  const { data: run } = await sb.rpc('claim_next_run', { worker_id: WORKER_ID })
  if (!run) { await sleep(2000); continue }
  try {
    await executePipeline(run)
  } catch (err) {
    await markRunFailed(run.id, err)
  }
}
```

The `claim_next_run` SQL function uses `for update skip locked` so concurrent workers each grab a distinct row without fighting:

```sql
create function claim_next_run(worker_id text) returns pipeline_runs language sql as $$
  update pipeline_runs
  set status = 'claimed', claimed_by = worker_id, claimed_at = now()
  where id = (
    select id from pipeline_runs
    where status = 'queued'
    order by started_at
    limit 1
    for update skip locked
  )
  returning *;
$$;
```

Add `claimed_by text` and `claimed_at timestamptz` columns to the `pipeline_runs` migration.

**Aborts across web ↔ worker.** Web can't call `.abort()` on a worker's `AbortController` directly because they're different processes. Instead: web flips `pipeline_runs.abort_requested = true`, and the worker checks this column at every stage boundary (it's already loading the run row to update `current_stage`, so it's a free read). On `true`, the worker raises `RunAborted` and the orchestrator marks the run aborted. Same UX as before — different mechanism.

Add `abort_requested boolean not null default false` to `pipeline_runs`.

**Worker restarts cleanly.** Render redeploys = worker SIGTERM, then restart. The shutdown handler sets `shuttingDown=true`, finishes the current stage if it can within Render's 30s grace, then exits. The half-finished run stays `claimed`; on next worker boot, a reclaimer job (runs every 60s) finds any runs `claimed > 5 minutes ago` with no recent trace activity and flips them back to `queued`. The next worker boot picks them up and resumes from the last completed checkpoint.

**Scaling.** Start with 1 worker replica. Bump to 2–3 when you have 5+ archetypes and the daily refresh window stretches past acceptable. The queue + `skip locked` pattern means N workers distribute load automatically; the shared `p-limit(10)` lives per-process so total in-flight LLM calls is `N × 10`.

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

## 10. Build plan

Each milestone is a coherent shippable slice. The order is chosen so that after every milestone the system *runs end-to-end at some level of completeness* — no milestone leaves you with broken code on disk.

### M0 — Infrastructure bootstrap (½ day)
Goal: empty repo, all three Render services deploying green.
1. `npx create-next-app castle-energy-risk-index` (TS, app router, tailwind off — we use the existing `colors_and_type.css`).
2. Drop in the existing assets: `public/assets/css/colors_and_type.css`, fonts, svgs.
3. Add `render.yaml` from §5.7. Stub web (`app/page.tsx` returns "ok"), worker (`scripts/worker.ts` logs "alive" and sleeps), cron (curls a `/api/health` endpoint).
4. Create Supabase project (dev). Add env vars to Render. Verify all three services deploy.
5. **Done when:** web serves a placeholder, worker logs "alive" continuously, cron runs and gets a 200 from `/api/health`.

### M1 — Schema + seed (½ day)
Goal: offshore-wind data lives in Supabase.
1. Write migrations 000–005 (research, archetypes, pipelines with the new queue columns, proposals, copilot, news_cache).
2. Add the `apply_archetype_revision` and `claim_next_run` SQL functions.
3. Write `supabase/seed.sql`: reads `data/research/offshore-wind-*` files + `public/data/offshore-wind.json`, INSERTs one `archetype_research` row + one `archetypes` row + the initial `archetype_revisions` row.
4. Apply with `supabase db push` and `npm run db:seed`.
5. **Done when:** `select state->'archetype'->>'composite' from archetypes` returns `71`.

### M2 — Public dashboard reads from Supabase (1 day)
Goal: the v2 dashboard renders, pixel-identical, off live DB data.
1. Write `lib/supabase/server.ts` + `browser.ts`, `lib/archetypes/read.ts`.
2. Port `public/concepts/v2/index.html` → `app/(public)/page.tsx`. Read with `readAllArchetypes()`. Use server components.
3. Port `archetype.html` → `app/(public)/archetypes/[id]/page.tsx`. The waterfall SVG generator goes to `lib/charts/waterfall.ts` verbatim.
4. Port `risk.html` → `app/(public)/archetypes/[id]/risks/[riskId]/page.tsx`. The attention bar generator + timeline component come along.
5. Add `export const revalidate = 60` to public routes. Add `/api/revalidate` endpoint that bumps tags.
6. Zod schemas in `lib/schemas.ts` for `ArchetypeBundle`, `Risk`, `RiskDetail`. Parse on read.
7. **Done when:** `/` and `/archetypes/offshore-wind` and `/archetypes/offshore-wind/risks/ow1` render. The whole site looks identical to the static prototype.

### M3 — Admin shell + auth (1 day)
Goal: you can log in, browse the data, do nothing else.
1. Supabase Auth magic-link flow. `ADMIN_EMAILS` allowlist middleware on `/admin/*`.
2. `/admin/page.tsx` — placeholder dashboard (empty active-runs / open-proposals lists).
3. `/admin/archetypes/[id]/page.tsx` — read-only mirror of the public archetype page.
4. `/admin/proposals/page.tsx` — empty inbox.
5. Supabase Realtime subscriptions for `pipeline_runs` and `proposals` tables (the lists are empty for now but the wiring is there).
6. **Done when:** unauth user → magic-link page. Authed allowlisted user → admin pages.

### M4 — Proposal flow end-to-end (1 day)
Goal: you can manually edit a risk's probability via the admin UI.
1. `lib/archetypes/derive.ts` + `lib/archetypes/validate.ts` (Zod + invariants from BACKEND.md §4).
2. `POST /api/admin/proposals` — manual proposal creation.
3. `POST /api/admin/proposals/[id]/apply` — calls `apply_archetype_revision`.
4. Risk-editor UI (`/admin/archetypes/[id]/risks/[riskId]`) — editable form, "Save" creates auto-approved proposal + applies.
5. Verify ISR revalidation: edit → public page reflects within 60s.
6. **Done when:** you bump ow5 probability from 0.70 to 0.68 in the admin UI, hit save, see the change on the public dashboard, see the proposal in the inbox marked `applied`, see the new row in `archetype_revisions`.

### M5 — Pipeline runner + first stage (1 day)
Goal: queue a run from the admin UI, watch a single stage execute.
1. Port `lib/pipeline/run-registry.ts` and `lib/pipeline/checkpoints.ts` from castle-dashboard (line-for-line; they target Supabase already).
2. Write `lib/pipeline/index.ts` — stage abstraction, orchestrator, registry of pipeline definitions.
3. Write `scripts/worker.ts` — claim loop, calls orchestrator, handles SIGTERM. Implement the reclaimer pass.
4. Implement one trivial stage: `recompute_derived` (no LLM, no adapters — just reads `state`, runs `deriveFields`, queues an auto-apply proposal if anything changed).
5. Pipeline `rebuild_archetype` registers this single stage.
6. `POST /api/admin/pipelines/[name]/run` enqueues a row. `GET /api/admin/pipelines/runs/[id]/stream` SSE-tails `pipeline_traces` for that run.
7. Admin run-detail page renders the SSE.
8. **Done when:** click "Re-run rebuild on offshore-wind" → run appears in active-runs → completes → trace inspector shows the stage timing.

### M6 — First LLM stage (1 day)
Goal: a Sonnet call runs inside the pipeline and emits real proposals.
1. Write the cost tracker (`lib/llm/cost.ts`) — token counting → USD from a rate table.
2. Write `lib/llm/limiter.ts` — `p-limit(10)` global.
3. Implement `update_existing_risks` stage (§5.2 stage 4) but with a synthetic input: a hand-crafted `changes` packet stub.
4. Write the Pass A prompt + Anthropic tool definitions for `propose_risk_update`, `propose_news_item`, `propose_hedge_update`.
5. Wire up `promise.allSettled` + tagged telemetry from §5.3.
6. **Done when:** manually trigger the stage with a stub changes packet → it makes 1 Sonnet call → emits ≥1 proposal → proposal lands in inbox.

### M7 — Adapters + diff (2 days)
Goal: the daily refresh has real source data.
1. Define the adapter contract (`lib/adapters/types.ts`): `{ fetch(since: Date): Promise<NewsItem[]> }` with retry/timeout decorators.
2. Implement 3 adapters first (the highest-leverage feeds): Federal Register, Congress.gov, the castle-scraper Supabase mirror.
3. Implement `pull_sources` stage — runs adapters in parallel, dedupes by URL, inserts into `news_cache`.
4. Implement `snapshot_hedge_prices` stage — reads from castle-scraper.
5. Implement `diff_against_prior` stage — the **single highest-stakes design choice still open** (see "Open design choices" below). Start with keyword matching (cheap, fast); add embeddings later if precision is bad.
6. **Done when:** trigger daily refresh → news_cache fills up → changes packet is non-empty → Pass A runs against real evidence → proposals look reasonable.

### M8 — Full daily refresh end-to-end (1 day)
Goal: every stage from §5.2 runs, proposals queue or auto-apply correctly.
1. Implement `surface_new_risks` (Pass B with Opus). Always queues for review.
2. Implement `apply_auto_proposals` stage — sequential per archetype.
3. Implement `notify` stage — Slack webhook or skip if unset.
4. Hook up the Render Cron service to actually fire.
5. Add abort-via-column polling at every stage boundary.
6. **Done when:** the cron schedule fires Monday 6am ET → web enqueues 1 run → worker claims and processes it → public page updates → Slack notification arrives → trace inspector shows the full breakdown.

### M9 — Copilot (1.5 days)
Goal: chat with the agent and have it propose edits.
1. Implement `lib/agent/tools.ts` — all `propose_*` tools + read/search tools.
2. Implement the chat loop in `app/api/admin/copilot/sessions/[id]/chat/route.ts` (SSE, tool-call loop, message persistence).
3. Chat panel UI — bubble transcript + proposal rail (`components/copilot/Panel.tsx`).
4. Open-from-anywhere button on `/admin/archetypes/[id]` and `.../risks/[riskId]`.
5. **Done when:** you say "lower ow5 to 0.62 and pin the Politico item" → copilot calls `propose_risk_update` + `propose_news_item` → both land in the rail → you approve both → public dashboard reflects.

### M10 — Polish & deploy production (1 day)
1. Production Supabase project; seed it.
2. Render production services from the same `render.yaml`.
3. Sentry drop-in (optional but recommended).
4. `/api/health` includes a Supabase ping and a worker-last-seen check.
5. README with operator runbook (how to seed an archetype, how to roll back a bad apply, how to interpret a failed run in the trace inspector).
6. **Done when:** the app is live at `castle-eri.your-domain.com`, the daily refresh runs unattended for one week, and you've successfully used the copilot to make one real edit.

**Total estimate: ~11–13 working days for a single engineer.** Each milestone is independently shippable; if priorities shift, you can stop after M5 and have a "manual editor with no agent" product, or stop after M8 and have a "fully-automated daily refresh with no chat."

### Open design choices that should be locked before M7

1. **Diff/matching algorithm (M7 step 5).** How do new news items match to existing risks?
   - **Baseline:** TF-IDF / keyword match against risk title + citation + research-scaffold section. Fast, deterministic, easy to debug.
   - **Better:** OpenAI embeddings on news_cache rows + risk descriptions, top-k nearest. More precision, more cost, harder to debug.
   - **Recommended:** ship baseline in M7, instrument false-positive / false-negative rates against a hand-labeled set in week 2, upgrade to embeddings in M11 if needed. Don't pre-optimize.

2. **Auto-apply policy.** Currently: probability moves ≤15pp auto-apply, view rewrites always queue. Worth pinning these as constants in `lib/policy.ts` so you can tune them in one place.

3. **Synthetic-contract management.** A near-term gap (flagged earlier). My recommendation: do not build a full synthetic-contracts admin UI in this build cycle. Surface them through `archetype_research.contracts_library` jsonb (analyst-editable as part of the research scaffold), and let the daily refresh propose updates to their probabilities via the same proposal flow. Full library service can come later if needed.

---

## 11. What we're not copying from castle-dashboard

- **The dependency-decomposition / event-research / portfolio pipeline** — they figure out a company's risks from a URL. Our archetypes start from a curated research scaffold, so the pipeline is shorter and the agent is more constrained.
- **Multi-tenant ownership, sharing** — one admin allowlist. Easy to expand later because we're already on Supabase Auth.
- **Langfuse / Sentry** — add later as drop-ins if needed.
- **The synthetic-contracts library service** — we have `offshore-wind-hedges.json` as a filtered static input. If we ever need a cross-archetype live library, lift their `synthetic-library/*` endpoints then.

Everything else — the run registry, checkpoint pattern, propose-* tools, apply-changes endpoint, trace inspector, SSE telemetry, copilot chat shape — we lift file-by-file. Same substrate.
