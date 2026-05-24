from __future__ import annotations
import asyncio
import logging
from typing import Any
import httpx

log = logging.getLogger(__name__)


async def get_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
    max_attempts: int = 5,
) -> Any:
    """GET a JSON endpoint with exponential backoff. Re-raises after `max_attempts` failures."""
    delay = 1.0
    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(1, max_attempts + 1):
            try:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 429 or resp.status_code >= 500:
                    raise httpx.HTTPStatusError(
                        f"server {resp.status_code}", request=resp.request, response=resp
                    )
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPError, ValueError) as e:
                last_exc = e
                if attempt == max_attempts:
                    break
                log.warning("HTTP attempt %s/%s for %s failed: %s — retrying in %.1fs",
                            attempt, max_attempts, url, e, delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)
    assert last_exc is not None
    raise last_exc
