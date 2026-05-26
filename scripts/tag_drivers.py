#!/usr/bin/env python3
"""
Tag each risk with a scenario `driver` so the what-if model knows how its
impact responds to deal-input changes.

Drivers:
  cost    — capex-denominated shock; $ scales with capex, IRR ~size-invariant
  delay   — schedule shock; IRR drag scales with cost-of-capital × COD timeline
  revenue — offtake/merchant shock; scales with capacity × PPA
"""
import json

DRIVERS = {
    # ── utility-solar ──
    "us1": "cost",     # AD/CVD Solar IV orders — module cost shock
    "us2": "cost",     # Chinese panel tariffs — module cost shock
    "us3": "cost",     # 48E/45Y FEOC guidance delay — credit value = capex-denominated cost
    "us4": "delay",    # UFLPA detentions — schedule/COD slip
    "us5": "delay",    # Interconnection queue >2yr — schedule slip
    "us6": "revenue",  # ERCOT curtailment — merchant revenue erosion
    "us7": "cost",     # LONGi PFE designation — re-sourcing cost shock

    # ── natural-gas ──
    "ng1": "revenue",  # LNG export auths stall — demand/offtake thesis (revenue base)
    "ng2": "delay",    # CP2 remand — terminal/pipeline schedule freeze
    "ng3": "delay",    # FERC pipeline >18mo — schedule slip
    "ng4": "revenue",  # Henry Hub spike — spark-spread / margin (revenue)
    "ng5": "delay",    # EPA turbine rule — permitting schedule slip
    "ng6": "revenue",  # PJM capacity / data-center demand — capacity revenue
    "ng7": "delay",    # NEPA cat-ex injunction — re-imposed review schedule

    # ── offshore-wind ──
    "ow1": "delay",    # BOEM COP freeze — approval schedule
    "ow2": "delay",    # Mid-construction stop-work — schedule
    "ow3": "cost",     # Section 232 steel on monopile — cost shock
    "ow4": "delay",    # Jones Act WTIV availability — vessel/schedule
    "ow5": "cost",     # 45Y/48E narrowing — credit value = capex-denominated cost
    "ow6": "cost",     # FEOC domestic-content disqualification — cost/credit
    "ow7": "delay",    # NEPA/ESA right-whale — permitting schedule
    "ow8": "delay",    # OCS clean-air EAB remand — permitting schedule
    "ow9": "revenue",  # OREC pricing re-opener — offtake revenue
}

for fname in ["utility-solar", "natural-gas", "offshore-wind"]:
    path = f"public/data/{fname}.json"
    b = json.load(open(path))
    n = 0
    for r in b["risks"]:
        if r["id"] in DRIVERS:
            r["driver"] = DRIVERS[r["id"]]
            n += 1
    json.dump(b, open(path, "w"), indent=2)
    print(f"{fname}: tagged {n}/{len(b['risks'])} risks")

# Report the assignment for review
from collections import Counter
c = Counter(DRIVERS.values())
print("\ndriver distribution:", dict(c))
