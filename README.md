# Castle Energy Risk Index

A Castle-branded dashboard for renewable energy developers to track legislative, regulatory, and geopolitical risk to specific projects, with prediction-market hedges sized per exposure.

**Status**: pre-build. Scaffolding and implementation will be done by a Castle cloud session — see `BUILD.md` for the complete brief.

## What this will be (once built)

A static HTML site backed by a Python data layer:

- **Portfolio overview** of 5 representative renewable projects (utility solar, offshore wind, battery storage, green hydrogen, EV charging)
- **Per-project risk index** (0–100) composed of four sub-scores: Policy, Trade, Geopolitical, Macro
- **Live data** from Congress.gov, the Federal Register, and Kalshi
- **Suggested hedges** mapped from each exposure to live prediction-market contracts

## Running it (after the cloud session builds it)

```bash
# 1. Fetch live data and compute the risk index
cd data
uv sync
cp ../.env.example ../.env  # then fill in API keys
uv run refresh.py

# 2. Serve the static site
cd ../public
python3 -m http.server 8000
# open http://localhost:8000
```

## For the cloud session

Read `BUILD.md` end-to-end before starting. Begin at "Cloud session execution workflow → Step 0".
