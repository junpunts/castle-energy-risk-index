"""The 5 seed projects. Hand-curated archetypes — do not invent additions."""
from __future__ import annotations
from .models import Project, Supplier


PROJECTS: list[Project] = [
    Project(
        id="lone-star-solar-i",
        name="Lone Star Solar I",
        technology="Utility-scale PV",
        capacity_mw=500,
        capacity_label="500 MW",
        location="West Texas",
        cod_quarter="Q2 2027",
        capex_usd=600_000_000,
        equity_irr_target=0.10,
        key_suppliers=[
            Supplier(name="Jinko Solar", country="China", component_type="PV modules", share_of_supply=0.55),
            Supplier(name="JA Solar (Malaysia)", country="Malaysia", component_type="PV modules", share_of_supply=0.25),
            Supplier(name="First Solar", country="USA", component_type="PV modules", share_of_supply=0.20),
            Supplier(name="Sungrow", country="China", component_type="Inverters", share_of_supply=0.60),
        ],
        offtake_status="PPA signed (Meta), 80% contracted at $34/MWh",
        policy_dependencies=[
            "IRC §48E ITC (technology-neutral)",
            "Section 301 — Chinese polysilicon (HTS 3818)",
            "UFLPA detention orders — CBP",
            "AD/CVD — Southeast Asia crystalline silicon",
            "ERCOT interconnection queue (GIS reform)",
        ],
        narrative=(
            "Lone Star Solar I is a 500 MW single-axis-tracker PV plant in Pecos County, "
            "Texas, anchored by a 15-year corporate PPA with Meta. The project relies on "
            "Tier-1 Chinese and Southeast-Asian module supply, leaving it materially exposed "
            "to Section 301 escalation and UFLPA-driven CBP detentions, while its returns "
            "hinge on the durability of the §48E ITC and ERCOT interconnection timing."
        ),
        keyword_seeds=[
            "Section 48E ITC", "IRA repeal solar", "Section 301 solar",
            "polysilicon UFLPA", "ERCOT interconnection", "AD CVD solar Cambodia",
            "Buy America domestic content", "Treasury 48E guidance", "solar tracker tariff",
            "Vietnam solar tariff", "Inflation Reduction Act amendment",
        ],
    ),
    Project(
        id="vineyard-wind-ii",
        name="Vineyard Wind Phase II",
        technology="Fixed-bottom offshore wind",
        capacity_mw=800,
        capacity_label="800 MW",
        location="Massachusetts coast (BOEM Lease OCS-A 0501)",
        cod_quarter="Q4 2028",
        capex_usd=4_200_000_000,
        equity_irr_target=0.085,
        key_suppliers=[
            Supplier(name="Siemens Gamesa", country="Denmark", component_type="14 MW turbines", share_of_supply=1.0),
            Supplier(name="POSCO", country="South Korea", component_type="Monopile steel", share_of_supply=0.65),
            Supplier(name="EEW SPC (Vietnam)", country="Vietnam", component_type="Monopile fabrication", share_of_supply=0.35),
            Supplier(name="Dominion Energy (Charybdis)", country="USA", component_type="Jones Act WTIV", share_of_supply=1.0),
            Supplier(name="Prysmian", country="Italy", component_type="HV export cable", share_of_supply=1.0),
        ],
        offtake_status="OREC contracts with Massachusetts (3-state RFP), price under review",
        policy_dependencies=[
            "IRC §45Y PTC + §48E ITC (offshore-wind bonus)",
            "BOEM Construction & Operations Plan approval",
            "Section 232 — Korean steel plate (HTS 7208)",
            "Merchant Marine Act of 1920 (Jones Act) — installation vessels",
            "Treasury §45Y domestic-content adder rules",
            "EO on offshore-wind leasing — review and pause",
        ],
        narrative=(
            "Vineyard Wind Phase II is an 800 MW fixed-bottom offshore wind project on the "
            "BOEM OCS-A 0501 lease. Capital-intensity is dominated by Siemens Gamesa 14 MW "
            "turbines and POSCO-supplied monopile steel, both of which sit in trade-action "
            "crosshairs. The schedule is at the mercy of BOEM permitting and Jones Act "
            "vessel availability, and the project's IRR hinges on the OREC re-pricing and "
            "the §45Y PTC remaining intact through 2028."
        ),
        keyword_seeds=[
            "offshore wind moratorium", "BOEM permitting reform", "Section 232 steel",
            "Jones Act offshore wind", "Section 45Y PTC", "Korean steel plate tariff",
            "Vineyard Wind", "offshore wind executive order", "Treasury 45Y domestic content",
            "OCS-A lease", "monopile fabrication tariff",
        ],
    ),
    Project(
        id="mojave-bess",
        name="Mojave Battery Storage Hub",
        technology="Li-ion BESS (LFP)",
        capacity_mw=250,
        capacity_label="250 MW / 1 GWh",
        location="San Bernardino County, CA",
        cod_quarter="Q1 2026",
        capex_usd=400_000_000,
        equity_irr_target=0.12,
        key_suppliers=[
            Supplier(name="CATL", country="China", component_type="LFP cells", share_of_supply=0.55),
            Supplier(name="BYD", country="China", component_type="LFP cells", share_of_supply=0.25),
            Supplier(name="LG Energy Solution (Michigan)", country="USA", component_type="LFP cells", share_of_supply=0.20),
            Supplier(name="Sungrow", country="China", component_type="PCS / inverters", share_of_supply=0.50),
            Supplier(name="Tesla Megapack", country="USA", component_type="Integration", share_of_supply=0.40),
        ],
        offtake_status="Resource adequacy contract with SCE (10-yr, $7.50/kW-mo)",
        policy_dependencies=[
            "IRC §45X advanced-manufacturing PTC (cells, modules)",
            "IRC §48E ITC standalone storage",
            "Section 301 — Chinese lithium-ion batteries (HTS 8507.60)",
            "FERC Order 2222 — DER aggregation",
            "California Resource Adequacy framework",
        ],
        narrative=(
            "Mojave Battery Storage Hub is a 250 MW / 1 GWh standalone LFP BESS contracted "
            "for resource-adequacy in CAISO. With Chinese-cell content above 80%, the "
            "project's economics are squarely exposed to Section 301 escalation on HTS "
            "8507.60 (current 25% → proposed 25-50%), and its tax equity hinges on §48E "
            "remaining technology-neutral and §45X manufacturing credits flowing to its "
            "domestic cell partner."
        ),
        keyword_seeds=[
            "Section 301 lithium battery", "battery storage tariff", "Section 45X manufacturing",
            "FERC Order 2222", "CATL tariff", "LFP cell import", "Section 48E storage",
            "FEOC restriction battery", "CAISO resource adequacy", "Treasury 45X guidance",
            "battery component tariff",
        ],
    ),
    Project(
        id="permian-h2-hub",
        name="Permian Hydrogen Hub",
        technology="Electrolytic H₂ + co-located solar",
        capacity_mw=200,
        capacity_label="200 MW electrolyzer",
        location="Reeves County, TX",
        cod_quarter="Q3 2029",
        capex_usd=1_200_000_000,
        equity_irr_target=0.11,
        key_suppliers=[
            Supplier(name="Plug Power", country="USA", component_type="PEM electrolyzer", share_of_supply=0.50),
            Supplier(name="Cummins (Accelera)", country="USA", component_type="PEM electrolyzer", share_of_supply=0.30),
            Supplier(name="Nel Hydrogen", country="Norway", component_type="Alkaline electrolyzer", share_of_supply=0.20),
            Supplier(name="Air Products", country="USA", component_type="Compression / liquefaction", share_of_supply=1.0),
        ],
        offtake_status="Letter of intent with ExxonMobil for ammonia feedstock; no firm offtake",
        policy_dependencies=[
            "IRC §45V production tax credit (Treasury three-pillars rule)",
            "DOE H2Hubs program funding (selected H2Hubs round 1)",
            "EPA Subpart 98 hydrogen reporting",
            "ERCOT interconnection — large load study",
        ],
        narrative=(
            "Permian Hydrogen Hub is a 200 MW PEM electrolyzer co-located with new utility "
            "PV and 24/7 PPAs, structured to qualify for the top $3/kg §45V tier under "
            "Treasury's three-pillars rule. With no firm offtake yet and most of the IRR "
            "tied to the §45V structure, the project is exposed to any Treasury softening "
            "of incrementality / hourly-matching requirements and to slippage in the H2Hubs "
            "milestone payments."
        ),
        keyword_seeds=[
            "Section 45V hydrogen", "Treasury 45V three pillars", "DOE H2Hubs",
            "hourly matching hydrogen", "incrementality hydrogen", "green hydrogen tax credit",
            "Plug Power electrolyzer", "EPA Subpart 98 hydrogen", "blue hydrogen",
            "hydrogen production credit", "H2Hubs milestone",
        ],
    ),
    Project(
        id="i95-evcharging",
        name="I-95 EV Charging Network",
        technology="DC fast charging (150–350 kW)",
        capacity_mw=120,
        capacity_label="1,200 stations · ~120 MW peak",
        location="I-95 corridor (ME → FL)",
        cod_quarter="Rolling 2025–2027",
        capex_usd=300_000_000,
        equity_irr_target=0.13,
        key_suppliers=[
            Supplier(name="ABB Terra", country="Switzerland", component_type="DC fast chargers", share_of_supply=0.40),
            Supplier(name="ChargePoint", country="USA", component_type="DC fast chargers", share_of_supply=0.35),
            Supplier(name="Wallbox / Hypercharger", country="Spain", component_type="DC fast chargers", share_of_supply=0.25),
            Supplier(name="Eaton", country="USA", component_type="Switchgear", share_of_supply=1.0),
        ],
        offtake_status="State NEVI awards across 8 states; site host revenue share",
        policy_dependencies=[
            "23 USC 175 — NEVI Formula Program",
            "IRC §30C alt-fuel refueling property credit",
            "IRC §45W commercial clean vehicle credit",
            "Buy America Build America (BABA) — FHWA waivers",
            "FHWA minimum standards 23 CFR 680",
        ],
        narrative=(
            "I-95 EV Charging Network is a 1,200-site DC fast-charging rollout funded "
            "through NEVI state awards across 8 states, with site economics layered on "
            "host revenue share. The project's risk profile is dominated by federal "
            "policy continuity — NEVI obligations, §30C refueling credit, and BABA "
            "domestic-content waivers — and is comparatively light on macro and trade "
            "exposure relative to the generation projects in the portfolio."
        ),
        keyword_seeds=[
            "NEVI program", "EV charging tax credit", "Section 30C", "Build America Buy America",
            "FHWA EV charging", "Section 45W commercial EV", "domestic content EV charger",
            "BABA waiver", "EV charging executive order", "NEVI rescission",
            "alternative fuel vehicle infrastructure",
        ],
    ),
]


def get(id_: str) -> Project | None:
    for p in PROJECTS:
        if p.id == id_:
            return p
    return None
