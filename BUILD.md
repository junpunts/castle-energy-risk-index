# Castle Energy Risk Index — Prototype Plan

> **Execution mode**: a Castle **cloud session** will pick this up and build the entire prototype end-to-end. This file IS the complete brief. The cloud session is responsible for scaffolding the data and public directories, writing the Python data layer, building the static HTML pages, and verifying the result.
>
> **What's already in the repo**: `BUILD.md` (this file), `README.md`, `.gitignore`, and the full `design-system/` bundle (Castle's design tokens, brand guidelines, logos, UI kits — read-only reference). Git is already initialized on `main`. The cloud session does NOT need filesystem access outside the repo for design assets.
>
> **What the cloud session needs from the operator**: `ANTHROPIC_API_KEY`, `CONGRESS_GOV_API_KEY` (free signup at api.data.gov), optional `KALSHI_API_KEY_ID` / `KALSHI_PRIVATE_KEY_PATH`. These are injected as env vars by the desktop app's remote-environment config — do not paste them in chat. The session should write a `.env.example` documenting them and refuse to run `refresh.py` without them set.

## Context

Renewable energy developers (utility-scale solar, offshore wind, battery storage, green hydrogen, EV charging) plan projects with 3–10 year construction horizons but face material risk from US legislation (IRA repeal/amendment, 45V/48E rule changes), trade actions (Section 201/301 on Chinese polysilicon, batteries, steel; AD/CVD on Southeast Asia solar; UFLPA enforcement), and geopolitics (supply-chain concentration in China, Taiwan straits, Korean steel). Today this risk is tracked in spreadsheets and policy alert emails — there is no single instrument-grade view.

**This prototype** is a Castle-branded dashboard that:
1. Holds a pre-seeded portfolio of 5 representative renewable projects
2. Pulls **live** legislative, regulatory, and tariff data from Congress.gov, the Federal Register, and Kalshi
3. Computes a per-project **Energy Risk Index** (0–100, composite of Policy / Trade / Geopolitical / Macro sub-scores) with visible methodology
4. Surfaces specific exposures per project (dollar impact, probability) and maps each to a recommended Castle / Kalshi prediction-market hedge with sized notional

It will live at `/Users/arjunpandey/castle/castle-energy-risk-index/` (currently empty). Intended use: a polished demo/sales artifact that a Castle account exec can walk a renewables CFO or PM through, and a starting point for a real product.

---

## Approach

**Two layers, sharply separated:**

- **Python data layer** — fetcher + builder scripts that hit live APIs, cache responses, run the risk-index math, and emit static JSON files. Modeled after the patterns already worked out in `castle-tariff-tracker-stepbystep.md` (Pydantic models, Federal Register client, Kalshi client, cache TTLs, exponential backoff).
- **Static HTML site** — multi-page, hand-styled, no framework. Each page loads its JSON via `fetch()` and renders. Uses Castle design tokens directly (`colors_and_type.css`) and ports the relevant `ui_kits/dashboard/` components from JSX to vanilla HTML/CSS where useful.

This gets us **real underlying data** without React/Next overhead, keeps the visual fidelity in pure HTML+CSS where the design system is strongest, and leaves a clean path to port into `castle-marsh-app`/`castle-reports`-style Next.js later if it graduates.

---

## Directory layout

```
castle-energy-risk-index/
├── README.md
├── data/                              # Python data layer
│   ├── pyproject.toml                 # uv-managed; pydantic, httpx, typer
│   ├── refresh.py                     # CLI: `uv run refresh.py` rebuilds public/data/
│   ├── castle_eri/
│   │   ├── __init__.py
│   │   ├── models.py                  # Pydantic: Project, RiskFactor, ProjectExposure, HedgeContract, IndexScore
│   │   ├── projects.py                # Hand-curated 5-project seed (the only non-live data)
│   │   ├── clients/
│   │   │   ├── congress.py            # api.congress.gov — bills by keyword
│   │   │   ├── federal_register.py    # federalregister.gov/api/v1 — rules + notices
│   │   │   ├── kalshi.py              # public market endpoints
│   │   │   └── ustr.py                # Section 201/301/AD-CVD reference data (scraped + cached)
│   │   ├── mapping.py                 # Claude-powered: project → relevant policy keywords + HTS codes
│   │   ├── index_math.py              # composite score: policy/trade/geo/macro sub-scores + weights
│   │   └── cache/                     # on-disk JSON cache, TTL'd per source
│   └── tests/                         # smoke tests for each client + index_math
└── public/                            # the actual static site (open public/index.html locally, or serve with `python -m http.server`)
    ├── index.html                     # Portfolio overview: 5 projects, scores, policy ticker
    ├── project.html                   # Project detail (reads ?id= query param)
    ├── policies.html                  # Live policy tracker — Congress + Federal Register
    ├── hedges.html                    # Hedge marketplace — Kalshi + Castle-internal contracts
    ├── methodology.html               # How the index is computed
    ├── assets/
    │   ├── css/
    │   │   ├── colors_and_type.css    # copied from castle-design skill (source of truth)
    │   │   └── app.css                # page-specific styles using the tokens
    │   ├── js/
    │   │   ├── data.js                # fetch + cache JSON files
    │   │   ├── components.js          # render functions: card, gauge, exposure row, ticker
    │   │   └── pages/{index,project,policies,hedges}.js
    │   └── svg/                       # castle-logo-black.svg, knight icons, etc. (from castle-design assets/)
    └── data/                          # JSON output of `refresh.py` — committed for static hosting
        ├── projects.json
        ├── policies.json
        ├── markets.json
        └── index.json                 # per-project scores + exposure mappings
```

---

## The 5 seed projects

These are realistic archetypes drawn from current deal flow patterns. Hard-coded in `data/castle_eri/projects.py`.

| # | Project | Tech | Capacity | Location | COD | Capex | Critical exposures |
|---|---------|------|----------|----------|-----|-------|--------------------|
| 1 | **Lone Star Solar I** | Utility-scale PV | 500 MW | West Texas | Q2 2027 | $600M | Chinese polysilicon (Section 301 + UFLPA), ITC §48E rate, ERCOT interconnection queue |
| 2 | **Vineyard Wind Phase II** | Fixed-bottom offshore wind | 800 MW | Mass. coast | Q4 2028 | $4.2B | BOEM permitting, Korean monopile steel (Section 232), Jones Act vessels, PTC §45Y |
| 3 | **Mojave Battery Storage Hub** | Li-ion BESS | 250 MW / 1 GWh | Southern CA | Q1 2026 | $400M | CATL/Chinese cell tariffs (Section 301), 45X cell manufacturing credit, FERC Order 2222 |
| 4 | **Permian Hydrogen Hub** | Electrolytic H₂ + co-located solar | 200 MW electrolyzer | West Texas | Q3 2029 | $1.2B | Treasury 45V three-pillars rule, electrolyzer supply (Plug/Cummins), off-taker demand |
| 5 | **I-95 EV Charging Network** | DC fast charging | 1,200 stations | Northeast corridor | 2025–2027 rollout | $300M | NEVI program funding, EV tax credit (§30D + §45W), Buy America compliance |

Each project carries: `id`, `name`, `technology`, `capacity`, `location`, `cod_date`, `capex_usd`, `equity_irr_target`, `key_suppliers[]` (with country), `offtake_status`, `policy_dependencies[]` (specific bill numbers, rule citations, tariff codes), `narrative` (2–3 sentences for the project page).

---

## Risk Index methodology

**Per project**, compute 4 sub-scores on 0–100 (higher = more risk), then a weighted composite.

| Sub-score | Inputs | Weight |
|-----------|--------|--------|
| **Policy Risk** | Count + bipartisan-split + stage of bills affecting project's tax credit / permitting regime, weighted by Kalshi/PredictIt market-implied probability of adverse outcome × % of project NPV tied to that policy | **35%** |
| **Trade Risk** | $-value of imported components × current applicable tariff rate × probability of rate increase (from Federal Register pendency + Kalshi if available); pass-through limited by PPA/offtake structure | **25%** |
| **Geopolitical Risk** | Supply-chain HHI concentration by country × country risk score (China, Taiwan, Korea, Vietnam, Cambodia, Malaysia — pulled from a static risk table refreshed manually) | **25%** |
| **Macro Risk** | Project IRR sensitivity to ±100 bps rate move × current curve volatility; only material for pre-FNTP projects | **15%** |

**Composite score** = weighted sum, rounded to integer.

**Surfaced in UI:**
- Big headline number per project (Hedvig Letters Serif, ~96px)
- Stacked horizontal bar showing sub-score contributions, with sub-score labels in Geist Mono ALL CAPS
- Hover/click any segment → tooltip showing the actual inputs that drove it (which bill, which tariff line, which probability)
- `/methodology.html` page laying out the full math, weights, and data-source attribution

Implemented in `data/castle_eri/index_math.py`. Methodology weights are exported into `index.json` so the frontend can render them consistently.

---

## Live data integration

All three sources are hit from the **Python layer** during `refresh.py` runs — no browser-side API calls (keeps API keys out of the static site, avoids CORS).

| Source | Endpoint | Keyed? | What we pull |
|--------|----------|--------|--------------|
| **Congress.gov** | `api.congress.gov/v3/bill` | api.data.gov key (free) | Bills matching a curated keyword list per project (e.g., "45V hydrogen", "IRA repeal", "offshore wind", "Section 201 solar"). Pull title, sponsors, latest action, status, cosponsors split D/R. |
| **Federal Register** | `federalregister.gov/api/v1/documents` | None | Treasury/IRS notices on 45V/48E/45X rules, BOEM permitting docs, USTR Section 301 actions. Filter by agency + keyword. |
| **Kalshi** | `api.elections.kalshi.com/trade-api/v2/markets` | Public read | Markets with keywords matching project exposures: "IRA repeal 2026", "Section 301 tariff increase", "Trump executive order energy", etc. Pull yes/no prices, volume, expiry. |

**Cache policy** — Each client caches responses by request key in `data/castle_eri/cache/` with TTL: Congress 6h, Federal Register 12h, Kalshi 15m. Re-runs of `refresh.py` are cheap; first run will take 30–60s.

**Claude in the loop** — `mapping.py` uses the Anthropic SDK (with prompt caching on the project-context prefix) to: given a project's technology + suppliers + location, produce a list of relevant Congress.gov keywords, Federal Register agencies, and Kalshi market themes. This runs once per `refresh.py` invocation per project; mapping output is cached on disk and only re-generated when a project's seed data changes. Without Claude this would be a brittle keyword list; with it, exposures stay current as Congress introduces new bills using new language.

**Hedge mapping** — For each project exposure, `refresh.py` ranks live Kalshi markets by semantic match (Claude scores 0–1 relevance). Top 1–3 markets per exposure become the "Suggested hedges" block on the project page, with notional sized to roughly offset the exposure's expected loss (`notional = expected_loss / (1 - market_price)` for binary YES contracts).

---

## Pages — what each one shows

### `index.html` — Portfolio overview
- **Header**: Castle wordmark (`castle-logo-black.svg`), ALL-CAPS Geist Mono nav (Portfolio · Policies · Hedges · Methodology)
- **Hero strip**: portfolio-wide aggregate — total capex tracked, weighted-average risk score, count of active policy threats this week. Hedvig Letters Serif, bone-paper background, no card chrome.
- **Project grid**: 5 cards, one per project. Each card shows project name, technology + capacity eyebrow, the big 0–100 score, the stacked sub-score bar, top 2 exposures as one-line bullets, and a "View →" link to `project.html?id=...`.
- **Live policy ticker** at the bottom (horizontal scroll, 480s linear, port of `NewsTicker.jsx`): 8–12 most recent items from `policies.json`, formatted "BILL HR-1234 · Section 301 review extended · 2 days ago".

### `project.html?id=...` — Project detail
- **Project header**: name (serif, 64px), technology / location / capex / COD as Geist Mono tags
- **Risk Index panel**: headline score + stacked sub-score bar + 4 sub-score readouts with one-line drivers
- **Exposure table**: rows for each tracked risk factor. Columns: Risk · Source (Congress / Federal Register / USTR / Geopolitical) · $-Impact · Probability · Status. Borders only, no zebra striping. Tabular nums for $.
- **Suggested hedges section**: 3–5 hedge cards (ported from `ContractCard.jsx`), each showing the Kalshi market, current YES price, recommended notional, and which exposure(s) it hedges
- **Project narrative**: 2–3 paragraph context block at the bottom

### `policies.html` — Policy tracker
- Filterable list of every policy item across all projects: bills, federal-register rules, tariff actions
- Filters: source (Congress / Federal Register / USTR / Geopolitical), affected project (multi), severity, last 7/30/90 days
- Each row: title, source badge, latest action + date, affected projects as small chips, "View" link to a modal (port `EventDetailModal.jsx`) showing the raw item + Claude-generated impact summary

### `hedges.html` — Hedge marketplace
- Grid of every live Kalshi market that's been mapped to any project's exposure
- Each market card: title, YES price (large, tabular), volume, expiry, which projects it hedges
- Sort: by relevance, by yield, by expiry

### `methodology.html`
- The Risk Index sub-score math, weights, data sources
- "How we pick hedges" — the Claude relevance-scoring approach
- Limitations + disclaimers in the Castle "For informational purposes only" footer style

---

## Visual / design system specifics

**Light theme only** (no Situation Room) — matches the institutional, restrained brief.

- Background: `--castle-bone` `#F5F5F0`
- Surface: `--bg-card` `#FFFFFF`
- Borders: 1px `rgba(24,24,24,0.12)` hairlines, no shadows, **radius 0** everywhere
- Headings: Hedvig Letters Serif, sentence case, `letter-spacing: -0.01em`
- Body: Geist
- Eyebrows / metric labels / button text: Geist Mono ALL CAPS, tracking `0.25em–0.4em`
- Numerics: `font-variant-numeric: tabular-nums` everywhere
- Primary CTA: black square `bg: var(--fg); color: var(--castle-bone)`, never rounded
- Accents on the risk bar: Teal `#246075` (Policy), Deep Teal `#00544F` (Trade), Forest `#395938` (Geo), Deep Blue `#3A5C9A` (Macro). Per brand guidance, accents stay ~20% of any composition.
- Icons: Lucide via CDN (`script type="module"` from unpkg)
- No emoji, no gradients, no rounded corners, no shadows

Components ported from `/Users/arjunpandey/.claude/skills/castle-design/ui_kits/dashboard/`:
- `ContractCard.jsx` → vanilla `<article class="contract-card">` template in `components.js`
- `EventDetailModal.jsx` → static `<dialog>` element + open/close JS
- `NewsTicker.jsx` → CSS keyframe scroll, 480s linear infinite
- `MarketplaceNavbar.jsx` → static header markup, no JS needed
- `Footer.jsx` → static markup

`assets/css/colors_and_type.css` is **copied** verbatim from the castle-design skill (source of truth), not re-derived. `assets/svg/` pulls `castle-logo-black.svg` and the knight icons from the skill's `assets/` folder.

---

## Cloud session execution workflow

The cloud session does everything end-to-end. It should work in roughly this order. Stop and report if any step fails.

### Step 0 — Bootstrap and asset staging

**Already done in the repo before kickoff** (do NOT redo these — just verify they exist):
- `README.md` and `.gitignore` at the repo root
- `BUILD.md` (this file)
- `design-system/` — full bundle of the Castle design system: `colors_and_type.css`, `brand_guidelines.txt`, `SKILL.md`, `README.md`, `assets/` (logo SVGs + dithered PNGs), `fonts/`, `preview/`, `ui_kits/{web,dashboard}/`. Treat as read-only reference.
- Git is already initialized on `main` with one commit. Just `git add` + `git commit` as you go.

**What the session still needs to do:**

1. **Stage runtime copies** from `design-system/` into `public/` so the static site can fetch them at runtime:

   | Source (in repo) | Destination (in repo) |
   |---|---|
   | `design-system/colors_and_type.css` | `public/assets/css/colors_and_type.css` |
   | `design-system/assets/castle-logo-black.svg` | `public/assets/svg/castle-logo-black.svg` |
   | `design-system/assets/castle-logo-white.svg` | `public/assets/svg/castle-logo-white.svg` |
   | `design-system/assets/knights.svg` *(if present)* | `public/assets/svg/knights.svg` |
   | `design-system/assets/castle-asset-*.png` *(only if a page actually uses one)* | `public/assets/img/...` |

   `colors_and_type.css` and the logo SVGs are required. The dithered PNGs are available if a page needs hero imagery; v1 doesn't have to use them.

2. **Read reference patterns (optional).** If `/Users/arjunpandey/castle/castle-tariff-tracker-stepbystep.md` is readable, scan it once for the Federal Register client pattern, Kalshi client pattern, Pydantic model conventions, cache TTL strategy, and exponential-backoff retry recipe. Don't block on it — these can be derived from scratch if unavailable.

3. **Scaffold the project tree** per the "Directory layout" section above (everything under `data/` and `public/`, since `design-system/` already exists). Create empty placeholder files for everything that will be filled in later (HTML pages, Python modules, etc.). Add `.gitkeep` files for empty directories.

4. **Write `.env.example`** at the project root:
   ```
   # Required
   ANTHROPIC_API_KEY=sk-ant-xxx               # Claude — for project→exposure mapping
   CONGRESS_GOV_API_KEY=xxx                   # Free from https://api.data.gov/signup
   # Optional (Kalshi public read endpoints work without auth; auth raises rate limits)
   KALSHI_API_KEY_ID=
   KALSHI_PRIVATE_KEY_PATH=
   # No key needed for Federal Register
   ```
   The repo-root `.gitignore` is already set up (covers `.env`, caches, etc.).

5. **Write `data/castle_eri/projects.py`** containing all 5 projects as Pydantic literals — populated from the table in "The 5 seed projects" section above. Each project specifies: `id`, `name`, `technology`, `capacity_mw`, `location`, `cod_quarter`, `capex_usd`, `equity_irr_target`, `key_suppliers` (list of `(name, country, component_type)`), `offtake_status`, `policy_dependencies` (specific bill numbers, rule citations, HTS codes drawn from the table), `narrative` (2–3 sentence project description), and `keyword_seeds` (8–12 search terms the Claude mapper expands into Congress.gov / Federal Register / Kalshi queries). The session writes these as concrete Python data — do not invent additional projects.

6. **Commit progress** as you finish each step.

### Step 1 — Python data layer

Implement under `data/`, in this order:

1. `pyproject.toml` — uv-managed, deps: `pydantic>=2`, `pydantic-settings`, `httpx`, `typer`, `anthropic`, `python-dotenv`. Add `pytest` to dev-deps.
2. `castle_eri/models.py` — Pydantic models for `Project`, `RiskFactor`, `ProjectExposure`, `HedgeContract`, `IndexScore` per the schema sketched in "Risk Index methodology".
3. `castle_eri/clients/` — one client per source (Congress.gov, Federal Register, Kalshi, optionally USTR scraper). Each uses `httpx.AsyncClient`, has an on-disk JSON cache with the TTLs from the "Live data integration" table, and exponential-backoff retries (start 1s, max 30s). API keys read from env via pydantic-settings.
4. `castle_eri/mapping.py` — Claude-powered project→exposures mapper. Prompt-cache the Castle context + brand framing as the system prompt; the per-project payload is the only thing that varies. Output schema: list of `RiskFactor` objects with `category` ∈ {policy, trade, geopolitical, macro}.
5. `castle_eri/index_math.py` — implement the four sub-score functions and the composite, exactly per the methodology table (weights 35/25/25/15). Pure functions, fully unit-testable.
6. `refresh.py` — Typer CLI. Subcommands: `refresh` (default — runs the full pipeline), `mapping-only`, `markets-only`. Emits `public/data/{projects,policies,markets,index}.json`. Logs progress to stdout.
7. `tests/` — at minimum: one client smoke test per source (with `httpx-mock`), and `index_math` unit tests with synthetic inputs.

### Step 2 — Generate live data

Run `uv run refresh.py` once. Confirm the four JSON files appear under `public/data/` and each project in `index.json` has all four sub-scores plus a non-empty exposure list.

### Step 3 — Static site

Build the five HTML pages per the "Pages — what each one shows" section. Conventions:

- Each page is a complete standalone HTML5 document. No build step. Open directly with `python3 -m http.server`.
- `<head>` imports Google Fonts (Hedvig Letters Serif, Geist, Geist Mono), `colors_and_type.css`, and `app.css`. Lucide loads via the CDN snippet from `design-system/SKILL.md`.
- All copy, layout, and visual rules pulled from `design-system/brand_guidelines.txt`, `design-system/SKILL.md`, and `design-system/README.md`. Re-read these before writing any CSS — the "what NOT to do" list in `SKILL.md` is binding.
- `assets/js/data.js` exposes `loadJSON(name)` (fetches `data/{name}.json`, caches in memory). `assets/js/components.js` exposes render functions (`renderProjectCard`, `renderExposureRow`, `renderHedgeCard`, `renderRiskBar`, `renderTicker`). `assets/js/pages/{name}.js` is the per-page entry point.
- Port `ContractCard.jsx`, `EventDetailModal.jsx`, `NewsTicker.jsx` from `design-system/ui_kits/dashboard/` to vanilla equivalents. Keep their class names so the kit CSS continues to apply.

### Step 4 — Verify

Run the verification checklist in the next section.

### Step 5 — Commit and report

Commit progress with a clear message. Report back to the operator with: a list of files created, the output of one `refresh.py` run, and screenshots (or paths to screenshots) of all five pages.

---

## Verification

Once built, verify the full loop end-to-end:

1. **Data layer runs clean**: from `data/`, run `uv run refresh.py` — should fetch from all three APIs, write four JSON files to `public/data/`, exit 0. Re-running within the cache TTL should be <2s.
2. **Risk math sanity**: open `public/data/index.json` and confirm each of the 5 projects has a composite score 0–100, four sub-scores that sum to the composite per the documented weights, and at least one mapped exposure per sub-score.
3. **Pages render with live data**: from `public/`, run `python3 -m http.server 8000` and open `http://localhost:8000`. Walk every page (portfolio → click into each of 5 projects → policies → hedges → methodology). Confirm: real bill titles from Congress.gov appear in the ticker and on `policies.html`; real Kalshi market prices appear on `hedges.html` and project pages; the risk-bar tooltips show the actual driving inputs.
4. **Design fidelity**: side-by-side with a `castle-design/preview/` card, confirm bone-paper background, hairline borders, no rounded corners, Hedvig + Geist + Geist Mono loading correctly, Lucide icons rendering. No emoji anywhere. Take screenshots of all 5 pages for the demo deck.
5. **Single keyword smoke test**: in `data/castle_eri/projects.py`, change `Permian Hydrogen Hub`'s 45V dependency keyword from "hydrogen" to "deuterium" (a known-empty term), re-run `refresh.py`, confirm that project's Policy sub-score drops materially and the exposure list shortens — proves the live wiring is actually load-bearing.

---

## Open questions / nice-to-haves (not in v1)

- **Add-project intake** — deferred per user direction; would slot in as `new.html` + a Claude-powered exposure auto-generator
- **Refresh-on-load** — for v1, `refresh.py` runs manually; in a later pass, wrap it in a tiny FastAPI endpoint so the static site can trigger a refresh
- **Polymarket** alongside Kalshi — Kalshi has stronger US-policy market coverage, so v1 is Kalshi-only; Polymarket is easy to add later
- **Auth / per-customer portfolios** — out of scope for the prototype; everyone sees the same 5 seed projects
- **Notifications / digest emails** — out of scope; the policy ticker is the only "alert" surface in v1
