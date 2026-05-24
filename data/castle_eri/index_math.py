"""Risk Index sub-score math.

Pure functions over `Project` and a list of `RiskFactor`. Composite uses
the documented weights (35/25/25/15). All sub-scores are clamped 0–100.
"""
from __future__ import annotations
import math
import re
from typing import Iterable

from .models import IndexScore, Project, RiskFactor, SubScore

WEIGHTS: dict[str, float] = {
    "policy": 0.35,
    "trade": 0.25,
    "geopolitical": 0.25,
    "macro": 0.15,
}

# Static country risk index (0–1, higher = more risk).
# Composite of supply-chain dependency, geopolitical tension, and trade-policy volatility.
COUNTRY_RISK: dict[str, float] = {
    "China": 0.85,
    "Russia": 0.95,
    "Iran": 0.92,
    "Taiwan": 0.65,
    "South Korea": 0.40,
    "Vietnam": 0.55,
    "Cambodia": 0.65,
    "Malaysia": 0.45,
    "Thailand": 0.45,
    "Mexico": 0.35,
    "Canada": 0.20,
    "Denmark": 0.15,
    "Germany": 0.20,
    "Norway": 0.15,
    "Switzerland": 0.10,
    "Italy": 0.25,
    "Spain": 0.25,
    "France": 0.20,
    "USA": 0.10,
    "United States": 0.10,
}


def _clip(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _curve(ratio: float, soft_cap: float = 0.25) -> float:
    """Maps a [0, ∞) loss ratio to [0, 100] with diminishing returns past `soft_cap`."""
    if ratio <= 0:
        return 0.0
    # 100 × (1 − e^(−ratio / soft_cap)) — at ratio=soft_cap, ~63; at 3×soft_cap, ~95
    return _clip(100.0 * (1.0 - math.exp(-ratio / soft_cap)))


def policy_sub_score(project: Project, factors: Iterable[RiskFactor]) -> tuple[float, list[str]]:
    expected_loss = 0.0
    drivers: list[str] = []
    for f in factors:
        if f.category != "policy":
            continue
        contribution = f.dollar_impact_usd * f.probability
        expected_loss += contribution
        drivers.append(
            f"{f.title} · ${f.dollar_impact_usd/1e6:.0f}M × {f.probability*100:.0f}%"
        )
    score = _curve(expected_loss / max(project.capex_usd, 1.0), soft_cap=0.20)
    return _clip(score), drivers[:4]


def trade_sub_score(project: Project, factors: Iterable[RiskFactor]) -> tuple[float, list[str]]:
    expected_loss = 0.0
    drivers: list[str] = []
    for f in factors:
        if f.category != "trade":
            continue
        contribution = f.dollar_impact_usd * f.probability
        expected_loss += contribution
        drivers.append(
            f"{f.title} · ${f.dollar_impact_usd/1e6:.0f}M × {f.probability*100:.0f}%"
        )
    score = _curve(expected_loss / max(project.capex_usd, 1.0), soft_cap=0.15)
    return _clip(score), drivers[:4]


def _supplier_shares_by_country(project: Project) -> dict[str, float]:
    by_country: dict[str, float] = {}
    for s in project.key_suppliers:
        by_country[s.country] = by_country.get(s.country, 0.0) + s.share_of_supply
    total = sum(by_country.values()) or 1.0
    return {c: v / total for c, v in by_country.items()}


def geo_sub_score(project: Project, factors: Iterable[RiskFactor]) -> tuple[float, list[str]]:
    shares = _supplier_shares_by_country(project)
    hhi = sum(s * s for s in shares.values())
    weighted = sum(shares.get(c, 0.0) * COUNTRY_RISK.get(c, 0.30) for c in shares)
    # Concentration penalty: 0.5 base + up to 0.5 from HHI
    raw = 100.0 * weighted * (0.5 + 0.5 * hhi)

    # Factor in geopolitical-category factors from the mapper
    factor_pressure = 0.0
    factor_drivers: list[str] = []
    for f in factors:
        if f.category != "geopolitical":
            continue
        factor_pressure += f.probability * 10.0
        factor_drivers.append(f"{f.title} · {f.probability*100:.0f}%")
    raw += factor_pressure

    drivers = [
        f"Supply HHI {hhi:.2f} · weighted country risk {weighted:.2f}",
    ]
    top = sorted(shares.items(), key=lambda kv: -kv[1])[:3]
    drivers.append(
        "Top countries: " + ", ".join(f"{c} {p*100:.0f}%" for c, p in top)
    )
    drivers.extend(factor_drivers[:2])
    return _clip(raw), drivers[:4]


def _years_to_cod(cod_quarter: str) -> float:
    """Crude — extracts the year from a 'Qx YYYY' or 'YYYY' style string."""
    m = re.search(r"(20\d{2})", cod_quarter)
    if not m:
        return 1.5
    year = int(m.group(1))
    return max(0.0, year - 2026.0 + 0.5)  # treat "today" as mid-2026 per session date


def macro_sub_score(project: Project, factors: Iterable[RiskFactor]) -> tuple[float, list[str]]:
    # Lower target IRR = thinner cushion against rate moves.
    cushion = max(0.0, project.equity_irr_target - 0.06)  # 600 bps risk-free floor
    base = 100.0 * (1.0 - min(cushion / 0.10, 1.0))  # IRR target ≥ 16% → no macro risk

    # Time-to-COD factor: long-dated projects more exposed to curve moves.
    yrs = _years_to_cod(project.cod_quarter)
    time_factor = _clip(0.3 + 0.2 * yrs, 0.3, 1.2)

    raw = base * time_factor

    # Add any macro-category factors from the mapper
    factor_drivers: list[str] = []
    for f in factors:
        if f.category != "macro":
            continue
        raw += f.dollar_impact_usd / max(project.capex_usd, 1.0) * f.probability * 100.0
        factor_drivers.append(f"{f.title} · {f.probability*100:.0f}%")

    drivers = [
        f"Target equity IRR {project.equity_irr_target*100:.1f}% — cushion {cushion*100:.1f}pp",
        f"~{yrs:.1f} years to COD",
    ]
    drivers.extend(factor_drivers[:2])
    return _clip(raw), drivers[:4]


def compute(project: Project, factors: list[RiskFactor]) -> IndexScore:
    policy_v, policy_d = policy_sub_score(project, factors)
    trade_v, trade_d = trade_sub_score(project, factors)
    geo_v, geo_d = geo_sub_score(project, factors)
    macro_v, macro_d = macro_sub_score(project, factors)

    subs = [
        SubScore(category="policy", value=policy_v, weight=WEIGHTS["policy"],
                 contribution=policy_v * WEIGHTS["policy"], drivers=policy_d),
        SubScore(category="trade", value=trade_v, weight=WEIGHTS["trade"],
                 contribution=trade_v * WEIGHTS["trade"], drivers=trade_d),
        SubScore(category="geopolitical", value=geo_v, weight=WEIGHTS["geopolitical"],
                 contribution=geo_v * WEIGHTS["geopolitical"], drivers=geo_d),
        SubScore(category="macro", value=macro_v, weight=WEIGHTS["macro"],
                 contribution=macro_v * WEIGHTS["macro"], drivers=macro_d),
    ]
    composite = int(round(sum(s.contribution for s in subs)))
    return IndexScore(
        project_id=project.id,
        composite=composite,
        sub_scores=subs,
        factor_ids=[f.id for f in factors if f.project_id == project.id],
    )
