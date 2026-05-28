# Build Plan — Pass B + Multi-Source Intelligence Fusion

**Branch**: `pass-b-and-source-fusion`
**Off**: `backend-and-admin-design` (currently at `f23df96`)
**Estimated effort**: ~9 working days
**Status**: planning — no code written yet

## Goals

1. **Pass B — agentic new-risk discovery.** The cron's existing Pass A *updates* known risks. Pass B *finds* risks Castle hasn't been tracking. Opus reads news_cache items that didn't match any current risk, looks for emerging patterns, and proposes new risks via the existing proposal flow. Closes the gap between "we maintain a risk book" and "we surface risks you'd miss."

2. **Source fusion.** Today we read three source types: Federal Register, RSS, castle-scraper. Add three structurally different sources that the current adapters can't see:
   - **SEC EDGAR** — 10-K / 10-Q risk-factor sections from project sponsors. Sponsor self-disclosure is a leading indicator nothing else captures.
   - **CourtListener** (PACER mirror) — live federal court docket activity. Litigation matters before judgement.
   - **Earnings-call transcripts** (Motley Fool scrape) — CEO and CFO commentary on policy risk in Q&A. The candid signal that press releases never carry.

The result is a system that (a) discovers what it doesn't already track, and (b) listens to channels beyond press releases.

## Non-goals

- Custom project intake (separate v-next feature, deferred).
- Hedge execution loop (separate v-next).
- Real-time / streaming dashboard (separate v-next).
- Adding paid data sources (Bloomberg/NEF, Platts, AlphaSense). Defer until free sources are exhausted.

---

## Phase 1 — Pass B: Agentic New-Risk Discovery

### M1.1 — Apply path for `add_risk` proposals
**File(s)**: `src/lib/archetypes/apply.ts`, possibly `schemas.ts`
**Effort**: half-day

The `proposals.op` enum already includes `'add_risk'` (per ADMIN.md §3.3) and the `propose_add_risk` tool exists in `src/lib/agent/tools.ts`. What's missing is the apply-side handling.

Tasks:
- Verify `propose_add_risk` tool input schema captures everything Pass B needs to emit (id-less; auto-assigned), category, title, citation, impact_irr, impact_usd, probability, attention, likelihood, headline_change, driver, status (default 'active'), subtitle, view, hedges[].
- In `applyOp(state, op, payload)` for `op='add_risk'`:
  - Generate the next risk id for this archetype (`ow10`, `bs8`, `ev8`, etc.) — extract prefix from existing ids, find max integer suffix, +1.
  - Push to `state.risks[]` with all required Risk fields (including `tracked_since: today`).
  - Insert into `state.risk_details[newId]` with the deep-dive payload (subtitle, view, weekly: [0]*12, events, news, hedges).
  - Bump archetype.risks_total + risks_high if applicable.
- Add validation: reject if proposed risk overlaps semantically with an existing one (cosine similarity of title+citation against existing risks; flag if > 0.85).

**Done when**: a manually-crafted `add_risk` proposal can be applied via `POST /api/admin/proposals/:id/apply` and the new risk appears on the public risk page.

### M1.2 — `surface_new_risks` pipeline stage
**File(s)**: `src/lib/pipeline/stages/surface-new-risks.ts` (new)
**Effort**: 1 day

A new stage. Walks news_cache for items that hint at this archetype but don't match any tracked risk, batches them, asks Opus to propose new risks.

```
INPUT: archetypeId
OUTPUT: { proposals_created: number, items_considered: number, cost_usd: number }
```

Algorithm:
1. Query `news_cache`:
   - `published_at >= now() - 90 days`
   - `matched_risks = '{}'` (unmatched)
   - WHERE the matcher / embedding suggests archetype-level relevance — easiest path: use the **archetype-strong tokens** from `match.ts` to filter (item must hit at least one), OR if embeddings are persisted (post-migration 007), use cosine similarity to the archetype's risks' collective embedding.
2. If fewer than 5 items pass the filter, skip with `{ proposals_created: 0 }`.
3. Cluster items thematically — simple approach: pass them all (titles + bodies, ~200 chars each, capped at 60 items) into Opus with one prompt.
4. Opus prompt instructs:
   ```
   You're scanning for emerging risks not yet on Castle's watchlist for
   {archetype.name}. Below are {N} recent news items that didn't match any
   existing tracked risk. Here are the {M} currently-tracked risk titles and
   citations.

   Propose at most 3 NEW risks if (and only if) the items reveal a coherent,
   recurring theme that the current list misses. Each proposed risk must:
   - reference a specific mechanism (statute, regulation, market dynamic)
   - cite at least 2 of the input items as evidence
   - have a defensible probability and impact_irr estimate at this archetype's scale
   - propose 1-3 candidate hedges (mark TBD if no library contract is obvious)

   Return JSON: { proposed: [{ category, title, citation, view, probability,
     impact_irr, impact_usd, attention, likelihood, headline_change, driver,
     evidence_urls, candidate_hedges }] }

   If no coherent new theme emerges, return { proposed: [] }. Do not invent.
   ```
5. Parse JSON. For each proposed risk, insert a `proposals` row with `op='add_risk'`, payload = the proposal object, `source='cron-passB'`, `requires_review=true` (always).
6. Track cost (Opus per-call, ~$0.20-0.40 per archetype).

**Done when**: stage executes against a real archetype, returns 0-3 proposals queued in the inbox with full payload.

### M1.3 — `weekly_discover` pipeline + cron
**File(s)**: `src/lib/pipeline/registry.ts`, `render.yaml`, `scripts/trigger-cron.mjs`, `src/app/api/cron/weekly-discover/route.ts` (new)
**Effort**: half-day

Pass B is expensive and noisy — runs **weekly**, not daily.

Tasks:
- New pipeline:
  ```ts
  registerPipeline({
    name: 'weekly_discover',
    description: 'Pass B — scan unmatched news_cache for emerging risks.',
    stages: [pullSourcesStage, computeAttentionStage, surfaceNewRisksStage],
  })
  ```
- New API route `/api/cron/weekly-discover` — same pattern as `/api/cron/daily-refresh`, enqueues one run per archetype with `pipeline_name: 'weekly_discover'`.
- Update `scripts/trigger-cron.mjs` to accept the pipeline name as the second arg (already does this per the script's name).
- Add to `render.yaml`:
  ```yaml
  - type: cron
    name: castle-eri-weekly-discover
    runtime: node
    schedule: "0 11 * * 1"   # Monday 07:00 ET
    startCommand: node scripts/trigger-cron.mjs weekly-discover
  ```

**Done when**: the new cron runs Mondays at 7am ET, calling the web service, which enqueues 6 weekly_discover runs, which the worker picks up and processes.

### M1.4 — Admin UI for new-risk proposals
**File(s)**: `src/app/admin/proposals/page.tsx`, new components, possibly `src/app/admin/discover/page.tsx`
**Effort**: 1 day

The existing `/admin/proposals` lists all proposals; we extend rather than fork.

Tasks:
- Add filter chip "Type: new risks" — filters to `op='add_risk'`.
- New-risk proposal card shows:
  - Proposed title (display serif, 18px)
  - Category + citation (mono eyebrow)
  - Impact / probability / drag preview (small stat row)
  - "Why this matters" — Opus's reasoning string
  - 2-line excerpt of view paragraph
  - Candidate hedges list (3 max)
  - Evidence: the URLs cited (linked, "3 sources")
- Approve button → calls `POST /api/admin/proposals/:id/apply` → applies via the M1.1 path → new risk appears on the public risk-detail page within ISR window.
- Reject button → `POST /api/admin/proposals/:id/reject` (already exists).
- Inbox-level "New this week" badge: count of pending `add_risk` proposals across all archetypes from the last 7 days.

**Done when**: an admin can see a pending Pass B proposal, click into it, read the full payload + Opus reasoning, and approve or reject in one click. Approved risks appear on the public dashboard within 60s.

---

## Phase 2 — Source Fusion

### M2.1 — SEC EDGAR adapter
**File(s)**: `src/lib/adapters/sec-edgar.ts` (new)
**Effort**: 1.5 days

SEC EDGAR is free, well-structured, no rate-limit issues if you set a proper User-Agent (per SEC policy).

Tasks:
- New adapter following the `SourceAdapter` shape (`enabled()`, `fetch(ctx)`).
- Per-archetype sponsor config (added to archetype state in M2.4):
  - offshore-wind: Avangrid (CIK 0001634910), Dominion (0000715957), Equinor, Eversource
  - utility-solar: NextEra (0000753308), AES (0000874761), First Solar (0001274494), Sunrun, Sunnova
  - battery-storage: Fluence (0001801169), Tesla (0001318605), Vistra, NextEra
  - natural-gas: Vistra (0001692819), Cheniere (0001596532), Sempra (0001032208), Williams (0000107263)
  - nuclear-smr: Constellation (0001868275), TVA (0000022989), NuScale (0001650164)
  - ev-charging: ChargePoint (0001777393), EVgo (0001823766), Blink Charging (0001429764)
- For each CIK, GET `https://data.sec.gov/submissions/CIK{cik}.json` — lists recent filings.
- Filter to `form ∈ {'10-K', '10-Q'}`, `filingDate >= ctx.since`.
- For each new filing, fetch the primary document; extract the "Item 1A — Risk Factors" section via regex / structural parsing.
- Split risk factors into individual paragraphs.
- Emit one SourceItem per relevant paragraph: title = first sentence, body = full paragraph, url = SEC filing URL with anchor, category = `sec_risk_factor`.

Challenges to plan around:
- HTML structure varies — most filings are HTML, some are XBRL-tagged. Start with simple text-based parsing; iterate.
- Volume: a 10-K has 30-100 risk factors. Need to filter to "this one mentions a policy / regulation we care about" before emitting, or the matcher will be flooded. Add per-archetype keyword filter in the adapter itself before emission.

**Done when**: a fresh 10-K filing from NextEra produces ~5-15 SourceItems (the policy-relevant risk factors), each ~300 words, matched to relevant utility-solar risks via the matcher.

### M2.2 — CourtListener adapter
**File(s)**: `src/lib/adapters/court-listener.ts` (new)
**Effort**: 1 day

CourtListener (free.law) mirrors PACER + most state court systems. Free REST API.

Tasks:
- New adapter.
- API: `https://www.courtlistener.com/api/rest/v3/search/?type=r&q={query}&filed_after={date}`
- Per-archetype queries (added to archetype state in M2.4):
  - offshore-wind: `"BOEM" OR "Vineyard Wind" OR "Empire Wind" OR "offshore wind lease"`
  - utility-solar: `"AD/CVD" OR "Section 201 solar" OR "UFLPA" OR "Auxin"`
  - battery-storage: `"Section 301 battery" OR "BESS fire" OR "FEOC battery"`
  - natural-gas: `"CP2 LNG" OR "NEPA pipeline" OR "natural gas export"`
  - nuclear-smr: `"NRC" OR "Beyond Nuclear" OR "BWRX-300" OR "construction permit"`
  - ev-charging: `"NEVI" OR "BABA charger" OR "EV charging waiver"`
- Optional auth via `COURT_LISTENER_TOKEN` for higher rate limits (free tier sufficient for daily polls).
- Emit one SourceItem per docket entry: title = case name + entry type, body = entry description + court, published_at = filed_at, url = courtlistener.com permalink, category = `court_docket`.

**Done when**: a daily pull returns 0-10 docket entries per archetype, matched to relevant risks.

### M2.3 — Earnings transcripts adapter
**File(s)**: `src/lib/adapters/earnings-transcripts.ts` (new)
**Effort**: 1.5 days

Quarterly transcripts are gold for policy commentary (CEO answers to analyst questions about IRA, tariffs, etc.). Free source: Motley Fool's transcript pages.

Tasks:
- Curated company list per archetype (overlap with SEC sponsors mostly):
  - offshore-wind: Avangrid, Dominion, Eversource, Equinor
  - utility-solar: NextEra, First Solar, Sunrun, AES
  - battery-storage: Fluence, Tesla, Vistra
  - natural-gas: Vistra, Cheniere, Williams, Sempra
  - nuclear-smr: Constellation, NuScale
  - ev-charging: ChargePoint, EVgo, Tesla
- Scrape `https://www.fool.com/earnings/call-transcripts/?date_range=last_month&company={ticker}` for transcript URLs (or use their search).
- For each new transcript, fetch the page, parse out the **Q&A section** (analyst questions are where policy commentary lives, not prepared remarks).
- For each Q&A pair, emit a SourceItem if it contains policy/regulatory keywords (IRA, OBBBA, tariff, FERC, etc.).
- Category: `earnings_qa`.

Challenges:
- Scraping is fragile. HTML changes break us. Plan for monthly review.
- Quarterly cadence — adapter only emits new items 4× per year per company. Pair with weekly cron run so we don't waste daily calls.
- Could ALSO emit prepared-remark items (smaller signal but easier to extract).

Fallback / upgrade path (post-MVP): use Seeking Alpha free transcripts (better coverage, less reliable to scrape) or pay for AlphaSense API.

**Done when**: an empirical test against last quarter's NextEra and Vistra calls produces 3-10 Q&A SourceItems with policy commentary, matched to relevant risks.

### M2.4 — Archetype intelligence config
**File(s)**: `src/lib/schemas.ts`, `scripts/gen_*.py`, `src/lib/pipeline/stages/pull-sources.ts`
**Effort**: half-day

Add per-archetype configuration so adapters know what to look for.

Add to archetype state (Zod schema):
```ts
intelligence: z.object({
  sponsors: z.array(z.object({
    name: z.string(),
    cik: z.string().regex(/^\d{10}$/),
    ticker: z.string().optional(),
  })).default([]),
  litigation_queries: z.array(z.string()).default([]),
  transcript_companies: z.array(z.string()).default([]),
}).optional()
```

Tasks:
- Backfill this config for all six existing archetypes via a migration script (similar to the `primary_hedge_ticker` backfill we already ran).
- Each new adapter reads `bundle.intelligence` rather than carrying hardcoded archetype-specific config.

This keeps the configuration declarative and per-archetype, so adding a new archetype only requires updating its bundle, not the adapter code.

**Done when**: every archetype has its sponsor / litigation / transcript-company lists, and adapters fetch via that config.

---

## Phase 3 — Integration & Calibration

### M3.1 — Matcher tuning for new content types
**File(s)**: `src/lib/adapters/match.ts`, optionally `src/lib/adapters/match-sec.ts`
**Effort**: 1 day

SEC risk factor language and court docket entries don't read like news. We need to ensure they get matched.

Tasks:
- Add SEC-specific keywords/patterns to existing per-risk keyword lists:
  - "the Company is subject to" + topic
  - "could materially affect"
  - "If [policy] is repealed" pattern
- Add court-system patterns:
  - Case-number regex `\d+:\d+-cv-\d+`
  - Court names ("D.C. Circuit", "USCIT", etc.)
- Consider archetype-strong-tokens-by-category: e.g. for `sec_risk_factor` source, weight title-words higher because they're often the topic sentence.
- Pair with embeddings (already shipped) — semantic match will handle the long tail.

**Done when**: a manual audit of 50 SEC + 30 court items shows >70% recall (true positive rate) without obvious false positives.

### M3.2 — Migration 007 applied + embeddings persisted
**File(s)**: existing `supabase/migrations/007-news-cache-embedding.sql`
**Effort**: trivial once executed

The migration file already exists on `backend-and-admin-design`. Apply it via Supabase CLI or dashboard before deploying Phase 2 (so embedded items from new adapters persist). Without this, embeddings re-compute every pull (small extra cost, no correctness issue).

### M3.3 — End-to-end smoke + tuning
**File(s)**: `scripts/smoke-discover.ts` (new), various
**Effort**: 1 day

Tasks:
- Smoke script that:
  1. Triggers `weekly_discover` for offshore-wind (most data, most established).
  2. Reports: items pulled per adapter, items matched, new-risk proposals created.
  3. Dumps the Opus reasoning for each proposal for manual review.
- Hand-label 20 SEC items + 20 court items: did the matcher tag them correctly? Build a small precision/recall measurement.
- Tune match weights based on the labeled set.
- Run Pass B for all 6 archetypes once interactively; review proposals; tune the Opus prompt if it's producing noise.

**Done when**: Pass B produces an average of 0-2 sensible new-risk proposals per archetype per week, with <20% false-positive rate on manual review.

---

## Schema changes summary

| Change | Where | Notes |
|---|---|---|
| `intelligence` block on archetype state | `schemas.ts` ArchetypeBundleSchema | Optional, defaults to empty |
| Apply path for `op='add_risk'` | `lib/archetypes/apply.ts` | Tool + enum already exist |
| Migration 007 applied | DB-side | Already in repo, needs `supabase db push` |
| (Optional) `proposals.confidence_score` | migration | Pass B can express confidence |

## New env vars

| Var | Required for | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Embeddings (already set on Render) | Set in current branch |
| `SEC_USER_AGENT` | SEC EDGAR adapter | SEC requires `"Name email@domain"` format |
| `COURT_LISTENER_TOKEN` | (Optional) CourtListener auth | Lifts rate limits on free tier |

## Cost estimate

| Item | Monthly | Notes |
|---|---|---|
| Embeddings (OpenAI 3-small) | ~$1.50 | ~1,000 items/day × $0.00002 |
| Pass A (Sonnet, daily) | ~$30 | Existing |
| Pass B (Opus, weekly) | ~$5 | 6 archetypes × $0.20 × 4 weeks |
| Opus probability estimates (daily) | ~$15 | Existing |
| SEC / CourtListener / transcripts | $0 | Free APIs |
| **Total** | **~$50/mo** | Up from ~$45/mo on current branch |

## Risks / unknowns

| Risk | Mitigation |
|---|---|
| SEC filing parsing breaks on uncommon document structures | Start with text-based regex; cover 80%; iterate on the long tail |
| Motley Fool HTML changes break scraping | Monthly manual verification; consider Seeking Alpha or paid fallback |
| Pass B over-proposes (noise) | Conservative Opus prompt; requires_review=true always; admin approval gate |
| Pass B under-proposes (misses real new risks) | Hand-curate a labelled "should have surfaced" set quarterly; tune prompt |
| Court docket signal is too noisy / formulaic | Filter on case type + keywords before emission |
| Sponsor self-disclosure language is too cautious to be useful | Empirical test before committing — could deprioritise SEC if test fails |

## Acceptance criteria

The branch is ready to merge when:

1. **Pass B**
   - [ ] `surface_new_risks` stage runs against a live archetype, queues 0-3 proposals with full payload + Opus reasoning.
   - [ ] `add_risk` op applies cleanly via the admin proposal-apply endpoint; new risk appears on the public risk page within ISR.
   - [ ] Weekly cron is configured in `render.yaml`, fires Mondays 7am ET.
   - [ ] Admin proposals page shows a "New this week" badge with the count of pending add_risk proposals.

2. **Source fusion**
   - [ ] SEC EDGAR adapter fetches 10-K/10-Q filings for ≥20 sponsor companies, extracts risk factors, emits matched SourceItems.
   - [ ] CourtListener adapter polls daily, emits 0-10 docket items per archetype.
   - [ ] Earnings transcripts adapter pulls Motley Fool transcripts for ≥15 companies quarterly.
   - [ ] `intelligence` config block populated on all 6 archetypes via backfill script.
   - [ ] All new adapters wired into `adaptersForArchetype()` in `lib/adapters/index.ts`.
   - [ ] Migration 007 applied in prod Supabase; news_cache.embedding column populated by pull_sources.

3. **Integration**
   - [ ] Matcher tuned + measured against a 100-item labelled set; precision ≥70%, recall ≥70%.
   - [ ] `scripts/smoke-discover.ts` runs end-to-end against offshore-wind in under 5 minutes.
   - [ ] Cost confirmed ≤ $100/month at current archetype count.

## Suggested execution order

The phases are independent enough that you could parallelize, but for one developer I'd sequence:

1. **Week 1 — Phase 1 (Pass B end-to-end).** Get the agentic loop working first; it's smaller and self-contained. M1.1 → M1.2 → M1.3 → M1.4. Ship and run for a week before Phase 2 starts to surface real proposals.
2. **Week 2 — Phase 2 (Source adapters).** SEC EDGAR first (highest-value source), then CourtListener (easiest), then Earnings (most fragile). M2.4 (config schema) in parallel with M2.1.
3. **Mid-week 2 → end-week 2 — Phase 3 (integration & tuning).** Measure, tune, smoke-test, ship.

## Open questions for the user

Before kickoff, four things worth confirming:

1. **Pass B cadence**: weekly the right rhythm, or do you want daily (more cost, more noise) or monthly (cheaper, possibly stale)?
2. **Pass B autonomy**: always queue for human review (`requires_review=true`), or auto-apply if Opus's confidence is high? My default is always queue — the value here is *surfacing* candidates, not silently mutating the risk book.
3. **SEC EDGAR sponsor list**: my proposed list (~30 companies across 6 archetypes) — is that the right slate, or are there specific developers / sponsors / IPPs you care about more (e.g. Invenergy, Pattern Energy, EDF Renewables)?
4. **Migration 007** application path: do you have Supabase CLI access and can run `supabase db push`, or should I add a Postgres RPC function that lets us run DDL via the service role?
