# Castle Energy Risk Index — Admin & Copilot Design

**Audience:** the engineer (or agent) building the admin layer and the agentic backend.
**Stack:** **everything is one Next.js 14 app.** Public dashboard, admin pages, copilot chat, pipeline runner, daily cron — all in the same repo, same TS codebase, single deploy.

> **Inspiration:** `castle-main/castle-dashboard` is the reference implementation. We lift its architecture wholesale because the substrate matches: Next.js app router, Anthropic SDK with tool calls, structured proposals that the admin approves, run-registry + checkpoints for pipelines, SSE for live telemetry. We do *not* lift its full pipeline (their problem of company-research-from-URL is harder than ours).

---

## 1. Stack

| Concern              | Choice                                              | Why                                                              |
|----------------------|-----------------------------------------------------|------------------------------------------------------------------|
| Framework            | Next.js 14 (app router)                             | Public site, admin pages, and API routes in one app.            |
| Public dashboard     | Next.js pages under `app/(public)/*`                | Replaces the current static `public/concepts/v2/*`. Keeps the same HTML structure, CSS, and SVG charts — just rendered by React. |
| Admin               | Next.js pages under `app/admin/*`                    | Behind auth.                                                     |
| Database            | SQLite via `better-sqlite3` at `data/admin.db`      | One file. Migrations are numbered .sql files. Swap for Postgres later if you ever need to. |
| Auth                | `ADMIN_API_KEY` env var → signed JWT cookie         | One admin. Don't overbuild.                                      |
| LLM                 | `@anthropic-ai/sdk` — Sonnet for everything, Opus only for new-risk surfacing | Same split castle-dashboard uses.                                |
| Pipeline runner     | In-process async worker pool                         | Single-host single-process. The castle-dashboard `run-registry.ts` pattern, ported. |
| Live telemetry      | Server-sent events from API routes                  | Same as castle-dashboard's `/regenerate/stream/route.ts`.        |
| Cron                | `vercel.json` cron config OR a Render cron job that hits an internal API route | One entrypoint, two triggers.                                    |
| Hosting             | Render or Vercel — single deploy                    | Public + admin + cron all in one app.                            |

Layout:

```
castle-energy-risk-index/
├── src/
│   ├── app/
│   │   ├── (public)/                     # public dashboard routes
│   │   │   ├── page.tsx                  # composite + archetype grid (was concepts/v2/index.html)
│   │   │   ├── archetypes/[id]/page.tsx  # was archetype.html
│   │   │   └── archetypes/[id]/risks/[riskId]/page.tsx  # was risk.html
│   │   ├── admin/
│   │   │   ├── page.tsx                  # admin dashboard
│   │   │   ├── archetypes/[id]/page.tsx  # archetype editor
│   │   │   ├── archetypes/[id]/risks/[riskId]/page.tsx  # risk editor
│   │   │   ├── proposals/page.tsx        # inbox
│   │   │   └── traces/[runId]/page.tsx   # pipeline trace detail
│   │   └── api/
│   │       ├── public/
│   │       │   └── archetypes/[id]/route.ts   # the JSON the public pages read
│   │       ├── admin/
│   │       │   ├── auth/login/route.ts
│   │       │   ├── pipelines/
│   │       │   │   ├── [name]/run/route.ts
│   │       │   │   ├── runs/route.ts
│   │       │   │   ├── runs/[id]/route.ts
│   │       │   │   ├── runs/[id]/abort/route.ts
│   │       │   │   ├── runs/[id]/resume/route.ts
│   │       │   │   └── runs/[id]/stream/route.ts        # SSE
│   │       │   ├── proposals/route.ts
│   │       │   ├── proposals/[id]/apply/route.ts
│   │       │   ├── proposals/[id]/reject/route.ts
│   │       │   └── copilot/
│   │       │       ├── sessions/route.ts
│   │       │       ├── sessions/[id]/chat/route.ts       # SSE chat
│   │       │       └── sessions/[id]/messages/route.ts
│   │       └── cron/daily-refresh/route.ts                # hit by cron
│   ├── components/
│   │   ├── public/                       # archetype grid, waterfall chart, risk table — server components
│   │   ├── admin/                        # editable risk row, proposal card, trace timeline
│   │   └── copilot/                      # chat panel, proposal rail
│   ├── lib/
│   │   ├── db.ts                         # better-sqlite3 singleton
│   │   ├── auth.ts                       # JWT cookie helpers
│   │   ├── archetypes/                   # read/write the canonical JSON files
│   │   ├── pipeline/
│   │   │   ├── index.ts                  # registry of pipeline definitions
│   │   │   ├── checkpoints.ts            # ported from castle-dashboard
│   │   │   ├── run-registry.ts           # ported from castle-dashboard
│   │   │   ├── stages/                   # one file per stage
│   │   │   └── daily-refresh.ts          # composes stages into a pipeline
│   │   ├── adapters/                     # one per source (federal register, congress.gov, kalshi, …)
│   │   ├── agent/
│   │   │   ├── tools.ts                  # propose_* tools (mirrors proposal-tools.ts)
│   │   │   ├── system-prompt.ts
│   │   │   └── chat.ts                   # the tool-calling loop
│   │   └── research/                     # static read of data/research/*
│   └── types/                            # shared TS types
├── data/
│   ├── archetypes/<id>.json              # canonical state — the file the public pages read
│   ├── research/                         # the static scaffold + critical contracts + hedges JSON (unchanged)
│   ├── audit/                            # daily diff snapshots
│   └── admin.db                          # SQLite
├── migrations/                           # numbered .sql files
├── public/                               # Next.js public assets (logo, fonts, css imports)
│   ├── assets/                           # the existing colors_and_type.css, svgs, fonts
│   └── data/                             # OPTIONAL: static export of archetypes JSON for CDN reads
├── BACKEND.md
├── ADMIN.md                              # this file
├── next.config.js
├── package.json
└── tsconfig.json
```

### What happens to the current `public/concepts/v2/` files

They become React components. The HTML structure, CSS, and SVG chart code are preserved verbatim — I'm not redesigning anything, just moving the rendering from `<script type="module">` into server-component JSX. Concretely:

- `public/concepts/v2/index.html` → `src/app/(public)/page.tsx` + `<ArchetypeGrid />` component. Same layout, same `_v2.css` import.
- `public/concepts/v2/archetype.html` → `src/app/(public)/archetypes/[id]/page.tsx` + `<Waterfall />`, `<NewsList />`, `<RisksTable />` components. The waterfall's exact SVG generator becomes a function in `lib/charts/waterfall.ts`.
- `public/concepts/v2/risk.html` → `src/app/(public)/archetypes/[id]/risks/[riskId]/page.tsx` + `<AttentionBars />`, `<Timeline />`, `<HedgesList />` components.

The page-level data fetch is `await readArchetype(id)` (server-side SQLite + JSON file read). No client-side fetch, no `_data.js` shim — the JSON file *is* the canonical state and server components read it directly. This eliminates the §1/§1.1 wiring change from BACKEND.md entirely — those notes are now obsolete and BACKEND.md gets a small amendment.

### Static export option

If you want the public dashboard to stay a CDN-cacheable static export, the public route group supports `export const dynamic = 'force-static'` and a build step writes the rendered HTML to `out/`. The admin and API routes stay dynamic. Same repo, different render mode per route group.

---

## 2. Mental model

Three things to manage. (Same as before — the substrate change doesn't move the abstraction.)

1. **Pipelines** — multi-stage data updates. Each pipeline has stages; each stage produces a checkpoint; the whole run is resumable and abortable.
2. **Proposals** — *suggested edits* to `data/archetypes/<id>.json`. Either the agent emits these (copilot, daily-refresh pass B, news monitor) or you author them by hand. Nothing in the canonical JSON changes until a proposal is `applied`.
3. **The copilot** — a chat scoped to the page you opened it from. Its only output mechanism is to emit proposals via tool calls. It never writes directly.

This three-way split keeps automation, suggestion, and human authority cleanly separable, and makes every admin action auditable.

---

## 3. Pipelines

### 3.1 Stages

A pipeline is an ordered list of *stages*. Each stage:

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
  llm: Anthropic                          // shared SDK client
}
```

This shape ports cleanly from castle-dashboard's `auto-pipeline.ts`. Stages check `signal.aborted` (or call a `checkAbort()` helper) at every yield point so they can be cancelled cleanly.

The **daily-refresh pipeline** (`lib/pipeline/daily-refresh.ts`):

| # | Stage                       | Output                                                 |
|---|-----------------------------|--------------------------------------------------------|
| 1 | `pull_sources`              | Raw source items from each adapter, into `news_cache`. |
| 2 | `diff_against_prior`        | A `changes` packet keyed by risk_id.                   |
| 3 | `update_existing_risks`     | One LLM call per affected risk (BACKEND.md Pass A).     |
| 4 | `surface_new_risks`         | BACKEND.md Pass B — outputs proposals, never writes directly. |
| 5 | `recompute_derived`         | composite, risks_total, attention_weekly.              |
| 6 | `validate`                  | Zod schema + invariant checks.                          |
| 7 | `write_and_commit`          | Atomic file write, git commit on `data-refresh` branch.|
| 8 | `notify`                    | Slack/email if configured.                             |

Other pipelines registered in the same registry:

- **`rebuild_archetype`** — bypasses the diff, regenerates from `data/research/<archetype>/*`. For onboarding a new archetype or after meaningful scaffold changes.
- **`refresh_hedges_only`** — pulls fresh Kalshi/Polymarket prices for all `hedges[]` entries across archetypes. Faster than a full refresh.
- **`apply_proposals`** — turns a proposal id (or batch) into edits. Always runs stages 5–7 to keep derived fields consistent.

### 3.2 Checkpoints

Each stage writes a row to SQLite when it starts and updates the same row when it completes. Resume logic: load completed checkpoints for a run, skip those stages, start from the first unfinished one. Same shape as `castle-dashboard/src/lib/pipeline/checkpoints.ts`:

```ts
// migrations/001-pipeline.sql
CREATE TABLE pipeline_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_run_id TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  input_json TEXT,
  output_json TEXT,       -- null while in-flight, populated on success
  error TEXT,
  cost_usd REAL DEFAULT 0
);
CREATE INDEX idx_traces_run ON pipeline_traces(pipeline_run_id);
```

### 3.3 Run registry

A module-level `Map<string, AbortController>` keyed by `runId`. Register on start, unregister on completion. `POST /api/admin/pipelines/runs/[id]/abort` calls `.abort()` on the controller; the next stage that checks `signal.aborted` raises and the orchestrator marks the run aborted (completed-stage checkpoints stay intact so resume still works). Ported from `castle-dashboard/src/lib/pipeline/run-registry.ts` almost verbatim — the file is 36 lines and works as-is on Next.js.

### 3.4 The cron entrypoint

```jsonc
// vercel.json (or render.yaml cron section)
{
  "crons": [
    { "path": "/api/cron/daily-refresh?archetype=all", "schedule": "0 10 * * 1-5" }
  ]
}
```

The route at `app/api/cron/daily-refresh/route.ts` validates a `CRON_SECRET` header and kicks off the same pipeline registry the admin UI uses. Whether triggered by cron, a browser button, or curl, the same trace rows get written and the same audit diffs end up on disk.

---

## 4. The admin app — five pages

All under `/admin/*`, all behind the JWT cookie set by `/api/admin/auth/login`.

### 4.1 `/admin` — dashboard
- **Active runs** — table of in-flight pipelines. Columns: archetype, pipeline name, current stage, elapsed, abort button. Live-updates over SSE.
- **Recent runs** — last 20. Click → trace detail page.
- **Open proposals** — pending proposals grouped by archetype. Each renders as a diff card with `Approve` / `Edit` / `Reject` buttons.

Patterns lifted: castle-dashboard's `/admin/page.tsx` (the pipeline cards + live cost telemetry) and `/admin/curate/[id]` (the proposal-diff layout).

### 4.2 `/admin/archetypes/[id]` — archetype editor
Same risk table the public dashboard shows, but editable. Three actions in the header:
- **Re-run daily refresh** — triggers the full pipeline; live telemetry panel slides in from the right.
- **Refresh hedges only** — faster.
- **Open copilot** — opens the chat panel scoped to this archetype.

Direct edits to risks (probability, impact, citation, view paragraph) are written as auto-approved proposals so the audit log captures who changed what and when. No "edit the file directly" path — every change goes through the proposal pipeline so derived fields stay consistent.

### 4.3 `/admin/archetypes/[id]/risks/[riskId]` — risk editor
Renders the same `risk.html` layout the public site shows on the left half, with editable forms on the right for every field (`view`, `events[]`, `hedges[]`, `weekly[]`, …). Save = create proposal → apply.

### 4.4 `/admin/proposals` — proposal inbox
Filterable by archetype, source (cron, copilot, news monitor, manual), and status. Bulk approve/reject. Same flow castle-dashboard uses in `/admin/synthetic-contracts` + `apply-changes`.

### 4.5 `/admin/traces/[runId]` — pipeline trace inspector
Stage-by-stage view. For each stage: input, output (truncated), duration, cost, LLM calls made, raw prompt + response. Modeled on castle-dashboard `/admin/traces/[runId]/page.tsx`.

---

## 5. The copilot

Same architectural idea as `castle-dashboard/src/app/api/internal/dashboards/[id]/agent/route.ts`: a chat endpoint that hands the model a curated tool set; the model emits structured tool calls; the calls become proposals; proposals show up in the inbox.

### 5.1 Tools (`lib/agent/tools.ts`)

| Tool                       | Purpose                                                                 |
|---------------------------|--------------------------------------------------------------------------|
| `read_archetype`          | Get the current archetype JSON.                                         |
| `read_risk`               | Get one risk's `risk_detail`.                                            |
| `read_research_scaffold`  | Get the research-scaffold markdown section for a scenario.               |
| `search_hedges_universe`  | Search the contract library + filtered Kalshi/Polymarket universe.       |
| `search_news_cache`       | Search recent source items pulled by the adapters.                       |
| `propose_risk_update`     | Update fields on an existing risk. Required: `risk_id`, `field`, `new_value`, `reasoning`. |
| `propose_add_risk`        | Add a new risk to the archetype.                                         |
| `propose_remove_risk`     | Retire a risk (sets `status: retired`; keeps the id for audit).         |
| `propose_news_item`       | Pin a news item into `news[]`.                                           |
| `propose_hedge_update`    | Add/edit/remove a hedge entry on a risk.                                |
| `trigger_pipeline`        | Kick off a pipeline run; stream telemetry back into the chat.            |
| `web_search`              | Anthropic web-search tool — same flag castle-dashboard uses on Opus event-research. |

**Hard rule:** the copilot has *no* direct-write tool. Every state-changing action flows through a `propose_*` call. Approval is the only way to mutate `data/archetypes/`. This mirrors castle-dashboard's `proposal-tools.ts` exactly.

### 5.2 The chat endpoint

`POST /api/admin/copilot/sessions/[id]/chat` — SSE stream.

Request: `{ message: string, context: { archetypeId, riskId? } }`

Server loop (same shape as castle-dashboard's `agent/route.ts`):
1. Load chat history for the session.
2. Build system prompt with archetype context + scoped risk (see §5.3).
3. Call `anthropic.messages.stream({ model, tools, messages })`.
4. For each `tool_use` block: execute it. Search tools return data into the next message; `propose_*` tools insert a proposal row and stream the proposal id back to the client.
5. On completion, persist the assistant turn and return the list of proposal ids emitted.

Frontend (`components/copilot/Panel.tsx`):
- Bubble-style transcript on the left.
- Right-side rail: live list of proposals emitted in this session, each with Approve / Edit / Reject inline. Approve → calls `/api/admin/proposals/[id]/apply`.

### 5.3 System prompt skeleton

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

### 5.4 What this looks like in practice

You open the offshore-wind archetype, click **Copilot**, type:

> "The Senate dropped FEOC tightening from the reconciliation text yesterday. Update ow5 probability down and add a news item."

Copilot:
1. Calls `read_risk('ow5')` and `search_news_cache('FEOC reconciliation Senate')`.
2. Replies: "I found the Politico item from yesterday. ow5 was 0.70; proposing 0.62 — material narrowing remains in the House version. Also proposing a news pin."
3. Emits `propose_risk_update` and `propose_news_item` tool calls.
4. The right rail shows both proposals. You hit Approve on both.
5. `/apply` runs, recomputes composite, writes the JSON, commits.

---

## 6. Applying proposals

`POST /api/admin/proposals/[id]/apply` — same shape as castle-dashboard's `apply-changes/route.ts`. Steps:

1. Load proposal row, verify status is `pending`.
2. Load current `data/archetypes/<id>.json`.
3. Apply the proposal's op to an in-memory copy.
4. Run derived-fields recompute (composite, deltas, attention_weekly, news_this_week).
5. Validate against the Zod schema from BACKEND.md §4.
6. Write atomically, commit to `data-refresh` branch.
7. Mark proposal `applied`, store the resulting file hash on the row.
8. Append to the archetype's `audit.diff` block so the next-day cron sees the change.

Proposals never mutate state through any other path. Every change to canonical data has:
- A proposal id.
- A `reasoning` field.
- A `source` field (cron / copilot / manual / news monitor / pass-B).
- A `created_by` user.
- A git commit hash on the resulting file.

---

## 7. Schema

```sql
-- migrations/001-pipeline.sql
CREATE TABLE pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_name TEXT NOT NULL,
  archetype_id TEXT,
  status TEXT NOT NULL,                   -- 'running' | 'completed' | 'failed' | 'aborted'
  started_at TEXT NOT NULL,
  completed_at TEXT,
  current_stage TEXT,
  error_message TEXT,
  cost_usd REAL DEFAULT 0,
  triggered_by TEXT                       -- 'cron' | 'admin:<user>' | 'copilot:<sessionId>'
);
CREATE INDEX idx_runs_status ON pipeline_runs(status);
CREATE INDEX idx_runs_archetype ON pipeline_runs(archetype_id);

CREATE TABLE pipeline_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
  stage_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  cost_usd REAL DEFAULT 0
);

-- migrations/002-proposals.sql
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  archetype_id TEXT NOT NULL,
  op TEXT NOT NULL,                       -- 'update_risk' | 'add_risk' | 'remove_risk' | 'pin_news' | 'update_hedge'
  target TEXT,                            -- risk_id or hedge ticker
  payload_json TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  source TEXT NOT NULL,                   -- 'cron-passB' | 'copilot:<sessionId>' | 'manual' | 'news-monitor'
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'applied' | 'rejected' | 'superseded'
  applied_at TEXT,
  applied_commit_hash TEXT
);
CREATE INDEX idx_props_status ON proposals(status, archetype_id);

-- migrations/003-copilot.sql
CREATE TABLE copilot_sessions (
  id TEXT PRIMARY KEY,
  archetype_id TEXT,
  risk_id TEXT,
  started_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  summary TEXT
);
CREATE TABLE copilot_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES copilot_sessions(id),
  role TEXT NOT NULL,                     -- 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content_json TEXT NOT NULL,
  cost_usd REAL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- migrations/004-news-cache.sql
CREATE TABLE news_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  matched_archetypes TEXT,                -- JSON array
  matched_risks TEXT                      -- JSON array of risk_ids
);
CREATE INDEX idx_news_source_pub ON news_cache(source, published_at);
```

One SQLite file. `cp data/admin.db data/admin.db.bak` is a complete backup.

---

## 8. API surface

```
# Public (no auth)
GET    /api/public/archetypes                  → list of archetype summaries
GET    /api/public/archetypes/[id]             → full canonical JSON for the public dashboard

# Auth
POST   /api/admin/auth/login                   { apiKey } → sets cookie

# Pipelines
GET    /api/admin/pipelines                    → list of pipeline definitions
POST   /api/admin/pipelines/[name]/run         { archetypeId, args… } → { runId }
GET    /api/admin/pipelines/runs               → recent runs
GET    /api/admin/pipelines/runs/[id]          → run detail with stage traces
POST   /api/admin/pipelines/runs/[id]/abort
POST   /api/admin/pipelines/runs/[id]/resume
GET    /api/admin/pipelines/runs/[id]/stream   → SSE of live telemetry

# Proposals
GET    /api/admin/proposals                    { archetypeId?, status? }
POST   /api/admin/proposals                    (manual proposal creation)
POST   /api/admin/proposals/[id]/apply
POST   /api/admin/proposals/[id]/reject

# Copilot
POST   /api/admin/copilot/sessions             → { sessionId }
POST   /api/admin/copilot/sessions/[id]/chat   → SSE
GET    /api/admin/copilot/sessions/[id]/messages

# Cron
GET    /api/cron/daily-refresh                 → ?archetype=all|<id>, auth via CRON_SECRET
```

All `/api/admin/*` require the JWT cookie set by `/api/admin/auth/login`.

---

## 9. Iteration order

Build in this order; each step is independently shippable.

1. **Scaffold the Next.js app.** Move `public/concepts/v2/*` to React server components under `app/(public)/*`. Read from `data/archetypes/offshore-wind.json` server-side. The public site should look pixel-identical to today's static version.
2. **Admin shell + DB.** SQLite + migrations. Admin login. Read-only pipelines list, archetype list, empty proposals inbox.
3. **Pipeline runner.** Port stages, run-registry, checkpoints from castle-dashboard. Wire up trigger / abort / resume / SSE telemetry. At this point you can run a refresh from the browser.
4. **Manual proposal flow.** The risk editor + `apply-changes` endpoint. You can hand-edit a risk's `view` paragraph end-to-end.
5. **Pass-B cron new-risk surfacing.** Emits proposals into the inbox.
6. **Copilot.** Chat endpoint with `propose_*` tools. Reuses the same proposal apply path.
7. **News monitor stream.** Background task polling adapters every N hours, dumping to `news_cache`, emitting proposals when items match tracked risks. Castle-dashboard's `news-monitor-stream.ts` analog.

Skip multi-user auth, skip Slack, skip Langfuse/Sentry until the rest is solid. You're operating this for one person.

---

## 10. What we're not copying from castle-dashboard

- **Supabase / Langfuse / Sentry** — overkill for one user and one archetype family. SQLite + console logging covers it. Easy to add Sentry later as a single drop-in.
- **The dependency-decomposition / event-research pipeline** — they have to figure out a company's risks from a URL. Our archetypes start from a curated research scaffold, so the pipeline is shorter and the agent is more constrained.
- **Multi-tenant ownership, sharing, sign-in** — one admin.
- **The synthetic-contracts library service** — we already have `offshore-wind-hedges.json` as a filtered static input. If we ever need a cross-archetype live library, we lift their `synthetic-library/*` endpoints then.

Everything else — the run registry, the checkpoint pattern, the propose-* tools, the apply-changes endpoint, the trace inspector, the SSE telemetry stream, the copilot chat shape — we lift in spirit and rebuild for our smaller, single-tenant setup. Same substrate (Next.js + TS + Anthropic SDK), so file-by-file ports of `run-registry.ts`, `checkpoints.ts`, `proposal-tools.ts`, and `apply-changes/route.ts` are reasonable starting points.
