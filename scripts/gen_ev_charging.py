#!/usr/bin/env python3
"""Generate ev-charging.json archetype bundle (M10 expansion #6).
DC fast charging network, NEVI-backed. Hedges reference REAL verified
synthetic_contract_library slugs + live prices."""
import json

AS_OF = "2026-05-28"
NOW_ISO = "2026-05-28T16:00:00+00:00"
MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

def exp(d):
    if not d: return "TBD"
    y, m, _ = d.split("-"); return f"{MONTHS[int(m)-1]} {y}"

def hedge(t, title, yes, e, n):
    return {"ticker": t, "title": title, "yes": yes, "change": 0.0, "expiry": exp(e), "notional": n}

def weekly(b, p):
    """Synthetic 12-week ramp for the seed; the cron's compute_attention
    stage overwrites this with real news-mention counts on first run."""
    return [int(b + (p - b) * i / 11) for i in range(12)]

def composite(risks, tir):
    drag = sum(r["probability"] * abs(r["impact_irr"]) for r in risks)
    return max(0, min(100, round((drag / max(0.001, tir * 100 * len(risks))) * 509)))

meta = {
    "id": "ev-charging",
    "name": "EV Charging",
    "eyebrow": "DC fast charging · NEVI-backed · 1,200-station network",
    "blurb": "Multi-state DC fast-charging network deployed under the NEVI Formula Program. The economics are layered: NEVI funds ~30-50% of site capex, §30C covers up to 30% of refueling property, §45W underwrites the commercial-fleet demand floor, and BABA dictates which chargers you can install. With OBBBA terminating two of the three credits, the archetype is exposed primarily to federal-policy continuity rather than market or trade risk.",
    "typical": {
        "capacity": "1,200 stations · ~120 MW peak",
        "capex": 300000000.0,
        "capex_per_gw": 2500000000.0,
        "target_irr": 0.13,
        "cod_months": 30,
        "ppa_price": None,
    },
}
TIR = 0.13

risks = [
    {"id": "ev1", "category": "policy",      "title": "§30C refueling credit terminated",
     "citation": "IRC §30C · OBBBA H.R.1 §70504",
     "impact_irr": -2.5, "impact_usd": 60000000.0, "probability": 0.99, "attention": 85,
     "likelihood": "high", "headline_change": "+10", "driver": "cost",
     "status": "realized", "realized_date": "2025-10-01",
     "primary_hedge_ticker": "will-obbba-section-30c-alternative-fuel-vehicle-refueling-property-credit-termin"},
    {"id": "ev2", "category": "policy",      "title": "§45W commercial EV credit terminated",
     "citation": "IRC §45W · P.L. 119-21 §70502",
     "impact_irr": -2.0, "impact_usd": 36000000.0, "probability": 0.99, "attention": 82,
     "likelihood": "high", "headline_change": "+13", "driver": "revenue",
     "status": "realized", "realized_date": "2025-10-01",
     "primary_hedge_ticker": "will-the-section-45w-qualified-commercial-clean-vehicle-credit-terminated-for-ve"},
    {"id": "ev3", "category": "operational", "title": "BABA 55% domestic content binds",
     "citation": "BABA 2 USC 8302 · FHWA-2024-0001 · 23 CFR 635",
     "impact_irr": -1.6, "impact_usd": 24000000.0, "probability": 0.72, "attention": 74,
     "likelihood": "high", "headline_change": "+6", "driver": "cost",
     "primary_hedge_ticker": "will-fhwa-s-build-america-buy-america-55-u-s-component-cost-requirement-for-manu"},
    {"id": "ev4", "category": "policy",      "title": "NEVI program redirected or defunded",
     "citation": "23 USC 175 · NEVI · FHWA Q3 2025 guidance",
     "impact_irr": -2.4, "impact_usd": 90000000.0, "probability": 0.52, "attention": 88,
     "likelihood": "medium", "headline_change": "+12", "driver": "cost",
     "primary_hedge_ticker": "will-fhwa-formally-approve-a-state-s-fy2026-nevi-alternative-use-spending-plan-r"},
    {"id": "ev5", "category": "trade",       "title": "Section 232 grid-equipment tariffs",
     "citation": "Section 232 · BIS-2020-0015 · HTS 8504",
     "impact_irr": -0.9, "impact_usd": 14000000.0, "probability": 0.25, "attention": 52,
     "likelihood": "low", "headline_change": "+3", "driver": "cost",
     "primary_hedge_ticker": "will-the-15-transitional-section-232-tariff-rate-on-electrical-grid-equipment-tr"},
    {"id": "ev6", "category": "market",      "title": "State EV mandate retreat (ACC II)",
     "citation": "CAA §209(b) · ACC II · VT EO 04-25",
     "impact_irr": -1.2, "impact_usd": 18000000.0, "probability": 0.55, "attention": 58,
     "likelihood": "medium", "headline_change": "+5", "driver": "revenue",
     "primary_hedge_ticker": "will-vermont-governor-phil-scott-extend-executive-order-04-25-pausing-act-acc-ii"},
    {"id": "ev7", "category": "market",      "title": "Commercial fleet EV order decline",
     "citation": "NTEA fleet survey · Automotive Fleet annual",
     "impact_irr": -1.4, "impact_usd": 22000000.0, "probability": 0.52, "attention": 68,
     "likelihood": "medium", "headline_change": "+4", "driver": "revenue", "two_sided": True,
     "primary_hedge_ticker": "will-u-s-commercial-fleet-ev-order-volumes-as-reported-by-ntea-or-automotive-fle"},
]

details = {
    "ev1": {
        "subtitle": "Up-to-30% federal credit on refueling property — OBBBA H.R.1 §70504 targets it for termination, removing the capex-side keystone of US charging economics.",
        "tracked_since": "Jan 14, 2026", "last_updated": "2 hr ago",
        "attention_delta": 10, "probability_delta": 0.07, "hedge_cost": 7000,
        "view": "§30C is the capex-side keystone for EV charging — up to a 30% credit on refueling property, and OBBBA H.R.1 §70504 targets it for repeal by year-end 2026. Hedge the termination contract sized to your §30C exposure; the state-credit patchwork emerging in California won't replace the federal stack.",
        "weekly": weekly(60, 85),
        "events": [
            {"date": "2026-07-31", "when": "+64d", "kind": "market", "future": True, "now": False,
             "title": "Early §30C elimination resolution", "detail": "The OBBBA-provision-eliminating-§30C contract resolves; tests whether the legislative repeal sticks through the Senate vote."},
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": True,
             "title": "Year-end §30C termination status", "detail": "Whether OBBBA §70504's repeal of §30C is in force at year-end. Resolves the primary hedge contract."},
        ],
        "news": [],
        "hedges": [
            hedge("will-obbba-section-30c-alternative-fuel-vehicle-refueling-property-credit-termin",
                  "Will OBBBA §30C alternative-fuel refueling property credit termination be in force by year-end 2026?",
                  0.72, "2026-12-31", 350000),
            hedge("will-h-r-1-sec-70504-terminate-the-section-30c-alternative-fuel-refueling-proper",
                  "Will H.R.1 §70504 terminate the §30C alternative-fuel refueling property credit by Dec 2026?",
                  0.62, "2026-12-31", 280000),
            hedge("will-the-one-big-beautiful-bill-act-obbba-provision-eliminating-the-section-30c-",
                  "Will the OBBBA provision eliminating §30C be in force by Jul 31, 2026?",
                  0.62, "2026-07-31", 200000),
        ],
    },
    "ev2": {
        "subtitle": "§45W subsidises commercial EV purchases — without it, the fleet demand that anchors DC fast-charging utilization erodes through 2026-27.",
        "tracked_since": "Jan 18, 2026", "last_updated": "5 hr ago",
        "attention_delta": 13, "probability_delta": 0.09, "hedge_cost": 6000,
        "view": "§45W termination kills the fleet-side demand floor for DC fast charging — utilities and corporate fleets buy commercial EVs because the credit hits 30% of vehicle cost. With the September 2025 acquisition cutoff already in force, hedge the formal termination contract; the demand effect lags 12-18 months but it's the largest revenue-side risk in the stack.",
        "weekly": weekly(58, 82),
        "events": [
            {"date": "2025-09-30", "when": "past", "kind": "deadline", "future": False, "now": False,
             "title": "§45W vehicle acquisition cutoff", "detail": "P.L. 119-21 cut off §45W for commercial clean vehicles acquired after Sep 30, 2025."},
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": True,
             "title": "Formal §45W termination in force", "detail": "Whether §45W termination is fully in force at year-end; resolves the primary hedge."},
            {"date": "2027-02-28", "when": "+276d", "kind": "market", "future": True, "now": False,
             "title": "Commercial fleet EV order survey", "detail": "NTEA/Automotive Fleet annual reports — the demand-side proxy."},
        ],
        "news": [],
        "hedges": [
            hedge("will-the-section-45w-qualified-commercial-clean-vehicle-credit-terminated-for-ve",
                  "Will §45W commercial clean vehicle credit termination be in force by year-end 2026?",
                  0.80, "2026-12-31", 400000),
            hedge("will-congress-pass-legislation-restoring-the-section-45w-commercial-clean-vehicl",
                  "Will Congress restore §45W commercial clean vehicle credit by Jan 2027? (NO pays for the base case)",
                  0.20, "2027-01-15", 120000),
        ],
    },
    "ev3": {
        "subtitle": "FHWA's 55% domestic-component-cost rule for manufactured products applies to chargers — non-compliant hardware can't sit on federally-funded sites.",
        "tracked_since": "Feb 4, 2026", "last_updated": "8 hr ago",
        "attention_delta": 6, "probability_delta": 0.04, "hedge_cost": 4000,
        "view": "FHWA's 55% domestic-component-cost rule for chargers becomes binding through late 2026 — non-compliant hardware can't be installed at federally-funded sites. The product-specific waiver path is narrowing (the FHWA-2026-02825 EV-charger docket trends restrictive); hedge the rule-binding contract and re-source charger inventory to compliant suppliers in parallel.",
        "weekly": weekly(54, 74),
        "events": [
            {"date": "2026-10-15", "when": "+140d", "kind": "deadline", "future": True, "now": False,
             "title": "FHWA Jan-2025 final rule effective", "detail": "FHWA-2024-0001 manufactured-products final rule terminating the legacy waiver."},
            {"date": "2026-10-31", "when": "+156d", "kind": "market", "future": True, "now": True,
             "title": "BABA 55% compliance binding", "detail": "Whether the 55% U.S.-component-cost requirement is enforced; resolves the primary hedge."},
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": False,
             "title": "FHWA EV-charger Buy America waiver decision", "detail": "FHWA-2026-02825 waiver determination — direction matters for any non-compliant inventory."},
        ],
        "news": [],
        "hedges": [
            hedge("will-fhwa-s-build-america-buy-america-55-u-s-component-cost-requirement-for-manu",
                  "Will FHWA's BABA 55% U.S.-component-cost requirement for manufactured products be binding by Oct 2026?",
                  0.72, "2026-10-31", 240000),
            hedge("will-fhwa-s-january-14-2025-final-rule-docket-fhwa-2024-0001-terminating-the-man",
                  "Will FHWA's Jan-2025 final rule terminating the manufactured-products waiver be in force by Oct 2026?",
                  0.62, "2026-10-15", 180000),
            hedge("will-fhwa-s-buy-america-manufactured-products-final-rule-requiring-55-u-s-compon",
                  "Will FHWA's 55% U.S.-component-cost final rule survive through Jan 2027?",
                  0.62, "2027-01-15", 140000),
        ],
    },
    "ev4": {
        "subtitle": "NEVI funds roughly a third of site capex via the formula program — state alt-use redirection and outright defunding bracket the funding-loss tail.",
        "tracked_since": "Jan 8, 2026", "last_updated": "1 day ago",
        "attention_delta": 12, "probability_delta": 0.05, "hedge_cost": 9000,
        "view": "NEVI is the financing backbone — about a third of site capex flows through the formula program. State alt-use redirection is now the base case (FHWA's 2025 guidance opened the door, primary hedge prices it above coin-flip), and outright defunding sits in the tail. Hedge the alt-use-approval contract and the program-defunding tail as a single basket; size to your NEVI-share of capex.",
        "weekly": weekly(64, 88),
        "events": [
            {"date": "2026-09-30", "when": "+125d", "kind": "deadline", "future": True, "now": False,
             "title": "FHWA Buy America waiver determination", "detail": "Final rule or formal waiver determination resolving the BABA EV-charger question."},
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": True,
             "title": "State alt-use spending plan approval", "detail": "Whether FHWA formally approves a state's FY2026 NEVI alt-use plan, redirecting funds away from chargers."},
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": False,
             "title": "NEVI program defunding tail", "detail": "Whether Congress passes legislation repealing or defunding NEVI under 23 USC §151."},
        ],
        "news": [],
        "hedges": [
            hedge("will-fhwa-formally-approve-a-state-s-fy2026-nevi-alternative-use-spending-plan-r",
                  "Will FHWA formally approve a state's FY2026 NEVI alt-use spending plan by year-end?",
                  0.52, "2026-12-31", 380000),
            hedge("will-congress-pass-legislation-repealing-or-defunding-the-nevi-formula-program-2",
                  "Will Congress pass legislation repealing or defunding NEVI by year-end?",
                  0.28, "2026-12-31", 200000),
            hedge("will-fhwa-publish-a-final-rule-or-formal-waiver-determination-resolving-buy-amer",
                  "Will FHWA publish a final rule resolving the EV-charger Buy America question by Sep 2026?",
                  0.35, "2026-09-30", 160000),
        ],
    },
    "ev5": {
        "subtitle": "Site-level transformers and switchgear are now squarely in Section 232 territory; charger imports stack Section 301 on top.",
        "tracked_since": "Mar 4, 2026", "last_updated": "2 days ago",
        "attention_delta": 3, "probability_delta": 0.01, "hedge_cost": 2500,
        "view": "DC fast-charging sites need transformer and switchgear capacity that's now squarely in Section 232 territory — the 15% transitional rate on grid equipment is up for renewal in early 2027. Smaller share of total capex than the credit-side risks, but it stacks on top of any charger-side Section 301 escalation; hedge the rate-renewal contract if your site mix is grid-heavy.",
        "weekly": weekly(38, 52),
        "events": [
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": False,
             "title": "Section 301 power-electronics exclusions", "detail": "Whether USTR grants or renews exclusions from the 25% Section 301 List 3 tariffs for power-electronics."},
            {"date": "2027-01-15", "when": "+232d", "kind": "market", "future": True, "now": True,
             "title": "Section 232 grid-equipment rate renewal", "detail": "Whether the 15% transitional Section 232 rate on transformers and switchgear continues into 2027."},
        ],
        "news": [],
        "hedges": [
            hedge("will-the-15-transitional-section-232-tariff-rate-on-electrical-grid-equipment-tr",
                  "Will the 15% transitional Section 232 rate on grid equipment continue into 2027?",
                  0.25, "2027-01-15", 120000),
            hedge("will-ustr-grant-or-renew-product-exclusions-from-section-301-list-3-tariffs-25-f",
                  "Will USTR grant or renew Section 301 List 3 exclusions for power electronics by year-end?",
                  0.20, "2026-12-31", 80000),
        ],
    },
    "ev6": {
        "subtitle": "ACC II withdrawals in major states and the CA Section 209(b) waiver fight soften the EV demand floor that underwrites utilization assumptions.",
        "tracked_since": "Feb 19, 2026", "last_updated": "1 day ago",
        "attention_delta": 5, "probability_delta": 0.02, "hedge_cost": 3500,
        "view": "ACC II mandate retreat in big states — Vermont's EO 04-25 is the bellwether, NY/CO/OR are the swing — softens the EV demand floor that underwrites charging utilization. The fix isn't a single hedge: it's a basket across the CA Section 209(b) waiver, individual-state ACC II withdrawals, and the Vermont extension; size it to the share of network in mandate-state corridors.",
        "weekly": weekly(48, 58),
        "events": [
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": False,
             "title": "EPA CA §209(b) waiver decision", "detail": "Whether EPA formally revokes or declines to reinstate California's CAA §209(b) waiver."},
            {"date": "2026-12-31", "when": "+217d", "kind": "market", "future": True, "now": False,
             "title": "ACC II state withdrawal", "detail": "Whether at least one ACC II-linked state (NY, CO, or OR) formally withdraws."},
            {"date": "2027-01-31", "when": "+248d", "kind": "market", "future": True, "now": True,
             "title": "Vermont EO 04-25 extension", "detail": "Whether Governor Scott extends the pause on ACT, ACC II, and the ZEV sales mandate."},
        ],
        "news": [],
        "hedges": [
            hedge("will-vermont-governor-phil-scott-extend-executive-order-04-25-pausing-act-acc-ii",
                  "Will VT Gov. Scott extend EO 04-25 pausing ACC II and the ZEV mandate?",
                  0.55, "2027-01-31", 180000),
            hedge("will-at-least-one-acc-ii-linked-state-new-york-colorado-or-oregon-formally-withd",
                  "Will at least one ACC II state (NY, CO, or OR) formally withdraw by year-end?",
                  0.30, "2026-12-31", 120000),
            hedge("will-the-epa-formally-revoke-or-decline-to-reinstate-california-s-clean-air-act-",
                  "Will EPA formally revoke or decline to reinstate CA's CAA §209(b) waiver by year-end?",
                  0.32, "2026-12-31", 150000),
        ],
    },
    "ev7": {
        "subtitle": "Commercial fleet EV order volumes are the leading indicator for DC fast-charging utilization — and they're trending down.",
        "tracked_since": "Feb 12, 2026", "last_updated": "10 hr ago",
        "attention_delta": 4, "probability_delta": 0.03, "hedge_cost": 3000,
        "view": "Commercial fleet EV order volumes are the leading indicator for DC fast-charging utilization — NTEA-tracked declines already crossed 15% YoY in late 2025, and §45W termination accelerates the drag through 2026. Hedge the fleet-order-decline contract directly, sized against your utilization assumption; this is a two-sided risk (recovery is possible) but the base case is negative.",
        "weekly": weekly(56, 68),
        "events": [
            {"date": "2027-02-28", "when": "+276d", "kind": "market", "future": True, "now": True,
             "title": "Commercial fleet EV order survey", "detail": "NTEA / Automotive Fleet annual survey — primary leading indicator."},
        ],
        "news": [],
        "hedges": [
            hedge("will-u-s-commercial-fleet-ev-order-volumes-as-reported-by-ntea-or-automotive-fle",
                  "Will US commercial fleet EV order volumes decline 15%+ YoY in 2026?",
                  0.52, "2027-02-28", 220000),
            hedge("will-u-s-new-battery-electric-vehicle-sales-in-calendar-year-2026-fall-more-than",
                  "Will US new BEV sales in CY2026 fall more than 15% below the CBO baseline?",
                  0.38, "2027-03-31", 140000),
        ],
    },
}

news = [
    {"source": "POLITICO",     "ago": "yesterday", "tag": "policy",
     "title": "Senate finance markup advances OBBBA §30C termination as energy package moves",
     "sum": "Provisions repealing the §30C refueling property credit cleared the Senate Finance committee with bipartisan splits; floor vote tracked for late June.",
     "published_at": "2026-05-27T09:00:00Z", "url": "https://example.com/30c-markup"},
    {"source": "FEDERAL REGISTER", "ago": "2 days", "tag": "policy",
     "title": "FHWA approves Texas FY2026 NEVI alt-use spending plan; $42M redirected from chargers",
     "sum": "Texas DOT's plan to redirect remaining FY22-25 NEVI funds toward intercity rail-charging hybrids cleared the FHWA review.",
     "published_at": "2026-05-26T12:00:00Z", "url": "https://www.federalregister.gov/example"},
    {"source": "CANARY MEDIA", "ago": "3 days", "tag": "market",
     "title": "Vermont governor signals extension of EO 04-25 ACC II pause through 2027",
     "sum": "Governor Scott confirmed at a press availability that the executive order pausing ACT/ACC II mandates will be extended; trilateral pressure from manufacturers cited.",
     "published_at": "2026-05-25T14:00:00Z", "url": "https://example.com/vt-acc"},
    {"source": "UTILITY DIVE", "ago": "5 days", "tag": "market",
     "title": "DC fast charger deployments hit Q1 high — but state policy uncertainty deepens",
     "sum": "Q1 2026 saw record DC fast-charger commissioning, though developers cite NEVI redirection and ACC II uncertainty as headwinds for the back half of the year.",
     "published_at": "2026-05-23T10:00:00Z", "url": "https://example.com/q1-dcfc"},
    {"source": "USTR",         "ago": "6 days", "tag": "trade",
     "title": "Section 232 grid-equipment investigation reopens; transformer rate review on the docket",
     "sum": "BIS announced a fresh investigation into transformer and switchgear imports; the 15% transitional rate set in late 2025 is now formally up for renewal.",
     "published_at": "2026-05-22T16:00:00Z", "url": "https://example.com/232-reopen"},
    {"source": "POLITICO",     "ago": "1 wk",   "tag": "policy",
     "title": "FHWA-2026-02825 EV-charger Buy America waiver docket comments close June 12",
     "sum": "Industry comments due on FHWA's pending decision whether to grant or deny a domestic-content waiver for non-compliant chargers; outcome shapes the BABA enforcement posture.",
     "published_at": "2026-05-21T11:00:00Z", "url": "https://example.com/fhwa-baba"},
]

# Enrich each risk_detail with the denormalised fields the schema requires.
_risk_by_id = {r["id"]: r for r in risks}
for _rid, _d in details.items():
    _r = _risk_by_id[_rid]
    _d.update({
        "archetype_id": meta["id"],
        "archetype_name": meta["name"],
        "id": _rid,
        "category": _r["category"],
        "title": _r["title"],
        "citation": _r["citation"],
        "attention": _r["attention"],
        "probability": _r["probability"],
        "impact_irr": _r["impact_irr"],
        "impact_usd": _r["impact_usd"],
    })
    # Mirror lifecycle status onto the detail for the deep-dive page.
    if _r.get("status"): _d["status"] = _r["status"]
    if _r.get("realized_date"): _d["realized_date"] = _r["realized_date"]

# Archetype derived fields. risks_high = count of likelihood=='high'; news_this_week = count of news items in last 7 days.
risks_total = len(risks)
risks_high = sum(1 for r in risks if r["likelihood"] == "high")
news_this_week = sum(1 for n in news if "yesterday" in n["ago"] or "days" in n["ago"] or "day" in n["ago"])

# Archetype-level attention_weekly: ramp synthesised; cron overwrites.
arch_weekly = [int(54 + (78 - 54) * i / 11) for i in range(12)]

archetype = {
    **meta,
    "composite": composite(risks, TIR),
    "composite_delta": +6,
    "risks_total": risks_total,
    "risks_high": risks_high,
    "news_this_week": news_this_week,
    "attention_weekly": arch_weekly,
}

bundle = {
    "schema_version": "1.0.0",
    "archetype_id": "ev-charging",
    "as_of": AS_OF,
    "horizon": "18 months",
    "generated_at": NOW_ISO,
    "generated_by": "scripts/gen_ev_charging.py",
    "archetype": archetype,
    "risks": risks,
    "news": news,
    "risk_details": details,
    "sources": {
        "hedges": "synthetic_contract_library (verified slugs, May 2026 snapshot)",
        "citations": "OBBBA H.R.1, IRC §30C/§45W, BABA 2 USC 8302, 23 USC 175 NEVI, FHWA-2024-0001, CAA §209(b), Vermont EO 04-25",
        "research": "scripts/gen_ev_charging.py (hand-curated, M10 expansion #6)",
    },
}

out_path = "public/data/ev-charging.json"
with open(out_path, "w") as f:
    json.dump(bundle, f, indent=2)
print(f"wrote {out_path}  composite={archetype['composite']}  risks={risks_total}  hedges={sum(len(d['hedges']) for d in details.values())}")
