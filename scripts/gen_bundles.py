#!/usr/bin/env python3
"""
Generate utility-solar.json and natural-gas.json archetype bundles.

Hedges reference REAL slugs from the synthetic_contract_library (verified to
exist + priced). `yes` = library probability at authoring time; `change` = 0
(library has no price history). The snapshot_hedge_prices stage refreshes
`yes` live on every pipeline run via the castle-library adapter.
"""
import json, datetime

AS_OF = "2026-05-26"
NOW_ISO = "2026-05-26T16:00:00+00:00"

def expiry_human(d):
    if not d: return "TBD"
    dt = datetime.date.fromisoformat(d)
    return dt.strftime("%b %Y")

def composite(risks, target_irr):
    drag = sum(r["probability"] * abs(r["impact_irr"]) for r in risks)
    denom = target_irr * 100 * len(risks)
    raw = drag / max(0.001, denom)
    return max(0, min(100, round(raw * 509)))

def hedge(ticker, title, yes, expiry_date, notional):
    return {"ticker": ticker, "title": title, "yes": yes, "change": 0.0,
            "expiry": expiry_human(expiry_date), "notional": notional}

def weekly(base, peak):
    # simple ramp from base to peak over 12 weeks
    return [int(base + (peak - base) * i / 11) for i in range(12)]

def build(archetype_meta, risks, details, news, target_irr):
    for r in risks:
        d = details[r["id"]]
        # mirror shared fields from risk → detail
        for k in ("category","title","citation","impact_irr","impact_usd","probability","attention"):
            d[k] = r[k]
        d["archetype_id"] = archetype_meta["id"]
        d["archetype_name"] = archetype_meta["name"]
        d["id"] = r["id"]
    comp = composite(risks, target_irr)
    archetype_meta["composite"] = comp
    archetype_meta["composite_delta"] = 0
    archetype_meta["risks_total"] = len(risks)
    archetype_meta["risks_high"] = sum(1 for r in risks if r["likelihood"]=="high")
    archetype_meta["news_this_week"] = len(news)
    archetype_meta["attention_weekly"] = weekly(40, comp)
    return {
        "schema_version": "1.0.0",
        "archetype_id": archetype_meta["id"],
        "generated_at": NOW_ISO,
        "generated_by": "scaffold-gen-v1",
        "as_of": AS_OF,
        "horizon": "18 months",
        "archetype": archetype_meta,
        "risks": risks,
        "news": news,
        "risk_details": details,
        "sources": {},
    }

# ──────────────────────────────────────────────────────────────────────────
# UTILITY SOLAR
# ──────────────────────────────────────────────────────────────────────────
solar_meta = {
    "id": "utility-solar",
    "name": "Utility-Scale Solar",
    "eyebrow": "Single-axis tracker · PPA / merchant",
    "blurb": "Ground-mount PV at 100MW+. The largest source of new U.S. capacity — and the most exposed to trade policy: panel tariffs, AD/CVD orders, UFLPA detentions, and the 45Y/48E credit phase-out.",
    "typical": {"capacity": "200 MWdc", "capex": 220000000.0, "capex_per_gw": 1100000000.0,
                "target_irr": 0.09, "cod_months": 30, "ppa_price": 35.0},
}
solar_target_irr = 0.09

solar_risks = [
    {"id":"us1","category":"trade","title":"AD/CVD Solar IV orders on SE-Asia cells","citation":"USITC Inv. 701-TA-699 · 731-TA-1664","impact_irr":-2.9,"impact_usd":48000000.0,"probability":0.82,"attention":94,"likelihood":"high","headline_change":"+18"},
    {"id":"us2","category":"trade","title":"Chinese panel tariffs exceed 60% combined","citation":"Sec. 301 · Commerce AD/CVD stacking","impact_irr":-2.1,"impact_usd":34000000.0,"probability":0.50,"attention":71,"likelihood":"medium","headline_change":"+6"},
    {"id":"us3","category":"policy","title":"48E/45Y FEOC guidance delay","citation":"IRA §48E/§45Y · OBBB P.L. 119-21","impact_irr":-2.6,"impact_usd":42000000.0,"probability":0.51,"attention":88,"likelihood":"high","headline_change":"+22"},
    {"id":"us4","category":"trade","title":"UFLPA / forced-labor detentions widen","citation":"UFLPA 2021 · CBP WRO","impact_irr":-1.8,"impact_usd":29000000.0,"probability":0.97,"attention":63,"likelihood":"high","headline_change":"+4"},
    {"id":"us5","category":"operational","title":"Interconnection queue >2yr in PJM","citation":"FERC Order 2023 · PJM queue reform","impact_irr":-1.5,"impact_usd":24000000.0,"probability":0.62,"attention":58,"likelihood":"medium","headline_change":"+3"},
    {"id":"us6","category":"market","title":"ERCOT curtailment up >25% by 2027","citation":"ERCOT ITS · negative-price hours","impact_irr":-1.2,"impact_usd":19000000.0,"probability":1.0,"attention":52,"likelihood":"medium","headline_change":"-2"},
    {"id":"us7","category":"trade","title":"LONGi named Prohibited Foreign Entity","citation":"§48E FEOC · Treasury designation","impact_irr":-1.6,"impact_usd":26000000.0,"probability":0.50,"attention":49,"likelihood":"medium","headline_change":"+9"},
]

solar_details = {
 "us1":{"subtitle":"A final affirmative injury vote triggers AD/CVD orders on cells from India, Indonesia, and Laos within a week — re-routing the post-Cambodia supply chain a second time.","tracked_since":"Jan 14, 2026","last_updated":"3 hr ago","attention_delta":18,"probability_delta":0.07,"hedge_cost":4000,
   "view":"The Solar IV cases are the single largest near-term cost shock to U.S. utility PV. After the 2024 AD/CVD orders pushed sourcing from Cambodia/Vietnam/Thailand/Malaysia into India and Indonesia, petitioners followed the supply chain — and the USITC's preliminary injury findings were affirmative. A final affirmative determination (we model 82%) triggers orders within a week, layering duties on the new low-cost origins and stranding modules already on the water. Developers who signed 2026 COD PPAs at pre-order module pricing eat the delta. The hedge pays on the affirmative vote; size it to the module fraction of capex.","weekly":weekly(60,94),
   "events":[{"date":"2026-10-19","when":"+146d","kind":"deadline","future":True,"now":True,"title":"USITC final injury vote — Solar IV","detail":"Final affirmative determination triggers AD/CVD order issuance within one week. Highest-information event in the trade channel."}],
   "news":[],
   "hedges":[hedge("will-the-usitc-issue-a-final-affirmative-injury-determination-in-the-solar-iv-in","Will the USITC issue a final affirmative injury determination in the Solar IV investigations by Oct 19, 2026?",0.82,"2026-10-26",250000)]},
 "us2":{"subtitle":"Stacked Section 301 + AD/CVD duties push the all-in Chinese module rate past 60%, hardening the case for domestic and Indian supply.","tracked_since":"Feb 2, 2026","last_updated":"6 hr ago","attention_delta":6,"probability_delta":0.02,"hedge_cost":3000,
   "view":"China-origin modules already face a punitive stack, but the combined effective rate clearing 60% is the threshold at which Indian and domestic cells become unambiguously cheaper even after their own premia. We put this near a coin-flip by Sep 30. For a developer, the risk isn't direct China exposure — it's that the whole module market reprices upward as the cheapest marginal supplier exits. The hedge is a clean YES on the 60% threshold.","weekly":weekly(55,71),
   "events":[{"date":"2026-09-30","when":"+127d","kind":"deadline","future":True,"now":True,"title":"Combined-rate measurement date","detail":"Contract resolves on whether stacked duties exceed 60% combined by Sep 30, 2026."}],
   "news":[],
   "hedges":[hedge("will-chinese-solar-panel-tariffs-exceed-60-combined-rate-by-september-30-2026","Will Chinese solar panel tariffs exceed 60% combined rate by Sep 30, 2026?",0.502,"2026-10-15",180000)]},
 "us3":{"subtitle":"If Treasury misses the FEOC guidance window, 48E/45Y credit eligibility stays ambiguous through the 2026 build season — chilling tax-equity commitments.","tracked_since":"Jan 20, 2026","last_updated":"2 hr ago","attention_delta":22,"probability_delta":0.11,"hedge_cost":4500,
   "view":"The 48E/45Y investment and production credits are the economic backbone of utility solar, but OBBB attached Foreign-Entity-of-Concern restrictions that Treasury must define before tax-equity investors will fully underwrite. Appropriations-driven IRS staffing constraints make a slip past June 30 (we model 51%) and a comprehensive proposed-rule slip past Sep 30 (67%) both live. Every month of ambiguity delays financial close on projects targeting 2026 COD. Two hedges bracket the timing: the near-term staffing-delay contract and the comprehensive-rulemaking contract.","weekly":weekly(64,88),
   "events":[{"date":"2026-06-30","when":"+35d","kind":"deadline","future":True,"now":True,"title":"Final FEOC guidance target","detail":"IRS staffing constraints make a slip past this date the base case. Triggers the near-term hedge."},
             {"date":"2026-09-30","when":"+127d","kind":"deadline","future":True,"title":"Comprehensive proposed FEOC regs","detail":"Defines prohibited-entity thresholds. Slip past Sep 30 resolves the second hedge YES."}],
   "news":[],
   "hedges":[hedge("will-irs-delays-in-issuing-final-feoc-guidance-for-sections-48e-45y-extend-beyon","Will IRS FEOC guidance for 48E/45Y slip past June 30, 2026?",0.507,"2026-07-15",260000),
             hedge("will-irs-treasury-issue-comprehensive-proposed-feoc-regulations-for-sections-45y","Will IRS/Treasury issue comprehensive proposed FEOC regs for 45Y/48E by Sep 30, 2026?",0.672,"2026-10-10",150000)]},
 "us4":{"subtitle":"Expanded CBP forced-labor enforcement raises the odds of module shipments held at the border on traceability grounds.","tracked_since":"Jan 9, 2026","last_updated":"9 hr ago","attention_delta":4,"probability_delta":0.01,"hedge_cost":2500,
   "view":"UFLPA detentions remain the most operationally disruptive trade risk: a held container doesn't just cost duty, it slips COD and can void PPA milestones. The administration is expanding forced-labor enforcement (we model 97% on the broad-enforcement contract), and while solar polysilicon traceability has improved, the tail risk of a detention wave during a build is real. The hedge is cheap relative to the schedule risk it offsets.","weekly":weekly(55,63),
   "events":[{"date":"2027-01-01","when":"+220d","kind":"deadline","future":True,"now":True,"title":"Enforcement-expansion measurement","detail":"Resolves on whether CBP expands forced-labor enforcement targeting additional commodities."}],
   "news":[],
   "hedges":[hedge("will-customs-expand-forced-labor-enforcement-targeting-cotton-rubber-or-textile-","Will Customs expand forced-labor enforcement to additional commodities by 2027?",0.97,"2027-01-01",120000)]},
 "us5":{"subtitle":"PJM queue processing staying above two years pushes interconnection-dependent COD dates beyond PPA windows.","tracked_since":"Feb 18, 2026","last_updated":"1 day ago","attention_delta":3,"probability_delta":0.0,"hedge_cost":2000,
   "view":"Interconnection is the slow-burn risk: not a price shock but a schedule tax. PJM's average queue processing staying above two years (we model 62%) is the difference between a project that hits its PPA COD and one that pays delay damages or re-prices. Combined with the structural signal that post-45Y/48E queue additions could drop 30%+, the channel is about timing certainty, not headline drama. Hedge the PJM-specific delay.","weekly":weekly(50,58),
   "events":[{"date":"2026-12-31","when":"+219d","kind":"deadline","future":True,"now":True,"title":"PJM queue-time measurement","detail":"Resolves on whether average PJM queue processing remains above 2 years for 2026 cohort."}],
   "news":[],
   "hedges":[hedge("will-pjm-interconnection-average-queue-processing-times-remain-above-2-years-for","Will PJM average queue processing stay above 2 years through 2026?",0.62,"2026-12-31",100000),
             hedge("will-u-s-utility-scale-wind-and-solar-interconnection-queue-additions-drop-by-30","Will U.S. utility-scale wind/solar queue additions drop 30%+ in 2028 vs 2026?",1.0,"2029-03-31",80000)]},
 "us6":{"subtitle":"Rising ERCOT curtailment erodes merchant revenue and the value of uncontracted solar MWh.","tracked_since":"Mar 4, 2026","last_updated":"2 days ago","attention_delta":-2,"probability_delta":0.0,"hedge_cost":1500,
   "view":"In ERCOT, the marginal solar MWh increasingly clears at zero or negative prices in the midday belly. Curtailment rising more than 25% by 2027 (the contract resolves YES on current trajectory) directly hits merchant and hybrid PPA revenue. For a tracker project counting on midday capture, this is a basis risk that storage co-location only partly offsets. The hedge pays as curtailment worsens.","weekly":weekly(48,52),
   "events":[{"date":"2028-01-31","when":"+615d","kind":"market","future":True,"now":True,"title":"ERCOT 2027 curtailment tally","detail":"Resolves on whether 2027 wind+solar curtailment rose more than 25% vs baseline."}],
   "news":[],
   "hedges":[hedge("will-wind-and-solar-curtailment-in-ercot-increase-by-more-than-25-in-2027-versus","Will ERCOT wind+solar curtailment rise >25% in 2027?",1.0,"2028-01-31",90000)]},
 "us7":{"subtitle":"A LONGi Prohibited-Foreign-Entity designation would strand a major module supplier mid-procurement.","tracked_since":"Feb 25, 2026","last_updated":"5 hr ago","attention_delta":9,"probability_delta":0.04,"hedge_cost":2500,
   "view":"If Treasury designates LONGi a Prohibited Foreign Entity under 48E FEOC rules (we model 50%), any project relying on its modules for credit-eligible capex faces re-sourcing on short notice. This is the supply-chain analogue of the FEOC timing risk: not whether the credit exists, but whether your chosen supplier disqualifies it. The companion contract on banning FEOC battery components from Chinese suppliers (68%) signals the broader designation appetite. Hedge the LONGi-specific designation.","weekly":weekly(45,49),
   "events":[{"date":"2026-09-30","when":"+127d","kind":"deadline","future":True,"now":True,"title":"LONGi designation window","detail":"Resolves on whether Treasury designates LONGi a Prohibited Foreign Entity by Sep 30, 2026."}],
   "news":[],
   "hedges":[hedge("will-treasury-designate-longi-solar-as-a-prohibited-foreign-entity-under-section","Will Treasury designate LONGi Solar a Prohibited Foreign Entity by Sep 30, 2026?",0.5,"2026-10-15",130000),
             hedge("will-irs-treasury-issue-comprehensive-proposed-feoc-regulations-for-sections-45y","Will IRS/Treasury issue comprehensive proposed FEOC regs for 45Y/48E by Sep 30, 2026?",0.672,"2026-10-10",100000)]},
}

solar_news = [
 {"source":"USITC","ago":"3 hr ago","tag":"trade","title":"Solar IV: Commission sets final injury vote for mid-October","sum":"Final affirmative determination would trigger AD/CVD orders on cells from India, Indonesia, and Laos within one week.","published_at":"2026-05-26T13:00:00Z"},
 {"source":"TREASURY","ago":"1 day ago","tag":"policy","title":"FEOC guidance for 48E/45Y still pending as appropriations strain IRS staffing","sum":"Tax-equity investors signal they will hold underwriting until prohibited-entity thresholds are defined.","published_at":"2026-05-25T15:00:00Z"},
 {"source":"PJM","ago":"2 days ago","tag":"operational","title":"PJM queue reform update: average processing still tracking above two years","published_at":"2026-05-24T12:00:00Z"},
]

# ──────────────────────────────────────────────────────────────────────────
# NATURAL GAS
# ──────────────────────────────────────────────────────────────────────────
gas_meta = {
    "id": "natural-gas",
    "name": "Natural Gas Generation",
    "eyebrow": "Combined-cycle · LNG-linked · merchant",
    "blurb": "Gas-fired generation and LNG-export-linked supply — the administration's energy centerpiece, supercharged by data-center demand. Risk concentrates in LNG authorizations, pipeline permitting, turbine supply, and Henry Hub volatility.",
    "typical": {"capacity": "1,100 MW CCGT", "capex": 1100000000.0, "capex_per_gw": 1000000000.0,
                "target_irr": 0.12, "cod_months": 36, "ppa_price": 45.0},
}
gas_target_irr = 0.12

gas_risks = [
    {"id":"ng1","category":"policy","title":"LNG export authorizations stall <5 Bcf/d","citation":"DOE §3 · E.O. 14154","impact_irr":-2.4,"impact_usd":210000000.0,"probability":0.42,"attention":82,"likelihood":"high","headline_change":"+11"},
    {"id":"ng2","category":"operational","title":"CP2 LNG authorization remanded","citation":"D.C. Cir. 24-1291 · NEPA/CAA","impact_irr":-2.0,"impact_usd":175000000.0,"probability":0.31,"attention":67,"likelihood":"medium","headline_change":"+5"},
    {"id":"ng3","category":"policy","title":"FERC pipeline approvals exceed 18 months","citation":"NGA §7 · FERC certificate queue","impact_irr":-1.7,"impact_usd":150000000.0,"probability":0.36,"attention":59,"likelihood":"medium","headline_change":"+3"},
    {"id":"ng4","category":"market","title":"Henry Hub spikes above $5/MMBtu","citation":"NYMEX HH · 30-day sustained","impact_irr":-1.9,"impact_usd":165000000.0,"probability":0.51,"attention":74,"likelihood":"high","headline_change":"+8"},
    {"id":"ng5","category":"operational","title":"EPA combustion-turbine rule delays COD","citation":"EPA NSPS · Jan 2026 turbine rule","impact_irr":-1.4,"impact_usd":120000000.0,"probability":0.45,"attention":55,"likelihood":"medium","headline_change":"+6"},
    {"id":"ng6","category":"market","title":"PJM capacity shortfall / data-center demand","citation":"PJM BRA · 15-yr backstop auction","impact_irr":-1.1,"impact_usd":95000000.0,"probability":0.15,"attention":48,"likelihood":"low","headline_change":"+14"},
    {"id":"ng7","category":"policy","title":"NEPA categorical-exclusion injunction","citation":"E.O. 14318 · NEPA cat-ex litigation","impact_irr":-1.3,"impact_usd":110000000.0,"probability":0.05,"attention":41,"likelihood":"low","headline_change":"-1"},
]

gas_details = {
 "ng1":{"subtitle":"If DOE approvals fall short of 5 Bcf/d cumulative, the export-demand thesis underpinning new gas supply weakens.","tracked_since":"Jan 12, 2026","last_updated":"4 hr ago","attention_delta":11,"probability_delta":0.05,"hedge_cost":9000,
   "view":"LNG export authorizations are the demand engine for U.S. gas. E.O. 14154 lifted the Biden pause, but DOE still has to actually approve capacity — and the 5 Bcf/d cumulative threshold by year-end is, on our read, only 42% likely given docket throughput. Falling short doesn't kill the thesis, but it slows the takeaway demand that justifies new combined-cycle and supply investment. The multi-project authorization contract (42%) is the cleaner read on administration follow-through. Hedge both the cumulative-capacity and the three-project versions.","weekly":weekly(60,82),
   "events":[{"date":"2026-12-31","when":"+219d","kind":"deadline","future":True,"now":True,"title":"DOE cumulative-authorization tally","detail":"Resolves on whether DOE approves >5 Bcf/d new LNG export capacity cumulatively by year-end."}],
   "news":[],
   "hedges":[hedge("will-doe-approve-new-lng-export-capacity-authorizations-exceeding-5-bcf-d-cumula","Will DOE approve >5 Bcf/d new LNG export capacity by Dec 31, 2026?",0.578,"2026-12-31",500000),
             hedge("will-doe-approve-export-authorizations-for-3-or-more-competing-us-lng-projects-a","Will DOE approve export authorizations for 3+ competing US LNG projects by Dec 31, 2026?",0.421,"2026-12-31",300000)]},
 "ng2":{"subtitle":"A D.C. Circuit remand of CP2's environmental review would freeze a flagship export terminal and chill project finance sector-wide.","tracked_since":"Jan 28, 2026","last_updated":"7 hr ago","attention_delta":5,"probability_delta":0.02,"hedge_cost":7500,
   "view":"CP2 is the bellwether. The D.C. Circuit either affirms FERC's authorizations (we model 52% affirm) or remands for NEPA/Clean Air Act deficiencies (31%). A remand doesn't just hit CP2 — it re-prices litigation risk on every pending terminal and the pipelines feeding them. The two contracts are near-complementary; we hold the remand-risk hedge because that's the asymmetric downside for a gas-supply investor counting on export pull.","weekly":weekly(55,67),
   "events":[{"date":"2026-12-31","when":"+219d","kind":"filing","future":True,"now":True,"title":"D.C. Circuit CP2 ruling window","detail":"Affirm vs. remand of FERC's CP2 LNG terminal authorizations. Highest-information event in the LNG channel."}],
   "news":[],
   "hedges":[hedge("will-the-d-c-circuit-remand-ferc-s-cp2-lng-environmental-review-d-c-cir-nos-24-1","Will the D.C. Circuit remand FERC's CP2 LNG environmental review before Dec 31, 2026?",0.31,"2026-12-31",350000),
             hedge("will-the-u-s-court-of-appeals-for-the-d-c-circuit-affirm-ferc-s-cp2-lng-terminal","Will the D.C. Circuit affirm FERC's CP2 LNG terminal authorizations by Dec 31, 2026?",0.52,"2026-12-31",200000)]},
 "ng3":{"subtitle":"FERC certificate processing staying above 18 months delays the pipeline takeaway new gas generation depends on.","tracked_since":"Feb 8, 2026","last_updated":"1 day ago","attention_delta":3,"probability_delta":0.0,"hedge_cost":6000,
   "view":"Even with the administration's permitting push, FERC certificate timelines are sticky. Average processing exceeding 18 months for 2026-filed interstate projects (we model 36%) is the schedule risk that strands a combined-cycle plant without firm fuel transport. This is a timing hedge, not a headline one — but for a 36-month COD plant, six months of pipeline slip is real IRR drag.","weekly":weekly(50,59),
   "events":[{"date":"2027-06-30","when":"+400d","kind":"deadline","future":True,"now":True,"title":"FERC pipeline-timeline measurement","detail":"Resolves on whether average FERC approval exceeds 18 months for 2026-filed interstate projects."}],
   "news":[],
   "hedges":[hedge("will-ferc-pipeline-approval-processing-times-exceed-18-months-average-for-new-in","Will FERC pipeline approval times exceed 18 months average for 2026 interstate projects?",0.358,"2027-06-30",250000)]},
 "ng4":{"subtitle":"A sustained Henry Hub spike above $5 compresses spark spreads and merchant gas margins.","tracked_since":"Jan 16, 2026","last_updated":"3 hr ago","attention_delta":8,"probability_delta":0.03,"hedge_cost":7000,
   "view":"For a merchant or tolling combined-cycle plant, fuel cost is the margin. Henry Hub holding above $5/MMBtu for 30 consecutive days (we model 51% in the Apr–Oct window) compresses spark spreads precisely when LNG feedgas demand competes with power burn. This is the cleanest market hedge in the book: a YES on the sustained-spike contract directly offsets fuel-cost downside.","weekly":weekly(58,74),
   "events":[{"date":"2026-10-31","when":"+158d","kind":"market","future":True,"now":True,"title":"Henry Hub sustained-spike window closes","detail":"Resolves on whether HH exceeded $5/MMBtu for 30 consecutive days between Apr and Oct 2026."}],
   "news":[],
   "hedges":[hedge("will-u-s-henry-hub-natural-gas-spot-prices-exceed-5-00-mmbtu-for-30-consecutive-","Will Henry Hub exceed $5/MMBtu for 30 consecutive days Apr–Oct 2026?",0.512,"2026-10-31",400000)]},
 "ng5":{"subtitle":"EPA's combustion-turbine NSPS rule could delay permitting for new gas units mid-development.","tracked_since":"Feb 14, 2026","last_updated":"8 hr ago","attention_delta":6,"probability_delta":0.02,"hedge_cost":5000,
   "view":"EPA's January 2026 combustion-turbine rules cut both ways: the permitting rule closing a temporary exemption (25%) and the NSPS rule delaying specific projects (45%) both add regulatory schedule risk to new gas units. For a developer mid-permit, this is the operational analogue of the pipeline-timeline risk — a rule change that resets the clock. Hedge the project-delay contract.","weekly":weekly(48,55),
   "events":[{"date":"2026-09-30","when":"+127d","kind":"deadline","future":True,"now":True,"title":"EPA turbine-rule effect measurement","detail":"Resolves on whether EPA's NSPS turbine rule delays affected projects."}],
   "news":[],
   "hedges":[hedge("will-epa-s-january-2026-combustion-turbine-nsps-rule-delay-crusoe-abilene-turbin","Will EPA's Jan 2026 combustion-turbine NSPS rule delay affected turbine projects?",0.45,"2026-09-30",200000),
             hedge("will-epa-s-january-2026-gas-turbine-permitting-rule-closing-temporary-exemption-","Will EPA's Jan 2026 gas-turbine permitting rule close the temporary exemption?",0.25,"2026-06-30",120000)]},
 "ng6":{"subtitle":"Data-center load is driving a PJM capacity shortfall — upside for gas margins, but dependent on auction mechanics.","tracked_since":"Mar 1, 2026","last_updated":"5 hr ago","attention_delta":14,"probability_delta":0.06,"hedge_cost":4000,
   "view":"This is the upside-risk channel. AI data-center load is straining PJM, and the question is whether it translates into capacity-market revenue for gas. The 6,600 MW emergency-procurement cost contract (5%) and the 15-year backstop-auction approval (15%) are both low-probability but high-payoff signals of how the capacity construct evolves. For a gas plant counting on scarcity pricing, these are the hedges that pay when the demand thesis materializes faster than the market expects.","weekly":weekly(40,48),
   "events":[{"date":"2026-09-30","when":"+127d","kind":"market","future":True,"now":True,"title":"PJM capacity-construct decisions","detail":"Resolves on emergency-procurement cost impact and backstop-auction approval."}],
   "news":[],
   "hedges":[hedge("will-pjm-s-6-600-mw-capacity-shortfall-emergency-procurement-impose-costs-100m-o","Will PJM's 6,600 MW capacity-shortfall procurement impose >$100M costs?",0.05,"2026-09-30",120000)]},
 "ng7":{"subtitle":"A court injunction against E.O. 14318's NEPA categorical exclusions would re-impose review burden on gas infrastructure.","tracked_since":"Feb 20, 2026","last_updated":"2 days ago","attention_delta":-1,"probability_delta":0.0,"hedge_cost":3500,
   "view":"The administration's NEPA categorical exclusions are the legal scaffolding for faster gas-infrastructure permitting. A federal injunction blocking E.O. 14318's cat-ex (we model just 5%) is a low-probability tail, but it's the kind of event that would re-impose full review on a pipeline or terminal mid-permit. We also track FERC's own cat-ex finalization (47%) as the constructive counterpart. Hold the injunction hedge as cheap tail protection.","weekly":weekly(42,41),
   "events":[{"date":"2026-12-31","when":"+219d","kind":"filing","future":True,"now":True,"title":"NEPA cat-ex litigation window","detail":"Resolves on whether a federal court enjoins E.O. 14318's NEPA categorical exclusions."}],
   "news":[],
   "hedges":[hedge("will-a-federal-court-issue-an-injunction-blocking-eo-14318-s-nepa-categorical-ex","Will a federal court enjoin E.O. 14318's NEPA categorical exclusions?",0.05,"2026-12-31",150000),
             hedge("will-ferc-finalize-categorical-nepa-exemptions-for-grid-reconductoring-projects-","Will FERC finalize NEPA categorical exemptions for grid projects by Sep 30, 2026?",0.472,"2026-09-30",100000)]},
}

gas_news = [
 {"source":"DOE","ago":"4 hr ago","tag":"policy","title":"DOE advances LNG export docket; cumulative 5 Bcf/d target in question","sum":"Throughput on competing project authorizations will determine whether the year-end cumulative threshold is met.","published_at":"2026-05-26T12:00:00Z"},
 {"source":"DC CIRCUIT","ago":"1 day ago","tag":"operational","title":"CP2 LNG oral arguments conclude; ruling expected by year-end","sum":"Affirm-vs-remand outcome will re-price NEPA litigation risk across pending terminals.","published_at":"2026-05-25T14:00:00Z"},
 {"source":"PJM","ago":"6 hr ago","tag":"market","title":"Data-center interconnection requests push PJM capacity outlook tighter","published_at":"2026-05-26T10:00:00Z"},
]

solar = build(solar_meta, solar_risks, solar_details, solar_news, solar_target_irr)
gas = build(gas_meta, gas_risks, gas_details, gas_news, gas_target_irr)

with open("public/data/utility-solar.json","w") as f: json.dump(solar, f, indent=2)
with open("public/data/natural-gas.json","w") as f: json.dump(gas, f, indent=2)
print("solar composite:", solar["archetype"]["composite"], "risks:", len(solar_risks), "high:", solar["archetype"]["risks_high"])
print("gas   composite:", gas["archetype"]["composite"], "risks:", len(gas_risks), "high:", gas["archetype"]["risks_high"])
print("wrote public/data/utility-solar.json and public/data/natural-gas.json")
