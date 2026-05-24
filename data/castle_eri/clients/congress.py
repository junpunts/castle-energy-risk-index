"""Congress.gov client (api.congress.gov v3, keyed via api.data.gov)."""
from __future__ import annotations
import logging
from typing import Any

from ..settings import settings
from . import _cache, _http

log = logging.getLogger(__name__)

BASE = "https://api.congress.gov/v3"
TTL = 6 * 60 * 60  # 6 hours

# Bill types that are pure scheduling / procedural noise — never substantive policy.
NOISE_TYPES = {"hconres", "sconres"}
NOISE_TITLE_PATTERNS = (
    "adjournment of the two houses",
    "joint session of congress to receive",
    "providing for the counting of",
    "concurrent resolution providing for",
    "correcting the enrollment",
    "correct technical errors in the enrollment",
)


def _is_substantive(bill: dict, query: str) -> bool:
    """Filter out procedural resolutions and bills that don't actually reference `query`."""
    btype = (bill.get("type") or bill.get("billType") or "").lower()
    title = (bill.get("title") or "").lower()
    q = query.lower().strip()
    if btype in NOISE_TYPES:
        return False
    if any(p in title for p in NOISE_TITLE_PATTERNS):
        return False
    # Require at least one query token (>3 chars) to appear in the title.
    tokens = [t for t in q.split() if len(t) > 3]
    if tokens and not any(t in title for t in tokens):
        return False
    return True


async def search_bills(query: str, *, limit: int = 10) -> list[dict[str, Any]]:
    """Search Congress.gov for bills matching `query`. Returns the raw `bills` list,
    filtered to substantive matches (no adjournment / scheduling resolutions)."""
    if not settings.congress_api_key:
        log.warning("CONGRESS_API_KEY not set — skipping Congress.gov fetch")
        return []
    cache_key = {"q": query, "limit": limit, "v": 2}
    if cached := _cache.read("congress", cache_key, TTL):
        return cached

    url = f"{BASE}/bill"
    # Pull 3× the requested limit, then filter and trim.
    params = {
        "api_key": settings.congress_api_key,
        "query": query,
        "limit": limit * 3,
        "sort": "updateDate+desc",
        "format": "json",
    }
    try:
        data = await _http.get_json(url, params=params)
    except Exception as e:
        log.error("Congress search failed for %r: %s", query, e)
        return []
    bills = data.get("bills", []) or []
    bills = [b for b in bills if _is_substantive(b, query)][:limit]
    _cache.write("congress", cache_key, bills)
    return bills


async def get_bill_detail(congress: int, bill_type: str, number: int) -> dict[str, Any]:
    if not settings.congress_api_key:
        return {}
    key = {"c": congress, "t": bill_type, "n": number}
    if cached := _cache.read("congress_detail", key, TTL):
        return cached
    url = f"{BASE}/bill/{congress}/{bill_type.lower()}/{number}"
    params = {"api_key": settings.congress_api_key, "format": "json"}
    try:
        data = await _http.get_json(url, params=params)
    except Exception as e:
        log.warning("Congress detail failed for %s%s-%s: %s", bill_type, number, congress, e)
        return {}
    bill = data.get("bill", {}) or {}
    _cache.write("congress_detail", key, bill)
    return bill
