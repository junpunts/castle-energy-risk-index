"""Castle Energy Risk Index — data layer entry point.

  uv run refresh.py            # full pipeline
  uv run refresh.py mapping    # Claude project→factor mapping only
  uv run refresh.py markets    # Kalshi pull only
"""
from __future__ import annotations
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import typer
from dotenv import load_dotenv

# Allow `uv run refresh.py` from the `data/` directory
sys.path.insert(0, str(Path(__file__).resolve().parent))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from castle_eri import index_math, mapping  # noqa: E402
from castle_eri.clients import congress, federal_register, kalshi  # noqa: E402
from castle_eri.models import Bundle, HedgeSuggestion, MarketContract, Methodology, PolicyItem, RiskFactor  # noqa: E402
from castle_eri.projects import PROJECTS  # noqa: E402
from castle_eri.settings import OUT_DIR, settings  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("refresh")

app = typer.Typer(add_completion=False, help="Castle ERI data refresh")


# ── data fetching ────────────────────────────────────────────────────

def _norm(s: str) -> str:
    return " ".join(s.lower().strip().split())


def _severity(latest_action: str, sponsors_d: int, sponsors_r: int) -> str:
    la = latest_action.lower()
    if any(t in la for t in ("became public law", "signed by president", "passed senate", "passed house")):
        return "critical"
    if any(t in la for t in ("reported", "ordered to be reported", "placed on calendar", "passed committee")):
        return "high"
    if sponsors_d > 0 and sponsors_r > 0:
        return "medium"
    return "low"


def _bill_to_item(bill: dict, project_ids: list[str], keywords: list[str]) -> PolicyItem:
    number = bill.get("number") or bill.get("billNumber") or ""
    btype = bill.get("type") or bill.get("billType") or ""
    congress_num = bill.get("congress") or ""
    title = bill.get("title") or "(no title)"
    la_obj = bill.get("latestAction") or {}
    la = la_obj.get("text", "") if isinstance(la_obj, dict) else ""
    la_date = la_obj.get("actionDate", "") if isinstance(la_obj, dict) else ""
    bill_id = f"{btype}{number}-{congress_num}".lower() or _norm(title)[:48]
    url = f"https://www.congress.gov/bill/{congress_num}th-congress/{(btype or 'house-bill').lower()}/{number}"
    return PolicyItem(
        id=f"congress::{bill_id}",
        source="congress",
        title=f"{btype} {number} — {title}".strip(" —"),
        latest_action=la,
        latest_action_date=la_date,
        url=url,
        severity=_severity(la, 0, 0),  # cosponsor breakdown costs an extra API call per bill — skip in v1
        affected_project_ids=sorted(set(project_ids)),
        keywords=keywords[:6],
    )


def _fr_to_item(doc: dict, project_ids: list[str], keywords: list[str]) -> PolicyItem:
    doc_id = doc.get("document_number") or _norm(doc.get("title", ""))[:48]
    title = doc.get("title") or "(no title)"
    agency = ", ".join(a.get("name", "") for a in (doc.get("agencies") or [])) or doc.get("type", "")
    pub_date = doc.get("publication_date") or ""
    abstract = doc.get("abstract") or ""
    url = doc.get("html_url") or doc.get("public_inspection_pdf_url") or ""
    return PolicyItem(
        id=f"fr::{doc_id}",
        source="federal_register",
        title=title,
        summary=abstract[:280],
        latest_action=doc.get("action") or doc.get("type", ""),
        latest_action_date=pub_date,
        url=url,
        agency=agency,
        severity="medium",
        affected_project_ids=sorted(set(project_ids)),
        keywords=keywords[:6],
    )


def _market_to_contract(m: dict, keywords: list[str]) -> MarketContract:
    """Build a MarketContract from a Kalshi client-normalized dict."""
    ticker = m.get("ticker", "") or ""
    title = m.get("title", "") or ticker
    event_title = m.get("event_title", "") or m.get("event_ticker", "") or m.get("category", "")
    yes_price = float(m.get("yes_price", 0.5))
    volume_usd = float(m.get("volume_usd", 0) or 0)
    expiry = m.get("close_time") or ""
    if isinstance(expiry, str) and "T" in expiry:
        expiry = expiry.split("T")[0]
    return MarketContract(
        id=f"kalshi::{ticker or _norm(title)[:48]}",
        platform="kalshi",
        ticker=ticker,
        event_title=event_title[:120],
        title=title[:200],
        yes_price=yes_price,
        volume_usd=volume_usd,
        expiry_date=expiry or "",
        url=f"https://kalshi.com/markets/{ticker}" if ticker else "",
        keywords=keywords[:6],
    )


async def _gather_policies(projects) -> list[PolicyItem]:
    seen: dict[str, PolicyItem] = {}
    for project in projects:
        for kw in project.keyword_seeds[:6]:
            bills = await congress.search_bills(kw, limit=5)
            for b in bills:
                item = _bill_to_item(b, [project.id], [kw])
                if item.id in seen:
                    seen[item.id].affected_project_ids = sorted(
                        set(seen[item.id].affected_project_ids) | {project.id}
                    )
                    seen[item.id].keywords = sorted(set(seen[item.id].keywords) | {kw})
                else:
                    seen[item.id] = item
            docs = await federal_register.search_documents(kw, per_page=4)
            for d in docs:
                item = _fr_to_item(d, [project.id], [kw])
                if item.id in seen:
                    seen[item.id].affected_project_ids = sorted(
                        set(seen[item.id].affected_project_ids) | {project.id}
                    )
                    seen[item.id].keywords = sorted(set(seen[item.id].keywords) | {kw})
                else:
                    seen[item.id] = item
    return list(seen.values())


async def _gather_markets(projects, factors: list[RiskFactor]) -> list[MarketContract]:
    seen: dict[str, MarketContract] = {}

    # Per-project keyword seeds
    queries: set[str] = set()
    for p in projects:
        for kw in p.keyword_seeds[:6]:
            queries.add(kw)
    # Per-factor keywords (mapper output)
    for f in factors:
        for kw in f.keywords[:3]:
            queries.add(kw)

    for q in sorted(queries):
        markets = await kalshi.search_markets(q, limit=5)
        for m in markets:
            contract = _market_to_contract(m, [q])
            if contract.id in seen:
                seen[contract.id].keywords = sorted(set(seen[contract.id].keywords) | {q})
            else:
                seen[contract.id] = contract
    return list(seen.values())


def _rank_hedges(
    factors: list[RiskFactor], markets: list[MarketContract], top_n: int = 3
) -> list[HedgeSuggestion]:
    """Rank markets per factor by keyword Jaccard overlap. Top N per factor with relevance > 0."""
    out: list[HedgeSuggestion] = []
    for f in factors:
        f_kws = {_norm(k) for k in f.keywords}
        # Also include the factor title as a keyword bag
        f_kws |= {w for w in _norm(f.title).split() if len(w) > 3}
        ranked: list[tuple[float, MarketContract]] = []
        for m in markets:
            m_kws = {_norm(k) for k in m.keywords}
            m_kws |= {w for w in _norm(m.title).split() if len(w) > 3}
            if not f_kws or not m_kws:
                continue
            inter = len(f_kws & m_kws)
            union = len(f_kws | m_kws)
            jaccard = inter / union if union else 0.0
            # Boost if any exact keyword match
            exact = len({k for k in f.keywords if any(_norm(k) == _norm(mk) for mk in m.keywords)})
            score = jaccard + 0.10 * exact
            if score > 0:
                ranked.append((score, m))
        ranked.sort(key=lambda kv: -kv[0])
        for relevance, m in ranked[:top_n]:
            # notional = expected_loss / (1 − yes_price) — per BUILD.md
            expected_loss = f.dollar_impact_usd * f.probability
            denom = max(0.05, 1.0 - m.yes_price)
            notional = expected_loss / denom
            out.append(HedgeSuggestion(
                project_id=f.project_id,
                factor_id=f.id,
                market_id=m.id,
                relevance=round(relevance, 3),
                notional_usd=round(notional, -3),
                rationale=(
                    f"Pays $1 if YES; hedges '{f.title}' "
                    f"(EL ${expected_loss/1e6:.1f}M, market p={m.yes_price:.2f})."
                ),
            ))
    return out


# ── attention timeseries ─────────────────────────────────────────────

WEEKS = 12


def _enrich_factors_with_attention(factors: list[RiskFactor], policies: list[PolicyItem]) -> None:
    """For each factor: compute a 12-week activity sparkline from policies whose
    title/summary contains any of the factor's keywords. Then normalize to a
    0–100 attention score (max across all factors → 100) and bucket the
    factor's probability into a Likelihood label."""
    now = datetime.now(timezone.utc)
    # Pre-tokenize policy text for fast matching
    policy_corpus: list[tuple[datetime, str]] = []
    for p in policies:
        if not p.latest_action_date:
            continue
        try:
            dt = datetime.fromisoformat(p.latest_action_date.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        text = " ".join([p.title, p.summary, p.latest_action]).lower()
        policy_corpus.append((dt, text))

    max_total = 1
    for f in factors:
        weekly = [0] * WEEKS
        f_kw = [k.lower() for k in f.keywords if len(k) > 3]
        # Add factor title tokens as fallback keywords
        title_tokens = [t.lower() for t in f.title.split() if len(t) > 4]
        f_kw = list(set(f_kw + title_tokens))
        if not f_kw:
            f.attention_weekly = weekly
            continue
        for dt, text in policy_corpus:
            if not any(k in text for k in f_kw):
                continue
            weeks_ago = int((now - dt).days // 7)
            if 0 <= weeks_ago < WEEKS:
                # Index 0 = oldest, WEEKS-1 = most recent
                weekly[WEEKS - 1 - weeks_ago] += 1
        f.attention_weekly = weekly
        max_total = max(max_total, sum(weekly))

    # Normalize attention_score: 100 = the factor with the most total mentions
    for f in factors:
        total = sum(f.attention_weekly)
        f.attention_score = round(100.0 * total / max_total) if max_total else 0
        # Likelihood bucket
        if f.probability < 0.25:
            f.likelihood_bucket = "low"
        elif f.probability < 0.55:
            f.likelihood_bucket = "medium"
        else:
            f.likelihood_bucket = "high"


# ── pipeline ─────────────────────────────────────────────────────────

def _write(path: Path, data) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str))
    log.info("wrote %s (%.1f KB)", path.relative_to(OUT_DIR.parent), path.stat().st_size / 1024)


def _check_keys() -> None:
    missing = settings.ensure_required()
    if missing:
        log.warning("Missing env vars: %s — affected sources will be skipped or stubbed",
                    ", ".join(missing))


async def _run_full() -> None:
    _check_keys()

    log.info("Step 1/4 — mapping projects → risk factors (Claude)")
    factors = mapping.map_all(PROJECTS)
    log.info("  produced %d factors across %d projects", len(factors), len(PROJECTS))

    log.info("Step 2/4 — fetching live policy data (Congress.gov + Federal Register)")
    policies = await _gather_policies(PROJECTS)
    log.info("  collected %d unique policy items", len(policies))

    log.info("Step 3/4 — fetching Kalshi markets")
    markets = await _gather_markets(PROJECTS, factors)
    log.info("  collected %d unique markets", len(markets))

    log.info("Step 4/4 — enriching factors, scoring, mapping hedges")
    # Modulate policy-category factor probabilities by the count of live policy
    # items affecting the project, so the Policy sub-score is load-bearing on the
    # actual Congress/FR pull (BUILD.md verification step 5).
    policy_counts: dict[str, int] = {p.id: 0 for p in PROJECTS}
    for item in policies:
        for pid in item.affected_project_ids:
            policy_counts[pid] = policy_counts.get(pid, 0) + 1
    for f in factors:
        if f.category != "policy":
            continue
        n = policy_counts.get(f.project_id, 0)
        pressure = 0.55 + min(1.05, n / 25)  # 0.55× at 0 items → 1.60× saturated
        f.probability = max(0.0, min(1.0, f.probability * pressure))

    # Attention timeseries (12 weekly buckets) + likelihood bucket per factor
    _enrich_factors_with_attention(factors, policies)

    scores = [index_math.compute(p, [f for f in factors if f.project_id == p.id]) for p in PROJECTS]
    hedges = _rank_hedges(factors, markets, top_n=3)

    bundle = Bundle(
        methodology=Methodology(
            weights=index_math.WEIGHTS,
            version="v0.1",
            generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        ),
        projects=PROJECTS,
        factors=factors,
        hedges=hedges,
        scores=scores,
    )

    _write(OUT_DIR / "projects.json", [p.model_dump() for p in PROJECTS])
    _write(OUT_DIR / "policies.json", [p.model_dump() for p in policies])
    _write(OUT_DIR / "markets.json", [m.model_dump() for m in markets])
    _write(OUT_DIR / "index.json", bundle.model_dump())

    log.info("✓ refresh complete · %d projects · %d factors · %d policies · %d markets · %d hedges",
             len(PROJECTS), len(factors), len(policies), len(markets), len(hedges))


@app.command("refresh")
def cmd_refresh() -> None:
    """Run the full refresh pipeline (default)."""
    asyncio.run(_run_full())


@app.command("mapping")
def cmd_mapping() -> None:
    """Run only the Claude project→factor mapping."""
    factors = mapping.map_all(PROJECTS)
    _write(OUT_DIR / "_factors_only.json", [f.model_dump() for f in factors])


@app.command("markets")
def cmd_markets() -> None:
    """Pull only Kalshi markets (uses cached factor keywords if available)."""
    factors = mapping.map_all(PROJECTS)
    markets = asyncio.run(_gather_markets(PROJECTS, factors))
    _write(OUT_DIR / "markets.json", [m.model_dump() for m in markets])


if __name__ == "__main__":
    if len(sys.argv) == 1:
        cmd_refresh()
    else:
        app()
