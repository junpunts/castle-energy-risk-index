from castle_eri import index_math
from castle_eri.models import Project, RiskFactor, Supplier


def _project(**overrides) -> Project:
    base = dict(
        id="test-proj",
        name="Test Project",
        technology="Solar",
        capacity_mw=100,
        capacity_label="100 MW",
        location="Texas",
        cod_quarter="Q4 2028",
        capex_usd=100_000_000,
        equity_irr_target=0.10,
        key_suppliers=[
            Supplier(name="A", country="China", component_type="Module", share_of_supply=0.7),
            Supplier(name="B", country="USA", component_type="Inverter", share_of_supply=0.3),
        ],
        offtake_status="PPA",
        policy_dependencies=["IRC §48E"],
        narrative="x",
        keyword_seeds=["48E"],
    )
    base.update(overrides)
    return Project(**base)


def _factor(category, **overrides) -> RiskFactor:
    base = dict(
        id="f1",
        project_id="test-proj",
        category=category,
        title="t",
        description="d",
        source="internal",
        dollar_impact_usd=10_000_000,
        probability=0.5,
        keywords=["48E", "solar"],
    )
    base.update(overrides)
    return RiskFactor(**base)


def test_weights_sum_to_one():
    assert sum(index_math.WEIGHTS.values()) == 1.0


def test_no_factors_yields_low_composite():
    p = _project()
    score = index_math.compute(p, [])
    # Geo + macro have non-factor inputs, so composite is non-zero; but should be below 50
    assert 0 <= score.composite <= 50


def test_more_factors_means_higher_score():
    p = _project()
    light = index_math.compute(p, [_factor("policy", probability=0.1, dollar_impact_usd=1_000_000)])
    heavy = index_math.compute(p, [
        _factor("policy", id="f1", probability=0.6, dollar_impact_usd=20_000_000),
        _factor("policy", id="f2", probability=0.5, dollar_impact_usd=10_000_000),
        _factor("trade",  id="f3", probability=0.5, dollar_impact_usd=15_000_000),
    ])
    assert heavy.composite > light.composite


def test_chinese_supply_dominates_geo_score():
    chinese = index_math.compute(_project(), [])
    safe = _project(key_suppliers=[
        Supplier(name="A", country="USA", component_type="Module", share_of_supply=0.7),
        Supplier(name="B", country="USA", component_type="Inverter", share_of_supply=0.3),
    ])
    safe_score = index_math.compute(safe, [])
    geo_chinese = next(s for s in chinese.sub_scores if s.category == "geopolitical").value
    geo_safe = next(s for s in safe_score.sub_scores if s.category == "geopolitical").value
    assert geo_chinese > geo_safe


def test_composite_matches_weighted_sum_of_subs():
    p = _project()
    score = index_math.compute(p, [_factor("trade", probability=0.4, dollar_impact_usd=5_000_000)])
    weighted = sum(s.value * s.weight for s in score.sub_scores)
    assert abs(score.composite - round(weighted)) <= 1


def test_keyword_smoke_test_removes_factor_drops_policy_subscore():
    """BUILD.md verification step 5 in unit-test form."""
    p = _project()
    with_factors = index_math.compute(p, [
        _factor("policy", id="p1", probability=0.5, dollar_impact_usd=30_000_000),
        _factor("policy", id="p2", probability=0.4, dollar_impact_usd=20_000_000),
    ])
    without = index_math.compute(p, [])
    p_with = next(s for s in with_factors.sub_scores if s.category == "policy").value
    p_without = next(s for s in without.sub_scores if s.category == "policy").value
    assert p_with > p_without
