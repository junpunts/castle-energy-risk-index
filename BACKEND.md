# Castle Energy Risk Index — Backend Design

**Audience:** the engineer (or agent) implementing the daily refresh loop.
**Constraint:** the v2 dashboard's layout, CSS, charts, and overall visual structure stay unchanged. The backend's job is to keep its input data fresh and accurate.

> **Stack note (updated):** the project is a single Next.js app with **Supabase Postgres** as the state store. See `ADMIN.md` for the full layout, schema, and migration order. The data shape described in §2 onwards is unchanged — same Risk / NewsItem / RiskDetail structure, same daily-refresh loop, same audit log. What moved:
>
> - **Canonical archetype state** lives in the `archetypes` table (one row per archetype, with a `state` jsonb column holding the bundle described in §2). The seed file `public/data/offshore-wind.json` we already wrote becomes the initial INSERT in `supabase/seed.sql`.
> - **`data/archetypes/<id>.json` files** are removed. `data/research/*` (research scaffold, hedges JSON, critical contracts) stays in git as static inputs the daily refresh diffs against.
> - **Audit log** is the `archetype_revisions` table (append-only, one row per applied proposal, full blob preserved). Replaces git-log-on-the-JSON-file.
> - **Public dashboard** reads canonical state through `readArchetype(id)` (Supabase server client), cached via Next.js ISR or static export.
> - The §1 and §1.1 sections below describe the original plain-static-HTML wiring and are **superseded** — kept only for reference if you're inspecting the original prototype.

---

## 1. What the UI consumes

Today the v2 pages import from `public/concepts/archetypes/_data.js` as ES modules. That file is the contract. It exports four things:

| Export        | Shape                                | Used by                       |
|---------------|--------------------------------------|-------------------------------|
| `ARCHETYPES`  | array of archetype meta objects      | `index.html`, `archetype.html` |
| `RISKS`       | `{[archetype_id]: Risk[]}`           | `archetype.html`              |
| `NEWS`        | `{[archetype_id]: NewsItem[]}`       | `archetype.html`              |
| `RISK_DETAIL` | single deep-dive object (per risk)   | `risk.html`                   |

The dashboard hard-codes `RISK_DETAIL` to one risk today (utility-solar / s1). We'll generalize that to a lookup `{[archetype_id]: {[risk_id]: RiskDetail}}` and keep the JS module file as a thin shim that re-exports JSON.

### Target migration

`public/concepts/archetypes/_data.js` becomes a generated file:

```js
// AUTO-GENERATED. Do not edit by hand.
// Source: public/data/<archetype>.json
import OFFSHORE from '../../data/offshore-wind.json' with { type: 'json' };
import UTILITY  from '../../data/utility-solar.json'  with { type: 'json' };
// ...one import per archetype

const BUNDLES = [OFFSHORE, UTILITY, /* ... */];
export const ARCHETYPES   = BUNDLES.map(b => b.archetype);
export const RISKS        = Object.fromEntries(BUNDLES.map(b => [b.archetype_id, b.risks]));
export const NEWS         = Object.fromEntries(BUNDLES.map(b => [b.archetype_id, b.news]));
export const RISK_DETAILS = Object.fromEntries(BUNDLES.map(b => [b.archetype_id, b.risk_details]));
// Back-compat: keep RISK_DETAIL pointing at the first one until risk.html is updated
export const RISK_DETAIL  = Object.values(RISK_DETAILS['utility-solar'])[0];
// existing helpers
export function archetypeById(id) { return ARCHETYPES.find(a => a.id === id); }
// fmt helpers unchanged
```

### 1.1 `risk.html` — the 5-line wiring change

The page today does:

```js
import { RISK_DETAIL, archetypeById } from '../archetypes/_data.js';
const R = RISK_DETAIL;
const A = archetypeById(R.archetype_id);
```

It needs to do:

```js
import { RISK_DETAILS, archetypeById } from '../archetypes/_data.js';
const params = new URLSearchParams(location.search);
const archetypeId = params.get('archetype') || 'utility-solar';
const riskId      = params.get('id')        || Object.keys(RISK_DETAILS[archetypeId])[0];
const R = RISK_DETAILS[archetypeId]?.[riskId];
if (!R) { document.querySelector('main').innerHTML = '<div style="padding:120px 48px">Unknown risk.</div>'; throw new Error('no risk'); }
const A = archetypeById(R.archetype_id);
```

`archetype.html` already constructs links of the form `risk.html?archetype=<id>&id=<risk_id>` (see its `.risk-row` and `.news-row` href construction), so the URL contract is already in place. No other change is required in `risk.html` — every `R.title`, `R.events`, `R.weekly`, `R.hedges`, etc. reads the same way.

This is the only structural UI change required across the v2 pages. After it lands, the agent writes JSON only — never JS, never HTML.

---

## 2. The data contract

One JSON file per archetype, at `public/data/<archetype-id>.json`. Schema:

```jsonc
{
  "schema_version": "1.0.0",
  "archetype_id": "offshore-wind",
  "generated_at": "2026-05-25T14:00:00Z",
  "generated_by": "daily_refresh v0.3.1",
  "as_of": "2026-05-25",
  "horizon": "18 months",

  "archetype": { /* ARCHETYPE entry — see _data.js */ },
  "risks":      [ /* Risk[] — see _data.js */ ],
  "news":       [ /* NewsItem[] — see _data.js */ ],
  "risk_details": {
    "ow1": { /* RiskDetail — see _data.js RISK_DETAIL */ },
    "ow2": { /* ... */ }
  },

  "sources": { /* provenance — file paths or URLs the agent read */ },
  "audit": { /* see §5 — change log for this generation */ }
}
```

**Hard rules for the agent:**

1. **Risk IDs are stable.** `ow1`, `ow2`, … never get reused, never get reordered for ranking purposes (the UI sorts client-side). New risks get the next free `ow{n}`.
2. **`composite`, `risks_total`, `risks_high`, `news_this_week` are derived, not editorial.** The agent computes them from the risks array on every write. Same for `archetype.composite_delta` — compare to the prior generation's `composite`.
3. **`attention_weekly` is a 12-slot ring buffer.** On each daily run, the agent drops slot 0 only when crossing a calendar-week boundary (Monday in `as_of` timezone). Inside a week it overwrites slot 11.
4. **`tracked_since` and `id` in risk_details never change.** `last_updated` always changes when anything else in that detail object changes.
5. The seed file at `public/data/offshore-wind.json` (already committed) is the schema example. Treat it as authoritative.

---

## 3. The daily agent loop

A single Python process, run by cron at 06:00 ET. One process per archetype, run sequentially (so failures are isolated and a single LLM doesn't have to juggle 6 schemas at once).

```
┌───────────────────────────────────────────────────────────────┐
│ daily_refresh.py --archetype offshore-wind                    │
├───────────────────────────────────────────────────────────────┤
│ 0. Load prior state                                            │
│    ├── public/data/offshore-wind.json   (yesterday's truth)    │
│    └── data/research/offshore-wind-*    (the static scaffold)  │
│                                                                │
│ 1. Pull fresh inputs (deterministic, no LLM)                   │
│    ├── Federal Register: BOEM-2026-*, EPA-OAR-OCS-*            │
│    ├── Congress.gov: bills tagged 'offshore wind', 'OCSLA'     │
│    ├── PACER: docket activity in tracked cases                 │
│    ├── Kalshi: tickers tagged in current risk_details[*].hedges│
│    ├── Polymarket: same                                        │
│    ├── BOEM project pages: COP / FEIS / ROD status             │
│    ├── NMFS GARFO docket: ITA / IHA cadence                    │
│    └── EIA-860 / FERC Form 556: COD filings                    │
│                                                                │
│ 2. Diff vs prior state (deterministic)                         │
│    ├── Hedge price moves > 5pp → flag                          │
│    ├── New FR docket entries matching watch-strings → flag     │
│    ├── New bill introduced or markup scheduled → flag          │
│    └── Build a `changes` packet                                │
│                                                                │
│ 3. LLM pass — risk-level update (one call per affected risk)   │
│    Inputs: prior risk_detail JSON + changes packet for this    │
│            risk + research scaffold section + last 30d of news │
│    Output: updated risk + risk_detail JSON, validated against  │
│            JSON schema (§4).                                   │
│                                                                │
│ 4. LLM pass — new-risk surfacing (one call, optional)          │
│    Inputs: full changes packet + current archetype risks list  │
│    Output: zero or more new Risk entries (with new ids), each  │
│            with a stub risk_detail. Requires human review      │
│            flag (audit.requires_review = true) before publish. │
│                                                                │
│ 5. Recompute derived fields (deterministic)                    │
│    ├── archetype.composite (see §6)                            │
│    ├── archetype.composite_delta vs yesterday's saved value    │
│    ├── archetype.risks_total, .risks_high                      │
│    ├── archetype.news_this_week (count of items in last 7d)    │
│    └── archetype.attention_weekly (shift / overwrite as in §2) │
│                                                                │
│ 6. Validate (schema + invariants)                              │
│    ├── pydantic / JSON-schema validation                       │
│    ├── No risk dropped without an entry in audit.removals      │
│    ├── No ID collision                                         │
│    └── All hedges referenced have a known ticker source        │
│                                                                │
│ 7. Write & commit                                              │
│    ├── public/data/offshore-wind.json (atomic write)           │
│    ├── data/audit/2026-05-25/offshore-wind.diff.json (full     │
│    │   diff for post-hoc review)                               │
│    └── git commit -m "daily-refresh: offshore-wind 2026-05-25" │
│                                                                │
│ 8. Notify                                                       │
│    └── Slack/email summary of: top changes, new risks proposed,│
│        any validation warnings.                                │
└───────────────────────────────────────────────────────────────┘
```

---

## 4. JSON schemas (informal)

Risk object (one entry in `risks[]`):

```jsonc
{
  "id": "ow1",                              // stable, never reused
  "category": "policy|trade|operational|market",
  "title": "EO 14154 / BOEM COP Approval Freeze",  // <= 64 chars
  "citation": "PM Jan 20, 2025 · EO 14154 · 30 CFR §585.628",
  "impact_irr": -3.8,                       // negative pp, archetype's target_irr units
  "impact_usd": 630000000,                  // archetype-typical capex dollars at risk
  "probability": 0.78,                      // 18-month materialization
  "attention": 100,                         // 0–100, Castle composite score
  "likelihood": "low|medium|high",          // bucketed from probability
  "headline_change": "+32"                  // attention delta from prior week, signed
}
```

NewsItem:

```jsonc
{
  "source": "BOEM",       // uppercase outlet/agency
  "ago": "3 hr ago",      // human-readable; recomputed daily
  "tag": "policy|trade|operational|market",
  "title": "Empire Wind 1 stop-work order lifted after 33-day halt",
  "sum": "1–2 sentence summary, max 280 chars",
  "published_at": "2026-05-25T11:00:00Z",   // canonical timestamp
  "url": "https://www.federalregister.gov/..."  // canonical link
}
```

RiskDetail (one entry per id in `risk_details`):

```jsonc
{
  "archetype_id": "offshore-wind",
  "archetype_name": "Offshore Wind",
  "id": "ow1",
  "category": "policy",
  "title": "EO 14154 / BOEM COP Approval Freeze",
  "subtitle": "One-sentence elaboration.",
  "citation": "PM Jan 20, 2025 · EO 14154 · 30 CFR §585.628 · Castle tracking since Jan 22, 2025",
  "tracked_since": "Jan 22, 2025",
  "last_updated": "3 hours ago",
  "attention": 100, "attention_delta": 18,
  "probability": 0.78, "probability_delta": 0.04,
  "impact_irr": -3.8,
  "impact_usd": 630000000,
  "hedge_cost": 4000,                       // dollar cost of the canonical hedge sizing
  "view": "200–500 word Castle's-view paragraph. Castle voice.",
  "weekly": [/* 12 ints 0–100 — attention sparkline */],
  "events": [
    {
      "date": "2026-09-30",
      "when": "+125d",                       // computed from date; never edited
      "kind": "deadline|hearing|market|filing|castle|now",
      "future": true,
      "now": false,                          // exactly one event per detail has now=true
      "title": "BOEM Vineyard Wind court ruling expected",
      "detail": "Library contract prices this milestone at p=0.385."
    }
  ],
  "news": [ /* NewsItem subset most relevant to this risk */ ],
  "hedges": [
    {
      "ticker": "library-ef7635e4-...",     // contract_key (library) OR Kalshi/Poly ticker
      "title": "Will the federal offshore wind moratorium be lifted by Jun 30, 2026?",
      "yes": 0.258, "change": -0.04,
      "expiry": "Jun 2026",
      "notional": 250000                     // suggested sizing, dollars
    }
  ]
}
```

---

## 5. Audit / change-log block

The `audit` block at the top of each generated JSON gives the next-day agent (and a human reviewer) something to compare against without diffing the whole file.

```jsonc
"audit": {
  "prior_generated_at": "2026-05-24T14:00:00Z",
  "diff": {
    "risks_updated": ["ow1", "ow5"],
    "risks_added": [],
    "risks_removed": [],
    "news_added": 4,
    "news_dropped": 7,
    "composite_change": +2,
    "hedge_price_moves": [
      {"ticker": "synthetic-doi-order-offshore-wind-delay", "from": 0.685, "to": 0.715}
    ]
  },
  "requires_review": false,                  // true blocks publish until human acks
  "review_reasons": []                       // human-readable reasons if true
}
```

Triggers for `requires_review = true`:

- Any new risk surfaced by step-4 LLM pass.
- `composite` moved more than ±5 in a day.
- Any risk's `probability` moved more than ±15pp in a day.
- Validation produced warnings (but no errors).
- Hedge ticker referenced no longer resolves on Kalshi/Polymarket API.

---

## 6. Composite score (the 0–100 number)

Currently editorial in the seed file (`composite: 71`). Make it derived so the daily diff is meaningful.

```
composite = clamp(0, 100, round(
    100 * Σ (probability × |impact_irr|) for risks in archetype
          ────────────────────────────────────────────────────
                       target_irr × archetype.risks_total
))
```

For the offshore-wind seed: Σ(p × |Δirr|) ≈ 9.5pp / (8 × 9 risks) = 0.13 → 13 × 5.5 (calibration constant per archetype) ≈ 71. Calibration constants live in `data/calibration.json`, set once per archetype so the seed values reproduce.

`composite_delta` = today's composite minus yesterday's (stored in the prior JSON file).

---

## 7. Data sources (the 'fresh' part of step 1)

| Risk channel               | Primary feeds                                           | Cadence |
|----------------------------|---------------------------------------------------------|---------|
| BOEM permitting (ow1, ow2) | federalregister.gov RSS for BOEM dockets; boem.gov state-activities scrape | daily |
| Steel tariffs (ow3)        | federalregister.gov proclamations; hts.usitc.gov diff; bis.doc.gov §232 page | daily |
| Jones Act / WTIV (ow4)     | rulings.cbp.gov search ("wind turbine installation", "OCS"); Dominion 10-Q filings; MARAD applications | weekly |
| §45Y/§48E (ow5, ow6)       | irs.gov clean-energy hub; congress.gov reconciliation text; JCT.gov scoring | daily |
| NEPA / right whale (ow7)   | fisheries.noaa.gov ITA notices; PACER docket alerts; epa.gov/eab | daily |
| OREC (ow9)                 | nyserda.ny.gov; nj.gov/bpu; mass.gov/doer | weekly |
| Hedges                     | Kalshi public API by ticker; Polymarket subgraph; Castle internal library | hourly during US market hours; snapshot at run-time |

Each feed has a tiny adapter under `data/adapters/<source>.py` that returns a uniform `{timestamp, source, title, url, body, matched_keywords}` shape. The daily agent only sees these uniform records.

---

## 8. The LLM passes — exact prompts

### Pass A: per-risk update

System: "You are a risk analyst maintaining a single Risk entry in an institutional risk book. You will be given the current Risk entry as JSON, the last 24h of source items tagged to it, and the research scaffold paragraph for this risk. Update the JSON in place. **Do not change** `id`, `tracked_since`, or `category`. Update `probability`, `attention`, `view`, `subtitle`, `events`, `news`, and `hedges` only if the source items justify it. Cite specific source IDs in your reasoning. Output is one JSON object plus a `reasoning` string."

The reasoning string is logged but not published.

### Pass B: new-risk surfacing

System: "You are scanning for risks not yet on the watchlist. You will be given the full list of currently-tracked risk titles + citations for this archetype, and the last 7 days of source items that did not match any tracked risk's keywords. Propose at most 2 new Risk entries. For each, include: title, category, 2-sentence rationale, suggested initial probability and impact_irr, and 2–3 candidate hedges from a provided library list. Output an array (possibly empty) of proposed Risk objects."

Pass B output always sets `audit.requires_review = true`. Human reviewer accepts (assigns an id, fills out the deep risk_detail) or rejects in a daily check-in.

### Model & determinism

- Use `claude-sonnet-4` or equivalent; temperature 0.2 for Pass A, 0.4 for Pass B.
- Structured output via Anthropic tool-call schemas.
- Idempotency: same inputs → same outputs (no time-of-day or random seed exposed to the model).

---

## 9. Failure modes & idempotency

- **Source fetch fails** → agent runs with whatever it has, marks `audit.requires_review` and logs the missing feed. Never writes a partial JSON.
- **LLM call fails or produces invalid JSON** → retry 3× with exponential backoff. If still failing, write yesterday's file with `audit.diff = {error: "..."}` and notify.
- **Atomic write** → `tmp → rename` on the final JSON. Git commit only after both the JSON and the audit diff are on disk.
- **Re-running the same day twice** is allowed and idempotent: agent compares inputs to the most recent generation, not the calendar date. Repeated runs with no new input are no-ops (no commit).

---

## 10. Deploy & schedule

- Single host, Linux. `~/.hermes/cronjobs/castle-risk-refresh.cron` calls `uv run --project data daily_refresh.py --archetype <id>` for each archetype.
- Schedule: `0 10 * * 1-5` (06:00 ET, weekdays only — markets/feds are closed weekends).
- Output is committed to a `data-refresh` branch; a separate workflow merges to `main` after passing schema validation + smoke-rendering both `archetype.html` and `risk.html`.
- Manual override: `daily_refresh.py --archetype offshore-wind --force` ignores idempotency.

---

## 11. What's already in place

- `public/data/offshore-wind.json` (this commit) — full seed for the offshore-wind archetype matching this schema exactly. Built from:
  - `data/research/offshore-wind-current-state.md` — the 5-scenario research scaffold (mechanism, status, precedent, indicators, quantification, primary sources).
  - `data/research/offshore-wind-critical-full.txt` — the curated contract-library milestones.
  - `data/research/offshore-wind-hedges.json` — the broader hedges universe, filtered aggressively for offshore-wind relevance.

- The five scenarios in the scaffold map cleanly to the nine `risks[]` entries (1→ow1+ow2, 2→ow3, 3→ow4, 4→ow5+ow6, 5→ow7+ow8) plus market-risk `ow9` which the scaffold underweights.

## 12. Next steps for the implementer

1. Land the `_data.js` shim from §1 so the v2 pages load from JSON.
2. Generalize `risk.html` to read `RISK_DETAILS[archetype][id]` instead of the hard-coded `RISK_DETAIL`.
3. Stand up the adapters in §7; start with federal-register + congress.gov + Kalshi (those three alone resolve >60% of daily change traffic for this archetype).
4. Wire up Pass A end-to-end against the seed `offshore-wind.json`. Run it dry for a week before letting it commit.
5. Repeat for utility-solar (use the same scaffold pattern; the research artifacts don't exist yet).
