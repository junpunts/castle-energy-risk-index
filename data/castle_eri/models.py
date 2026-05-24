from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field

Category = Literal["policy", "trade", "geopolitical", "macro"]
Source = Literal["congress", "federal_register", "kalshi", "ustr", "internal"]


class Supplier(BaseModel):
    name: str
    country: str
    component_type: str
    share_of_supply: float = 1.0


class Project(BaseModel):
    id: str
    name: str
    technology: str
    capacity_mw: float
    capacity_label: str
    location: str
    cod_quarter: str
    capex_usd: float
    equity_irr_target: float
    key_suppliers: list[Supplier]
    offtake_status: str
    policy_dependencies: list[str]
    narrative: str
    keyword_seeds: list[str]


class RiskFactor(BaseModel):
    """A specific exposure tied to a project (one row of the exposure table)."""
    id: str
    project_id: str
    category: Category
    title: str
    description: str
    source: Source
    citation: str = ""
    dollar_impact_usd: float = 0.0
    probability: float = 0.0
    status: str = "active"
    keywords: list[str] = Field(default_factory=list)
    # Filled in post-Claude by refresh.py
    our_view: str = ""                       # 1-sentence analyst take
    attention_weekly: list[int] = Field(default_factory=list)   # last 12 weeks of mention counts
    attention_score: int = 0                 # 0–100 normalized
    likelihood_bucket: Literal["low", "medium", "high"] = "medium"


class PolicyItem(BaseModel):
    """A Congress.gov bill or Federal Register notice."""
    id: str
    source: Source
    title: str
    summary: str = ""
    latest_action: str = ""
    latest_action_date: str = ""
    url: str = ""
    sponsors_d: int = 0
    sponsors_r: int = 0
    cosponsors_d: int = 0
    cosponsors_r: int = 0
    agency: str = ""
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    affected_project_ids: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class MarketContract(BaseModel):
    """A Kalshi market we may use as a hedge."""
    id: str
    platform: str = "kalshi"
    ticker: str = ""
    event_title: str
    title: str
    yes_price: float
    volume_usd: float = 0.0
    expiry_date: str = ""
    url: str = ""
    keywords: list[str] = Field(default_factory=list)


class HedgeSuggestion(BaseModel):
    """A market mapped to a project exposure, with sized notional."""
    project_id: str
    factor_id: str
    market_id: str
    relevance: float
    notional_usd: float
    rationale: str = ""


class SubScore(BaseModel):
    category: Category
    value: float
    weight: float
    contribution: float
    drivers: list[str] = Field(default_factory=list)


class IndexScore(BaseModel):
    project_id: str
    composite: int
    sub_scores: list[SubScore]
    factor_ids: list[str] = Field(default_factory=list)


class Methodology(BaseModel):
    weights: dict[str, float]
    version: str = "v0.1"
    generated_at: str = ""


class Bundle(BaseModel):
    """Everything we ship to public/data/index.json."""
    methodology: Methodology
    projects: list[Project]
    factors: list[RiskFactor]
    hedges: list[HedgeSuggestion]
    scores: list[IndexScore]
