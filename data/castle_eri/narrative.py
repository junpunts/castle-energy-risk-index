"""Claude-powered weekly narrative.

Once per refresh, given the portfolio state, ask Claude to write a 1-line
headline and a 3-sentence thesis paragraph for the brief. Designed to read
like a Bridgewater Daily Observation, not a templated dashboard.
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any

from .clients import _cache
from .models import HedgeSuggestion, MarketContract, PolicyItem, RiskFactor
from .projects import PROJECTS
from .settings import settings

log = logging.getLogger(__name__)

NARRATIVE_TTL = 24 * 60 * 60  # 1 day

SYSTEM = """You are Castle Technologies' senior energy risk analyst writing the \
Monday-morning brief for the firm's renewable-energy portfolio. Castle helps \
developers identify and hedge legislative / regulatory / trade exposures using \
prediction-market contracts (Kalshi).

You are given a snapshot of the portfolio state — top tracked risks (with their \
attention scores, expected losses, and analyst views), the most recent live \
policy items pulled from Congress.gov / Federal Register, and the Kalshi markets \
currently mapped to those exposures.

WRITE in this exact JSON shape, no commentary:
{
  "headline": "<a SPECIFIC, declarative claim about what is MOST IMPORTANT this week. 8-15 words. References a bill, rule, market, or named risk. Active voice. No hedging.>",
  "thesis":   "<3 sentences, 60-90 words total. Plain prose. References actual citations (bill numbers, IRC sections, HTS codes, Kalshi tickers, executive orders) from the data given. Tone: Bridgewater Daily Observation. Direct. Causal — explain WHY something matters, not WHAT the number is.>"
}

FORBIDDEN — these are dashboard-speak, never write them:
  - 'composite reading sits at <number>'
  - 'aggregate attention rose by <percent>%'
  - 'X risks are currently tracked'
  - 'the portfolio is exposed to X'
  - Lead-with-a-percentage opening lines
  - Hedging phrases like 'may', 'could potentially', 'is likely to'

GOOD opening examples:
  - 'Treasury's 45V three-pillars rulemaking is the only thing moving in renewables policy this week.'
  - 'Section 301 escalation on Chinese LFP cells went from tail risk to base case after USTR's draft notice last Thursday.'
  - 'BOEM's pause on new offshore-wind leases is now the binding constraint on Vineyard Wind Phase II.'

The reader is a renewables CFO who has 90 seconds before their 9 AM. Give them \
the one specific thing they need to know and why."""


def _build_payload(
    factors: list[RiskFactor],
    policies: list[PolicyItem],
    markets: list[MarketContract],
    hedges: list[HedgeSuggestion],
    wow_change_pct: float,
) -> str:
    # Top 5 factors by attention*expected_loss
    ranked = sorted(
        factors,
        key=lambda f: -f.attention_score * f.dollar_impact_usd * f.probability
    )[:6]
    factors_str = "\n".join(
        f"  - [{f.category}] {f.title} | citation: {f.citation} | "
        f"$at_risk: ${f.dollar_impact_usd/1e6:.0f}M | probability: {f.probability*100:.0f}% | "
        f"attention: {f.attention_score} | view: {f.our_view[:200]}"
        for f in ranked
    )

    # 5 most recent substantive policy items
    recent = [p for p in policies if p.latest_action_date]
    recent.sort(key=lambda p: p.latest_action_date, reverse=True)
    policies_str = "\n".join(
        f"  - [{p.source}] {p.title[:100]} ({p.latest_action_date}) — {p.latest_action[:120]}"
        for p in recent[:6]
    )

    # Top 5 mapped Kalshi markets by relevance
    market_by_id = {m.id: m for m in markets}
    top_hedges = sorted(hedges, key=lambda h: -h.relevance)[:6]
    markets_str = "\n".join(
        f"  - {market_by_id[h.market_id].ticker if h.market_id in market_by_id else h.market_id}: "
        f"{market_by_id[h.market_id].title[:120] if h.market_id in market_by_id else ''} | "
        f"YES ${market_by_id[h.market_id].yes_price:.2f} | "
        f"resolves {market_by_id[h.market_id].expiry_date if h.market_id in market_by_id else ''}"
        for h in top_hedges if h.market_id in market_by_id
    )

    return (
        f"PORTFOLIO STATE\n"
        f"  Tracked projects: {len(PROJECTS)} (utility solar, offshore wind, BESS, hydrogen, EV charging)\n"
        f"  Total tracked risks: {len(factors)}\n"
        f"  Total expected loss across portfolio: ${sum(f.dollar_impact_usd * f.probability for f in factors)/1e9:.2f}B\n"
        f"  WoW attention change: {wow_change_pct:+.0f}%\n"
        f"\nTOP RISKS (ranked by attention × expected loss)\n{factors_str}\n"
        f"\nRECENT POLICY ITEMS\n{policies_str or '  (no recent items)'}\n"
        f"\nTOP MAPPED HEDGES (Kalshi)\n{markets_str or '  (no mapped markets)'}\n"
    )


def _stub(
    factors: list[RiskFactor],
    wow_change_pct: float,
) -> dict[str, str]:
    """Deterministic fallback if Claude fails."""
    ranked = sorted(factors, key=lambda f: -f.attention_score)
    if not ranked:
        return {"headline": "Portfolio is quiet this week.",
                "thesis": "No tracked risk is registering elevated policy activity in Congress.gov or the Federal Register."}
    top = ranked[0]
    direction = "rose" if wow_change_pct > 5 else "eased" if wow_change_pct < -5 else "was unchanged"
    return {
        "headline": f"{top.title} is the dominant signal this week.",
        "thesis": (
            f"{top.our_view or top.description.split('.')[0] + '.'} "
            f"Aggregate Congressional activity across the portfolio's tracked exposures {direction} this week. "
            f"The signal is concentrated in {top.category} risk; the rest of the stack sits in monitoring territory."
        ),
    }


def generate(
    factors: list[RiskFactor],
    policies: list[PolicyItem],
    markets: list[MarketContract],
    hedges: list[HedgeSuggestion],
    wow_change_pct: float,
) -> dict[str, str]:
    """Returns {headline, thesis}. Falls back to stub on failure."""
    payload = _build_payload(factors, policies, markets, hedges, wow_change_pct)
    cache_key = {
        "v": 1,
        "hash": hash((payload, settings.anthropic_model)) & 0xFFFFFFFF,
    }
    if cached := _cache.read("narrative", cache_key, NARRATIVE_TTL):
        return cached

    if not settings.anthropic_api_key:
        result = _stub(factors, wow_change_pct)
        _cache.write("narrative", cache_key, result)
        return result

    try:
        from anthropic import Anthropic
    except ImportError:
        log.warning("anthropic SDK not installed — narrative falling back to stub")
        return _stub(factors, wow_change_pct)

    try:
        client = Anthropic(api_key=settings.anthropic_api_key)
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=600,
            system=[{
                "type": "text",
                "text": SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": payload}],
        )
        text = "".join(b.text for b in msg.content if hasattr(b, "text"))
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            raise ValueError("no JSON in response")
        data = json.loads(m.group(0))
        result = {
            "headline": str(data.get("headline", ""))[:200] or _stub(factors, wow_change_pct)["headline"],
            "thesis": str(data.get("thesis", ""))[:800] or _stub(factors, wow_change_pct)["thesis"],
        }
        _cache.write("narrative", cache_key, result)
        return result
    except Exception as e:
        log.warning("Narrative call failed: %s — using stub", e)
        return _stub(factors, wow_change_pct)
