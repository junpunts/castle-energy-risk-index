"""Claude-powered project → exposures mapper.

For each project, produces a list of `RiskFactor` objects spanning the four
sub-score categories. The system prompt holds Castle context + the output
schema and is marked with `cache_control` so repeated invocations across
projects re-use the cached prefix.

If the Anthropic SDK isn't installed, the API key is missing, or the call
fails, we fall back to a deterministic stub that builds factors from the
project's seed `policy_dependencies` + `keyword_seeds`. This way `refresh.py`
always finishes with a usable factor list.
"""
from __future__ import annotations
import hashlib
import json
import logging
import re
from typing import Any

from .models import Project, RiskFactor
from .settings import settings
from .clients import _cache

log = logging.getLogger(__name__)

MAPPING_TTL = 24 * 60 * 60  # 1 day — re-derive only when seed data changes

SYSTEM = """You are a senior risk analyst at Castle Technologies, an enterprise-hedging \
firm that helps renewable-energy developers identify exposures to US legislation, trade \
actions, and geopolitical events, and map them to prediction-market hedges (Kalshi).

Castle's Energy Risk Index decomposes per-project risk into four sub-scores:
  • Policy (35%) — US bills, Treasury rules, agency actions affecting tax credits / permitting
  • Trade (25%) — tariffs, AD/CVD, UFLPA, Section 201/232/301, USMCA actions
  • Geopolitical (25%) — supply-chain country concentration, sanctions, export controls
  • Macro (15%) — IRR sensitivity to rate / curve moves

You will be given a single renewable-energy project (utility-scale solar, offshore wind, \
battery storage, green hydrogen, EV charging, etc.) with its technology, location, capex, \
suppliers, offtake status, and policy dependencies. Produce a list of 6–10 specific risk \
factors that materially affect this project's economics in the next 3–18 months.

OUTPUT — return ONLY a JSON object of the form:
{
  "factors": [
    {
      "category": "policy" | "trade" | "geopolitical" | "macro",
      "title": "Short label, 3–8 words, Title Case",
      "description": "1–2 sentence explanation of the specific mechanism",
      "citation": "Bill number / rule citation / HTS code / executive order — if applicable",
      "source": "congress" | "federal_register" | "kalshi" | "ustr" | "internal",
      "dollar_impact_usd": <number — adverse-outcome dollar impact to this project's NPV>,
      "probability": <number 0–1 — probability of the adverse outcome over the next 18 months>,
      "status": "active" | "pending" | "watching",
      "keywords": ["3–6 short keywords usable for Congress / Federal Register / Kalshi search"]
    }
  ]
}

Rules:
  • Each project MUST have ≥1 factor per category (so we have something to score against).
  • dollar_impact_usd must be a defensible fraction of the project's capex (typically 1–25%).
  • Be specific. Reference actual bills / rules / HTS codes / EOs where they exist.
  • No commentary outside the JSON object."""


def _project_payload(project: Project) -> str:
    suppliers = "\n".join(
        f"  - {s.name} ({s.country}) — {s.component_type} · {s.share_of_supply*100:.0f}% share"
        for s in project.key_suppliers
    )
    deps = "\n".join(f"  - {d}" for d in project.policy_dependencies)
    seeds = ", ".join(project.keyword_seeds)
    return (
        f"PROJECT\n"
        f"  Name: {project.name}\n"
        f"  Technology: {project.technology}\n"
        f"  Capacity: {project.capacity_label}\n"
        f"  Location: {project.location}\n"
        f"  COD: {project.cod_quarter}\n"
        f"  Capex: ${project.capex_usd/1e6:,.0f}M\n"
        f"  Target equity IRR: {project.equity_irr_target*100:.1f}%\n"
        f"  Offtake: {project.offtake_status}\n"
        f"\nKEY SUPPLIERS\n{suppliers}\n"
        f"\nPOLICY DEPENDENCIES\n{deps}\n"
        f"\nOPERATOR-SEEDED KEYWORDS\n  {seeds}\n"
    )


def _seed_hash(project: Project) -> str:
    blob = project.model_dump_json().encode()
    return hashlib.sha256(blob).hexdigest()[:16]


def _stub_factors(project: Project) -> list[dict[str, Any]]:
    """Deterministic fallback that produces at least one factor per category.
    Uses the seed `policy_dependencies` and a basic per-supplier breakdown.
    """
    factors: list[dict[str, Any]] = []
    capex = project.capex_usd

    # Policy: one factor per dependency, capped at 3
    for i, dep in enumerate(project.policy_dependencies[:3]):
        factors.append({
            "category": "policy",
            "title": dep.split("—")[0].strip()[:60],
            "description": f"Adverse change to {dep} would impact the project's IRR.",
            "citation": dep,
            "source": "congress" if "§" in dep or "IRC" in dep or "USC" in dep else "federal_register",
            "dollar_impact_usd": capex * (0.10 - i * 0.025),
            "probability": 0.30 - i * 0.05,
            "status": "active",
            "keywords": [w.strip() for w in re.split(r"[—\-,]", dep)[:3]],
        })

    # Trade: one factor per foreign supplier (capped at 3)
    foreign = [s for s in project.key_suppliers if s.country not in ("USA", "United States")]
    for i, s in enumerate(foreign[:3]):
        factors.append({
            "category": "trade",
            "title": f"{s.country} {s.component_type} tariff escalation",
            "description": (
                f"Section 301 / 232 escalation on {s.component_type} from {s.country} would "
                f"raise landed cost on {s.share_of_supply*100:.0f}% of this project's supply."
            ),
            "citation": f"Supplier: {s.name}",
            "source": "ustr",
            "dollar_impact_usd": capex * 0.05 * s.share_of_supply,
            "probability": 0.30 + (0.15 if s.country == "China" else 0.0),
            "status": "active",
            "keywords": [s.country, s.component_type, "tariff", "Section 301"],
        })

    # Geopolitical: one factor if there is significant foreign concentration
    if foreign:
        top = max(foreign, key=lambda s: s.share_of_supply)
        factors.append({
            "category": "geopolitical",
            "title": f"Supply concentration in {top.country}",
            "description": (
                f"Heavy reliance on {top.country} for {top.component_type} exposes the "
                f"project to export controls, sanctions, or supply disruption."
            ),
            "citation": f"{top.name} — {top.country}",
            "source": "internal",
            "dollar_impact_usd": capex * 0.04 * top.share_of_supply,
            "probability": 0.25,
            "status": "watching",
            "keywords": [top.country, "export control", "sanctions", "supply chain"],
        })

    # Macro: always present
    factors.append({
        "category": "macro",
        "title": "Rate / curve sensitivity on pre-FNTP capex",
        "description": (
            f"A 100 bps move in the long curve would compress equity IRR materially given "
            f"{project.cod_quarter} COD and ${project.capex_usd/1e6:,.0f}M capex."
        ),
        "citation": "Internal IRR model",
        "source": "internal",
        "dollar_impact_usd": project.capex_usd * 0.05,
        "probability": 0.40,
        "status": "watching",
        "keywords": ["interest rates", "10Y treasury", "discount rate"],
    })
    return factors


def _extract_factors(text: str) -> list[dict[str, Any]]:
    """Robust JSON extraction. Tries: whole-text parse, fenced-code parse, then
    per-object scanning so a truncated tail doesn't kill the whole response."""
    # First, try to find the outermost JSON object.
    candidates: list[str] = []
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        candidates.append(m.group(0))
    # Also try a fenced-code block.
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if m:
        candidates.append(m.group(1))

    for candidate in candidates:
        try:
            data = json.loads(candidate)
            f = data.get("factors") if isinstance(data, dict) else None
            if f:
                return f
        except json.JSONDecodeError:
            pass

    # Fallback: scan for complete `{ ... }` factor objects with brace-matching.
    factors: list[dict[str, Any]] = []
    depth = 0
    start = -1
    in_str = False
    esc = False
    for i, c in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            if depth == 0:
                start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                fragment = text[start:i + 1]
                try:
                    obj = json.loads(fragment)
                    # We want factor objects, not the outer wrapper.
                    if isinstance(obj, dict) and "category" in obj and "title" in obj:
                        factors.append(obj)
                except json.JSONDecodeError:
                    pass
                start = -1
    return factors


def _claude_factors(project: Project) -> list[dict[str, Any]] | None:
    """Call Claude. Returns None on any failure."""
    if not settings.anthropic_api_key:
        return None
    try:
        from anthropic import Anthropic
    except ImportError:
        log.warning("anthropic SDK not installed — falling back to stub mapper")
        return None
    try:
        client = Anthropic(api_key=settings.anthropic_api_key)
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=[{
                "type": "text",
                "text": SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{
                "role": "user",
                "content": _project_payload(project),
            }],
        )
        text = "".join(b.text for b in msg.content if hasattr(b, "text"))
        factors = _extract_factors(text)
        if not factors:
            log.warning("Claude returned no parseable factors for %s; stop=%s",
                        project.id, msg.stop_reason)
            return None
        return factors
    except Exception as e:
        log.warning("Claude mapping for %s failed: %s — using stub", project.id, e)
        return None


def map_project(project: Project) -> list[RiskFactor]:
    cache_key = {"id": project.id, "seed": _seed_hash(project), "model": settings.anthropic_model}
    cached = _cache.read("mapping", cache_key, MAPPING_TTL)
    if cached is None:
        raw = _claude_factors(project)
        used_claude = raw is not None
        if raw is None:
            raw = _stub_factors(project)
        cached = {"factors": raw, "used_claude": used_claude}
        _cache.write("mapping", cache_key, cached)

    raw_factors = cached.get("factors") if isinstance(cached, dict) else cached
    factors: list[RiskFactor] = []
    for i, f in enumerate(raw_factors or []):
        cat = str(f.get("category", "policy")).lower()
        if cat not in {"policy", "trade", "geopolitical", "macro"}:
            cat = "policy"
        try:
            factor = RiskFactor(
                id=f"{project.id}__f{i:02d}",
                project_id=project.id,
                category=cat,  # type: ignore[arg-type]
                title=str(f.get("title", "Untitled risk"))[:120],
                description=str(f.get("description", ""))[:600],
                source=str(f.get("source", "internal")),  # type: ignore[arg-type]
                citation=str(f.get("citation", ""))[:200],
                dollar_impact_usd=float(f.get("dollar_impact_usd") or 0.0),
                probability=max(0.0, min(1.0, float(f.get("probability") or 0.0))),
                status=str(f.get("status", "active")),
                keywords=[str(k) for k in (f.get("keywords") or [])][:8],
            )
        except Exception as e:
            log.warning("Skipping malformed factor for %s: %s", project.id, e)
            continue
        factors.append(factor)
    return factors


def map_all(projects: list[Project]) -> list[RiskFactor]:
    out: list[RiskFactor] = []
    for p in projects:
        out.extend(map_project(p))
    return out
