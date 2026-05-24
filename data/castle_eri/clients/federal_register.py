"""Federal Register client (federalregister.gov/api/v1, no auth)."""
from __future__ import annotations
import logging
from typing import Any

from . import _cache, _http

log = logging.getLogger(__name__)

BASE = "https://www.federalregister.gov/api/v1"
TTL = 12 * 60 * 60  # 12 hours


async def search_documents(
    term: str,
    *,
    agencies: list[str] | None = None,
    per_page: int = 10,
) -> list[dict[str, Any]]:
    cache_key = {"term": term, "agencies": agencies or [], "per_page": per_page}
    if cached := _cache.read("fr", cache_key, TTL):
        return cached

    url = f"{BASE}/documents.json"
    params: dict[str, Any] = {
        "conditions[term]": term,
        "per_page": per_page,
        "order": "newest",
    }
    if agencies:
        for i, agency in enumerate(agencies):
            params[f"conditions[agencies][{i}]"] = agency
    try:
        data = await _http.get_json(url, params=params)
    except Exception as e:
        log.error("Federal Register search failed for %r: %s", term, e)
        return []
    results = data.get("results", []) or []
    _cache.write("fr", cache_key, results)
    return results
