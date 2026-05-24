from __future__ import annotations
import hashlib
import json
import time
from pathlib import Path
from typing import Any

from ..settings import CACHE_DIR


def _key(namespace: str, payload: Any) -> Path:
    blob = json.dumps(payload, sort_keys=True, default=str).encode()
    digest = hashlib.sha256(blob).hexdigest()[:16]
    d = CACHE_DIR / namespace
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{digest}.json"


def read(namespace: str, payload: Any, ttl_seconds: int) -> Any | None:
    p = _key(namespace, payload)
    if not p.exists():
        return None
    try:
        wrapper = json.loads(p.read_text())
        if time.time() - wrapper["ts"] > ttl_seconds:
            return None
        return wrapper["data"]
    except Exception:
        return None


def write(namespace: str, payload: Any, data: Any) -> None:
    p = _key(namespace, payload)
    p.write_text(json.dumps({"ts": time.time(), "data": data}))
