"""Kalshi public-read client (api.elections.kalshi.com/trade-api/v2).

Kalshi's `/markets` firehose is dominated by sports and esports. To find
policy-relevant contracts we instead paginate `/events?with_nested_markets=true`
filtered to a curated set of categories (Politics, Economics, Climate and Weather,
Companies, World, Commodities, Financials), then search the flattened markets.

`search_markets(query)` returns a list of normalized dicts:
  - ticker, title, event_title, event_ticker, category
  - yes_price (float, 0–1), volume, volume_usd
  - close_time
"""
from __future__ import annotations
import logging
from typing import Any

from . import _cache, _http

log = logging.getLogger(__name__)

BASE = "https://api.elections.kalshi.com/trade-api/v2"
TTL = 15 * 60  # 15 minutes
RELEVANT_CATEGORIES = {
    "Politics", "Economics", "Climate and Weather",
    "World", "Companies", "Commodities", "Financials",
}


def _to_price(x: Any) -> float:
    """Coerce a Kalshi `*_dollars` value (which is a string like '0.3700' OR
    a legacy `*_cents` integer) into a float in [0.01, 0.99]."""
    if x is None or x == "":
        return 0.5
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.5
    if v > 1.0:        # treat as cents
        v = v / 100.0
    return max(0.01, min(0.99, v))


def _normalize(market: dict, event: dict) -> dict:
    price = _to_price(
        market.get("yes_ask_dollars")
        or market.get("last_price_dollars")
        or market.get("yes_bid_dollars")
        or market.get("yes_ask")
        or market.get("yes_bid")
    )
    volume = float(market.get("volume_fp") or market.get("volume", 0) or 0)
    close_time = market.get("close_time") or market.get("expiration_time") or ""
    return {
        "ticker": market.get("ticker", ""),
        "event_ticker": market.get("event_ticker") or event.get("event_ticker", ""),
        "event_title": event.get("title", ""),
        "category": event.get("category", ""),
        "title": market.get("title", "") or event.get("title", ""),
        "yes_price": price,
        "volume": volume,
        "volume_usd": volume * price,  # rough: notional traded × current YES price
        "close_time": close_time,
    }


async def _events_pool(max_events: int = 1500, page_size: int = 200) -> list[dict]:
    """Paginate `/events?with_nested_markets=true` filtered to RELEVANT_CATEGORIES,
    flatten into normalized markets."""
    pool_key = {"v": 3, "max": max_events, "page": page_size, "cats": sorted(RELEVANT_CATEGORIES)}
    if cached := _cache.read("kalshi_events_pool", pool_key, TTL):
        return cached

    markets: list[dict] = []
    cursor: str | None = None
    seen_event_tickers: set[str] = set()
    pages_seen = 0
    max_pages = max_events // page_size + 1

    while pages_seen < max_pages and len(markets) < max_events:
        params: dict[str, Any] = {
            "status": "open",
            "with_nested_markets": "true",
            "limit": page_size,
        }
        if cursor:
            params["cursor"] = cursor
        try:
            data = await _http.get_json(f"{BASE}/events", params=params)
        except Exception as e:
            log.warning("Kalshi events page %s failed: %s", pages_seen, e)
            break
        pages_seen += 1

        for event in data.get("events", []) or []:
            cat = event.get("category", "")
            if cat not in RELEVANT_CATEGORIES:
                continue
            et = event.get("event_ticker", "")
            if et in seen_event_tickers:
                continue
            seen_event_tickers.add(et)
            for m in event.get("markets", []) or []:
                if m.get("status") not in (None, "active", "initialized"):
                    continue
                markets.append(_normalize(m, event))

        cursor = data.get("cursor") or None
        if not cursor:
            break

    if markets:
        _cache.write("kalshi_events_pool", pool_key, markets)
    return markets


_STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "to", "for", "in", "on", "with",
    "will", "be", "is", "are", "was", "were", "by", "at", "from", "into",
    "this", "that", "these", "those", "us", "u.s.", "u.s",
}


def _tokens(s: str) -> set[str]:
    """Lowercase, strip punctuation, drop stopwords + short tokens."""
    import re as _re
    out = set()
    for tok in _re.split(r"[^a-z0-9§]+", s.lower()):
        tok = tok.strip("§")
        if not tok or tok in _STOPWORDS or (len(tok) < 3 and not tok.isdigit()):
            continue
        out.add(tok)
    return out


async def search_markets(query: str, *, limit: int = 25) -> list[dict[str, Any]]:
    """Token-based search: a market matches if at least one non-stopword query
    token appears in the market's tokenized haystack. Returned in descending
    relevance (token overlap)."""
    cache_key = {"q": query, "limit": limit, "v": 4}
    if cached := _cache.read("kalshi_search", cache_key, TTL):
        return cached

    pool = await _events_pool()
    q_tokens = _tokens(query)
    if not q_tokens:
        _cache.write("kalshi_search", cache_key, [])
        return []

    scored: list[tuple[int, dict]] = []
    for m in pool:
        haystack = " ".join([
            m.get("ticker", ""),
            m.get("event_ticker", ""),
            m.get("event_title", ""),
            m.get("title", ""),
            m.get("category", ""),
        ])
        m_tokens = _tokens(haystack)
        overlap = len(q_tokens & m_tokens)
        if overlap > 0:
            scored.append((overlap, m))

    scored.sort(key=lambda kv: -kv[0])
    hits = [m for _, m in scored[:limit]]
    _cache.write("kalshi_search", cache_key, hits)
    return hits
