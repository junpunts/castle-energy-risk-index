#!/usr/bin/env python3
"""Generate utility-battery-storage.json archetype bundle (M10 expansion #4).
Hedges reference REAL verified synthetic_contract_library slugs + live prices."""
import json, datetime

AS_OF="2026-05-26"; NOW_ISO="2026-05-26T16:00:00+00:00"
MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
def exp(d):
    if not d: return "TBD"
    y,m,_=d.split("-"); return f"{MONTHS[int(m)-1]} {y}"
def hedge(t,title,yes,e,n): return {"ticker":t,"title":title,"yes":yes,"change":0.0,"expiry":exp(e),"notional":n}
def weekly(b,p): return [int(b+(p-b)*i/11) for i in range(12)]
def composite(risks,tir):
    drag=sum(r["probability"]*abs(r["impact_irr"]) for r in risks)
    return max(0,min(100,round((drag/max(0.001,tir*100*len(risks)))*509)))

meta={
 "id":"battery-storage","name":"Battery Storage",
 "eyebrow":"Grid-scale BESS · 4hr Li-ion / LDES",
 "blurb":"Standalone and co-located grid-scale battery storage. The fastest-growing US asset class — ITC-backed and Trump-durable — but acutely exposed to Chinese cell tariffs, FEOC component rules, interconnection queues, and emerging fire-safety regulation.",
 "typical":{"capacity":"200 MW / 800 MWh","capex":260000000.0,"capex_per_gw":1300000000.0,
            "target_irr":0.11,"cod_months":24,"ppa_price":None},
}
TIR=0.11

risks=[
 {"id":"bs1","category":"trade","title":"Section 301 cell tariffs escalate","citation":"Sec. 301 · HTS 8507 · USTR","impact_irr":-2.7,"impact_usd":57000000.0,"probability":0.57,"attention":91,"likelihood":"high","headline_change":"+15","driver":"cost"},
 {"id":"bs2","category":"policy","title":"FEOC battery-component disqualification","citation":"OBBB §45X · Treasury FEOC/PFE","impact_irr":-2.4,"impact_usd":50000000.0,"probability":0.68,"attention":86,"likelihood":"high","headline_change":"+19","driver":"cost"},
 {"id":"bs3","category":"policy","title":"48E storage ITC repeal / narrowing","citation":"IRA §48E · OBBB P.L. 119-21","impact_irr":-2.9,"impact_usd":61000000.0,"probability":0.35,"attention":78,"likelihood":"medium","headline_change":"+8","driver":"cost"},
 {"id":"bs4","category":"operational","title":"Interconnection queue >2yr in PJM","citation":"FERC Order 2023 · PJM queue","impact_irr":-1.6,"impact_usd":33000000.0,"probability":0.62,"attention":64,"likelihood":"medium","headline_change":"+4","driver":"delay"},
 {"id":"bs5","category":"operational","title":"BESS fire-safety regulation tightens","citation":"UL 9540A · TX BESS fire code","impact_irr":-1.3,"impact_usd":27000000.0,"probability":0.28,"attention":58,"likelihood":"medium","headline_change":"+11","driver":"delay"},
 {"id":"bs6","category":"trade","title":"UFLPA / CBP detention of BESS shipment","citation":"UFLPA 2021 · CBP WRO","impact_irr":-1.1,"impact_usd":23000000.0,"probability":0.08,"attention":44,"likelihood":"low","headline_change":"+2","driver":"cost"},
 {"id":"bs7","category":"market","title":"Ancillary / arbitrage revenue compression","citation":"CAISO/ERCOT · AS saturation","impact_irr":-1.5,"impact_usd":31000000.0,"probability":0.40,"attention":61,"likelihood":"medium","headline_change":"-3","driver":"revenue","two_sided":True},
]

details={
 "bs1":{"subtitle":"Stacked Section 301 duties on Chinese Li-ion and sodium-ion cells push landed cell cost up — cells are ~60% of BESS capex.","tracked_since":"Jan 18, 2026","last_updated":"2 hr ago","attention_delta":15,"probability_delta":0.06,"hedge_cost":5500,
  "view":"Cells are the cost spine of a battery project — roughly 60% of system capex — and the overwhelming majority still originate in China. The Section 301 schedule on Li-ion energy-storage cells is set to step up (one near-term contract resolves Feb 15 at 0.57), and USTR is weighing extending duties to sodium-ion (0.32). A developer who signed a 2026 COD EPC at pre-escalation cell pricing eats the delta directly. This is the single largest near-term cost shock to US storage economics, and unlike solar there's far less non-China supply to pivot to. The hedge pays on the escalation; size it to the cell fraction of capex.","weekly":weekly(62,91),
  "events":[{"date":"2026-02-15","when":"past","kind":"deadline","future":False,"title":"Sec. 301 Li-ion storage rate step-up","detail":"Near-term escalation of the Section 301 rate on Chinese Li-ion energy-storage cells."},
            {"date":"2026-09-30","when":"+127d","kind":"deadline","future":True,"now":True,"title":"USTR sodium-ion coverage decision","detail":"Whether USTR expands Section 301 to cover sodium-ion cells (HTS 8507). Resolves the second hedge."}],
  "news":[],
  "hedges":[hedge("will-section-301-tariffs-on-chinese-lithium-ion-batteries-for-energy-storage-inc","Will Section 301 tariffs on Chinese Li-ion storage batteries increase by Feb 15, 2026?",0.567,"2026-02-15",300000),
            hedge("will-ustr-expand-section-301-tariffs-to-cover-sodium-ion-battery-cells-hts-8507-","Will USTR expand Section 301 tariffs to cover sodium-ion battery cells by Sep 30, 2026?",0.322,"2026-09-30",180000),
            hedge("will-the-combined-effective-tariff-rate-on-chinese-sodium-ion-battery-cell-impor","Will the combined effective tariff on Chinese sodium-ion cells clear the threshold by year-end?",0.323,"2026-12-31",150000)]},
 "bs2":{"subtitle":"If Treasury's FEOC rules disqualify Chinese-sourced components, projects lose 45X/48E credit eligibility unless re-sourced.","tracked_since":"Jan 22, 2026","last_updated":"4 hr ago","attention_delta":19,"probability_delta":0.09,"hedge_cost":5000,
  "view":"OBBB attached Foreign-Entity-of-Concern restrictions to the storage credits, and Treasury is finalizing rules banning FEOC battery components from Chinese suppliers (we model 0.68 the ban lands; 0.56 the formal 45X PFE rulemaking confirms thresholds). For a project whose cells and modules trace to a prohibited entity, this isn't a cost bump — it's binary credit eligibility. The market is racing to qualify domestic supply (Form Energy's Weirton line at 0.72 to qualify for 45X is the bellwether). Hedge the component-ban and the rulemaking together; they bracket the disqualification risk.","weekly":weekly(60,86),
  "events":[{"date":"2026-09-30","when":"+127d","kind":"deadline","future":True,"now":True,"title":"45X FEOC/PFE rulemaking","detail":"Treasury's formal FEOC/PFE rulemaking for §45X — defines prohibited-entity thresholds."},
            {"date":"2026-12-31","when":"+219d","kind":"deadline","future":True,"title":"Chinese component ban finalized","detail":"Whether Treasury finalizes the ban on FEOC battery components from Chinese suppliers."}],
  "news":[],
  "hedges":[hedge("will-treasury-finalize-rules-banning-feoc-battery-components-from-chinese-suppli","Will Treasury finalize rules banning FEOC battery components from Chinese suppliers?",0.677,"2026-12-31",260000),
            hedge("will-treasury-s-formal-feoc-pfe-rulemaking-for-section-45x-expected-q2-2026-conf","Will Treasury's formal FEOC/PFE rulemaking for §45X confirm thresholds by Sep 30, 2026?",0.563,"2026-09-30",160000),
            hedge("will-form-energy-s-weirton-factory-production-qualify-for-section-45x-credits-un","Will Form Energy's Weirton factory qualify for §45X credits (domestic-supply bellwether)?",0.72,"2026-12-31",120000)]},
 "bs3":{"subtitle":"A repeal or narrowing of the 48E storage ITC before 2028 would reset the economics of the entire merchant-storage pipeline.","tracked_since":"Jan 15, 2026","last_updated":"6 hr ago","attention_delta":8,"probability_delta":0.03,"hedge_cost":6000,
  "view":"Standalone storage only became ITC-eligible under the IRA, and that credit is the reason the merchant-storage pipeline exists at today's scale. A repeal or material narrowing of §48E before end-2027 (we model 0.35) is the tail that reprices every un-built project. The base case is survival — storage has unusual bipartisan support as a grid-reliability asset — but the magnitude if it goes is large, hence the high IRR impact. Treasury's PFE safe-harbor tables (0.35) are the constructive counterpart that would lock in eligibility. Hedge the repeal-or-modify contract.","weekly":weekly(58,78),
  "events":[{"date":"2027-12-31","when":"+584d","kind":"deadline","future":True,"now":True,"title":"§48E storage ITC repeal window","detail":"Whether Congress repeals or modifies the §48E storage ITC before Dec 31, 2027."}],
  "news":[],
  "hedges":[hedge("will-congress-repeal-or-modify-section-48e-storage-itc-before-december-31-2027","Will Congress repeal or modify the §48E storage ITC before Dec 31, 2027?",0.35,"2027-12-31",350000),
            hedge("will-treasury-publish-pfe-safe-harbor-tables-for-energy-storage-by-december-31-2","Will Treasury publish PFE safe-harbor tables for energy storage by year-end?",0.35,"2027-01-15",140000)]},
 "bs4":{"subtitle":"PJM queue processing staying above two years pushes COD past the window assumed in the offtake or merchant model.","tracked_since":"Feb 6, 2026","last_updated":"1 day ago","attention_delta":4,"probability_delta":0.0,"hedge_cost":3000,
  "view":"Storage interconnection is the schedule tax. PJM average queue processing staying above two years (0.62) delays revenue start and can blow through tax-credit placed-in-service timing. Co-located storage faces an extra wrinkle — FERC has only a 0.05 chance of granting it priority queue status this cycle — so standalone projects wait in the same long line as everything else. This is a timing hedge, not a headline one, but for a 24-month-COD asset, six months of slip is real IRR drag. Hedge the PJM queue-time contract.","weekly":weekly(52,64),
  "events":[{"date":"2026-12-31","when":"+219d","kind":"deadline","future":True,"now":True,"title":"PJM queue-time measurement","detail":"Whether PJM average queue processing remains above 2 years for the 2026 cohort."}],
  "news":[],
  "hedges":[hedge("will-pjm-interconnection-average-queue-processing-times-remain-above-2-years-for","Will PJM average queue processing stay above 2 years through 2026?",0.62,"2026-12-31",150000),
            hedge("will-ferc-grant-priority-interconnection-queue-status-to-storage-co-located-with","Will FERC grant priority interconnection-queue status to co-located storage?",0.05,"2027-01-15",80000)]},
 "bs5":{"subtitle":"New state fire-safety codes (post-incident) can add siting constraints, setbacks, and permitting delay to BESS projects.","tracked_since":"Feb 11, 2026","last_updated":"8 hr ago","attention_delta":11,"probability_delta":0.05,"hedge_cost":2500,
  "view":"A handful of high-profile BESS fires have pushed states toward statewide fire-safety codes — Texas is weighing one (0.28). For a developer mid-siting, a new code means setbacks, UL 9540A test documentation, and local-approval delay that resets the schedule. It's the operational analogue of the interconnection risk: not a cost shock, a timing one. Hedge the Texas fire-code contract as a proxy for the broader regulatory-tightening trend.","weekly":weekly(48,58),
  "events":[{"date":"2026-12-31","when":"+219d","kind":"deadline","future":True,"now":True,"title":"TX statewide BESS fire-safety code","detail":"Whether the Texas Legislature enacts a statewide battery energy-storage fire-safety code."}],
  "news":[],
  "hedges":[hedge("will-the-texas-legislature-enact-a-statewide-battery-energy-storage-fire-safety-","Will Texas enact a statewide BESS fire-safety code?",0.28,"2026-12-31",120000)]},
 "bs6":{"subtitle":"A CBP detention of a Li-ion BESS shipment on forced-labor grounds would strand equipment mid-procurement.","tracked_since":"Feb 24, 2026","last_updated":"1 day ago","attention_delta":2,"probability_delta":0.0,"hedge_cost":2000,
  "view":"UFLPA enforcement has mostly hit solar, but battery supply chains run through the same regions, and CBP could extend detentions to BESS (we model just 0.08 — a genuine tail). A held shipment doesn't just cost duty; it slips COD and can void placed-in-service deadlines. It's cheap tail protection relative to the schedule risk a detention wave would impose. Hold the BESS-detention hedge small.","weekly":weekly(42,44),
  "events":[{"date":"2026-12-31","when":"+219d","kind":"filing","future":True,"now":True,"title":"BESS detention measurement window","detail":"Whether CBP detains or excludes a Li-ion BESS shipment on forced-labor grounds."}],
  "news":[],
  "hedges":[hedge("will-cbp-detain-or-exclude-a-lithium-ion-battery-energy-storage-system-bess-ship","Will CBP detain or exclude a Li-ion BESS shipment on forced-labor grounds?",0.08,"2026-12-31",100000)]},
 "bs7":{"subtitle":"As more storage comes online, ancillary-services and arbitrage spreads compress — eroding merchant revenue.","tracked_since":"Mar 2, 2026","last_updated":"5 hr ago","attention_delta":-3,"probability_delta":0.0,"hedge_cost":3500,
  "view":"The merchant-storage thesis rests on ancillary-services revenue and energy arbitrage. But ancillary markets are shallow — as GW of storage flood ERCOT and CAISO, AS prices saturate and per-MW revenue falls. CAISO's 2026 storage tariff revisions (0.40) reshape how that revenue is modeled. This is a genuinely two-sided risk: tighter grids and price volatility can also *lift* arbitrage spreads, so the downside drag we model is the adverse case, not the expected one. Hedge the CAISO tariff-revision contract as the cleanest proxy.","weekly":weekly(55,61),
  "events":[{"date":"2027-06-30","when":"+400d","kind":"market","future":True,"now":True,"title":"CAISO storage tariff revisions","detail":"Whether FERC accepts CAISO's 2026 storage design and modeling tariff revisions."}],
  "news":[],
  "hedges":[hedge("will-ferc-accept-caiso-s-2026-storage-design-and-modeling-tariff-revisions-inclu","Will FERC accept CAISO's 2026 storage design & modeling tariff revisions?",0.4,"2027-06-30",200000)]},
}

news=[
 {"source":"USTR","ago":"2 hr ago","tag":"trade","title":"Section 301 review weighs sodium-ion cell coverage as Li-ion rate steps up","sum":"Cell duties are the dominant cost lever for US storage; sodium-ion inclusion would close the substitution path.","published_at":"2026-05-26T13:30:00Z"},
 {"source":"TREASURY","ago":"5 hr ago","tag":"policy","title":"FEOC battery-component rulemaking advances; domestic qualification race intensifies","sum":"Disqualification of Chinese components would make §45X/48E eligibility binary for many projects.","published_at":"2026-05-26T11:00:00Z"},
 {"source":"PJM","ago":"1 day ago","tag":"operational","title":"Storage interconnection backlog persists as queue-reform compliance filings land","published_at":"2026-05-25T12:00:00Z"},
]

for r in risks:
    d=details[r["id"]]
    for kf in ("category","title","citation","impact_irr","impact_usd","probability","attention"): d[kf]=r[kf]
    d["archetype_id"]=meta["id"]; d["archetype_name"]=meta["name"]; d["id"]=r["id"]
comp=composite(risks,TIR)
meta.update({"composite":comp,"composite_delta":0,"risks_total":len(risks),
 "risks_high":sum(1 for r in risks if r["likelihood"]=="high"),"news_this_week":len(news),
 "attention_weekly":weekly(45,comp)})
bundle={"schema_version":"1.0.0","archetype_id":meta["id"],"generated_at":NOW_ISO,
 "generated_by":"scaffold-gen-v1","as_of":AS_OF,"horizon":"18 months","archetype":meta,
 "risks":risks,"news":news,"risk_details":details,"sources":{}}
json.dump(bundle,open("public/data/battery-storage.json","w"),indent=2)
print(f"battery-storage: composite {comp}, {len(risks)} risks, {meta['risks_high']} high")
print("wrote public/data/battery-storage.json")
