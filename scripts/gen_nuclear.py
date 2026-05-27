#!/usr/bin/env python3
"""Generate nuclear-smr.json archetype bundle (M10 expansion #5).
Development-stage SMR (TVA BWRX-300 reference). Hedges reference REAL
verified synthetic_contract_library slugs + live prices."""
import json

AS_OF="2026-05-27"; NOW_ISO="2026-05-27T16:00:00+00:00"
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
 "id":"nuclear-smr","name":"Nuclear / SMR",
 "eyebrow":"Small modular reactor · 300 MW BWRX-300 (development-stage)",
 "blurb":"First-of-a-kind small modular reactor, benchmarked to TVA's BWRX-300 at Clinch River. The marquee firm-clean-power bet of the Trump nuclear push — backed by the §45U production credit, EO 14300 NRC overhaul, and DOE loan support — but still pre-construction, so the risk profile is dominated by licensing timing, financing close, and fuel-supply security rather than operating economics.",
 "typical":{"capacity":"300 MW (BWRX-300 SMR)","capex":3000000000.0,"capex_per_gw":10000000000.0,
            "target_irr":0.09,"cod_months":60,"ppa_price":None},
}
TIR=0.09

risks=[
 {"id":"ns1","category":"operational","title":"NRC licensing slips construction permit","citation":"10 CFR Part 50 · Clinch River CPA","impact_irr":-2.8,"impact_usd":84000000.0,"probability":0.72,"attention":89,"likelihood":"high","headline_change":"+12","driver":"delay"},
 {"id":"ns2","category":"policy","title":"§45U nuclear PTC narrowed / FEOC-gated","citation":"OBBBA §45U · Treasury FEOC","impact_irr":-2.2,"impact_usd":66000000.0,"probability":0.32,"attention":74,"likelihood":"medium","headline_change":"+9","driver":"cost"},
 {"id":"ns3","category":"trade","title":"Fuel-supply squeeze (Russian-ban / HALEU)","citation":"Prohibiting Russian Uranium Imports Act","impact_irr":-1.8,"impact_usd":54000000.0,"probability":0.45,"attention":68,"likelihood":"medium","headline_change":"+7","driver":"cost"},
 {"id":"ns4","category":"operational","title":"NRC framework modernization stalls","citation":"EO 14300 · 10 CFR Part 53","impact_irr":-1.5,"impact_usd":45000000.0,"probability":0.58,"attention":61,"likelihood":"medium","headline_change":"+5","driver":"delay"},
 {"id":"ns5","category":"market","title":"DOE loan / financing close fails","citation":"DOE LPO Title 17 · FOAK finance","impact_irr":-2.4,"impact_usd":72000000.0,"probability":0.65,"attention":71,"likelihood":"high","headline_change":"+8","driver":"cost"},
 {"id":"ns6","category":"policy","title":"Litigation stays NRC proceedings","citation":"Beyond Nuclear v. NRC · DC Cir.","impact_irr":-2.0,"impact_usd":60000000.0,"probability":0.10,"attention":42,"likelihood":"low","headline_change":"+1","driver":"delay"},
 {"id":"ns7","category":"policy","title":"Federal shutdown delays permitting","citation":"Appropriations lapse · NRC/DOE","impact_irr":-1.2,"impact_usd":36000000.0,"probability":0.35,"attention":55,"likelihood":"medium","headline_change":"+3","driver":"delay"},
]

details={
 "ns1":{"subtitle":"A first-of-a-kind SMR lives or dies on its NRC licensing timeline; any slip in the construction permit cascades through the entire FOAK schedule.","tracked_since":"Jan 12, 2026","last_updated":"3 hr ago","attention_delta":12,"probability_delta":0.04,"hedge_cost":7000,
  "view":"For a pre-construction SMR, licensing IS the project — there is no revenue, no operating margin, just a regulatory critical path. TVA's BWRX-300 at Clinch River is the US reference case, and the market prices only a 0.28 chance the NRC issues the construction permit on the near-term schedule, with the Advance Safety Evaluation Report at 0.42 and the Final SER at 0.38. That implies roughly a 0.72 chance of a licensing slip relative to the developer's base plan — and every month of slip pushes COD, compounds carrying cost on a multi-billion-dollar capital stack, and risks placed-in-service windows for the §45U credit. This is the single largest driver of the archetype's risk. Hedge the licensing milestones as a ladder: ASER, FSER, then the construction permit itself.","weekly":weekly(72,89),
  "events":[{"date":"2026-10-31","when":"+157d","kind":"filing","future":True,"now":True,"title":"BWRX-300 Advance Safety Evaluation Report","detail":"Whether the NRC issues the ASER for the BWRX-300 construction-permit review."},
            {"date":"2026-11-30","when":"+187d","kind":"filing","future":True,"title":"BWRX-300 Final Safety Evaluation Report","detail":"Whether the NRC issues the FSER for TVA's BWRX-300."},
            {"date":"2027-12-31","when":"+583d","kind":"deadline","future":True,"title":"BWRX-300 construction permit","detail":"Whether the NRC issues the construction permit for TVA's BWRX-300 SMR."}],
  "news":[],
  "hedges":[hedge("will-the-nrc-issue-an-advance-safety-evaluation-report-aser-for-the-bwrx-300-con","Will the NRC issue an Advance SER for the BWRX-300 construction review?",0.42,"2026-10-31",260000),
            hedge("will-the-nrc-issue-a-final-safety-evaluation-report-fser-for-tva-s-bwrx-300-smal","Will the NRC issue a Final SER for TVA's BWRX-300 SMR?",0.38,"2026-11-30",240000),
            hedge("will-the-nrc-issue-a-construction-permit-for-tva-s-bwrx-300-small-modular-reacto","Will the NRC issue a construction permit for TVA's BWRX-300 SMR?",0.28,"2027-12-31",340000)]},
 "ns2":{"subtitle":"The §45U production credit is the economic spine of the SMR thesis; FEOC gating or a narrower-than-expected rule resets the model.","tracked_since":"Jan 20, 2026","last_updated":"6 hr ago","attention_delta":9,"probability_delta":0.03,"hedge_cost":6000,
  "view":"OBBBA's §45U nuclear production tax credit is what makes a FOAK SMR pencil at all — the market prices the credit surviving as enacted at 0.68. The downside is in the fine print: Treasury is expected to issue §45U regulations requiring nuclear FEOC compliance (0.20), and a final FEOC rule that explicitly prohibits prohibited-entity fuel or components (0.15) would gate eligibility for projects whose supply chain isn't fully de-risked. For a developer modeling the credit at face value, a FEOC haircut is a direct revenue-side hit to the levelized economics. We model 0.32 the credit is narrowed or FEOC-gated in a way that bites. Hedge the FEOC rulemaking pair against the credit-survival contract.","weekly":weekly(64,74),
  "events":[{"date":"2026-12-31","when":"+218d","kind":"deadline","future":True,"now":True,"title":"§45U FEOC rulemaking","detail":"Whether Treasury issues §45U regulations requiring nuclear FEOC compliance."},
            {"date":"2027-12-31","when":"+583d","kind":"deadline","future":True,"title":"§45U credit survival","detail":"Whether the §45U nuclear PTC remains in force as enacted under OBBBA."}],
  "news":[],
  "hedges":[hedge("will-the-section-45u-nuclear-production-tax-credit-irc-45u-as-enacted-under-the-","Will the §45U nuclear PTC remain in force as enacted under OBBBA?",0.68,"2027-12-31",300000),
            hedge("will-treasury-issue-proposed-or-final-regulations-under-obbba-45u-requiring-nucl","Will Treasury issue §45U regulations requiring nuclear FEOC compliance?",0.20,"2026-12-31",180000),
            hedge("will-treasury-s-final-feoc-regulations-under-obbba-section-45u-explicitly-prohib","Will Treasury's final §45U FEOC rule explicitly prohibit prohibited-entity supply?",0.15,"2026-12-31",140000)]},
 "ns3":{"subtitle":"SMR fuel supply runs through a thin, partly-sanctioned enrichment market; a Russian-import disruption or HALEU shortfall raises fuel cost and schedule risk.","tracked_since":"Feb 3, 2026","last_updated":"9 hr ago","attention_delta":7,"probability_delta":0.02,"hedge_cost":4500,
  "view":"Nuclear fuel security is back as a first-order risk. The Prohibiting Russian Uranium Imports Act bans Russian LEU but leans on DOE waivers to bridge supply — the market prices a 2026 waiver extension at 0.38, and a 0.18 chance Congress amends the statute. Meanwhile domestic enrichment capacity is only now docketing (Orano's complete enrichment-facility application at 0.55). For an SMR, the HALEU-adjacent supply question compounds the cost picture: tight enrichment plus uncertain waivers means fuel-cost and delivery-timing risk that a developer can't fully contract away yet. We model 0.45 of a meaningful fuel-supply squeeze over the horizon. Hedge the waiver, the statutory-amendment, and the domestic-capacity contracts together — they bracket the supply path.","weekly":weekly(60,68),
  "events":[{"date":"2026-12-31","when":"+218d","kind":"deadline","future":True,"now":True,"title":"DOE Russian-uranium waiver extension","detail":"Whether DOE grants or extends a waiver under the Prohibiting Russian Uranium Imports Act for 2026."},
            {"date":"2026-12-31","when":"+218d","kind":"filing","future":True,"title":"Orano enrichment-facility docketing","detail":"Whether the NRC formally accepts Orano's complete enrichment-facility application for docketing."},
            {"date":"2027-12-31","when":"+583d","kind":"deadline","future":True,"title":"Russian-uranium statute amendment","detail":"Whether Congress passes legislation amending the Prohibiting Russian Uranium Imports Act."}],
  "news":[],
  "hedges":[hedge("will-doe-grant-or-extend-a-waiver-under-the-prohibiting-russian-uranium-imports-","Will DOE grant or extend a Russian-uranium import waiver for 2026?",0.38,"2026-12-31",220000),
            hedge("will-the-nrc-formally-accept-for-docketing-orano-s-complete-enrichment-facility-","Will the NRC accept Orano's complete enrichment-facility application for docketing?",0.55,"2026-12-31",160000),
            hedge("will-congress-pass-legislation-amending-the-prohibiting-russian-uranium-imports-","Will Congress amend the Prohibiting Russian Uranium Imports Act?",0.18,"2027-12-31",120000)]},
 "ns4":{"subtitle":"The Trump nuclear push depends on the NRC actually modernizing its licensing framework; if Part 53 and the EO 14300 overhaul stall, the schedule tailwind evaporates.","tracked_since":"Feb 9, 2026","last_updated":"1 day ago","attention_delta":5,"probability_delta":0.0,"hedge_cost":3500,
  "view":"The bull case for SMR deployment assumes the NRC's licensing machinery gets faster — that's the whole point of EO 14300's mandated wholesale regulatory revision and the risk-informed Part 53 framework. But these are hard rulemakings: the market prices a final Part 53 rule at only 0.42, the EO 14300 wholesale revision producing a final rule at 0.18, and the Part 37 physical-protection modernization at 0.25. If these slip, the implicit schedule acceleration in a developer's model doesn't materialize, and licensing reverts to the slow historical baseline. This is a softer, slower-burning version of n1 — framework risk rather than a single milestone. Hedge the Part 53 and EO 14300 contracts as the cleanest proxies for the modernization thesis.","weekly":weekly(56,61),
  "events":[{"date":"2027-06-30","when":"+765d","kind":"deadline","future":True,"now":True,"title":"EO 14300 wholesale regulatory revision","detail":"Whether the NRC's EO 14300-mandated revision results in a final rule."},
            {"date":"2027-12-31","when":"+583d","kind":"deadline","future":True,"title":"Part 53 licensing framework","detail":"Whether the NRC publishes a final Part 53 risk-informed, technology-inclusive licensing rule."}],
  "news":[],
  "hedges":[hedge("will-the-nrc-publish-a-final-part-53-risk-informed-technology-inclusive-licensin","Will the NRC publish a final Part 53 risk-informed licensing rule?",0.42,"2027-12-31",200000),
            hedge("will-the-nrc-s-eo-14300-mandated-wholesale-regulatory-revision-result-in-a-final","Will the NRC's EO 14300 wholesale revision produce a final rule?",0.18,"2027-06-30",150000),
            hedge("will-nrc-publish-a-final-rule-modernizing-10-cfr-part-37-physical-protection-req","Will the NRC finalize 10 CFR Part 37 physical-protection modernization?",0.25,"2026-12-31",110000)]},
 "ns5":{"subtitle":"A FOAK SMR needs a financing close — typically a DOE loan guarantee — to reach FID; failure to close strands the project at the development stage.","tracked_since":"Jan 28, 2026","last_updated":"7 hr ago","attention_delta":8,"probability_delta":0.02,"hedge_cost":5500,
  "view":"First-of-a-kind nuclear is uninvestable on a pure-merchant basis — the capital stack leans on federal credit support, and the DOE loan-guarantee close is the financing gate to FID. The cleanest live proxy is the DOE conditionally closing its loan guarantee to SHINE Medical (0.35), a comparable advanced-nuclear DOE-finance test case. A 0.35 conditional-close probability implies roughly 0.65 that the broader FOAK-financing path stays uncertain over the horizon, which is why we tag this high. Without the loan support, the project's WACC and equity check both balloon. Hedge the DOE conditional-close contract as the financing-readiness signal.","weekly":weekly(60,71),
  "events":[{"date":"2026-09-30","when":"+126d","kind":"deadline","future":True,"now":True,"title":"DOE loan-guarantee conditional close","detail":"Whether DOE conditionally closes its loan guarantee to SHINE Medical Technologies (advanced-nuclear finance proxy)."}],
  "news":[],
  "hedges":[hedge("will-the-doe-conditionally-close-on-its-loan-guarantee-to-shine-medical-technolo","Will DOE conditionally close its loan guarantee to SHINE Medical (advanced-nuclear finance proxy)?",0.35,"2026-09-30",300000)]},
 "ns6":{"subtitle":"An injunction or stay of NRC proceedings would freeze the licensing critical path regardless of the merits — a low-probability, high-impact tail.","tracked_since":"Feb 18, 2026","last_updated":"2 days ago","attention_delta":1,"probability_delta":0.0,"hedge_cost":2500,
  "view":"Nuclear licensing has always attracted litigation, and a court order is the one event that can halt the critical path outright. The market prices a federal preliminary injunction or stay of NRC proceedings at just 0.04, and a DC Circuit ruling for petitioners in the Beyond Nuclear / Sierra Club line at 0.08 — genuine tails. But the impact if either lands is severe: a stay freezes the whole schedule and the carrying cost continues to accrue. We model 0.10 combined. This is cheap protection against a low-frequency, high-severity legal shock; size it small. Hedge the injunction and the DC Circuit contracts together.","weekly":weekly(40,42),
  "events":[{"date":"2026-12-31","when":"+218d","kind":"hearing","future":True,"now":True,"title":"NRC injunction / stay window","detail":"Whether a federal court issues a preliminary injunction or stay of NRC proceedings."},
            {"date":"2026-12-31","when":"+218d","kind":"hearing","future":True,"title":"DC Circuit Beyond Nuclear ruling","detail":"Whether the DC Circuit rules for petitioners in the Beyond Nuclear / Sierra Club challenge."}],
  "news":[],
  "hedges":[hedge("will-a-federal-court-issue-a-preliminary-injunction-or-stay-of-nrc-proceedings-f","Will a federal court issue a preliminary injunction or stay of NRC proceedings?",0.04,"2026-12-31",120000),
            hedge("will-the-u-s-court-of-appeals-for-the-dc-circuit-rule-in-beyond-nuclear-and-sier","Will the DC Circuit rule for petitioners in the Beyond Nuclear / Sierra Club challenge?",0.08,"2026-12-31",100000)]},
 "ns7":{"subtitle":"NRC and DOE both depend on appropriations; a federal shutdown stalls reviews, dockets, and loan processing across the board.","tracked_since":"Mar 4, 2026","last_updated":"1 day ago","attention_delta":3,"probability_delta":0.0,"hedge_cost":3000,
  "view":"The NRC's licensing reviews and DOE's loan processing are appropriations-dependent, so a federal government shutdown is a generic-but-real delay vector for a pre-construction SMR. The market prices a shutdown delaying construction permits and infrastructure approvals at 0.35. Unlike n1, this isn't project-specific — it hits every milestone in flight simultaneously — but for an asset whose entire value is on the regulatory critical path, even a multi-week freeze has measurable carrying-cost drag. Hedge the shutdown-delay contract as a portfolio-level timing overlay.","weekly":weekly(52,55),
  "events":[{"date":"2026-12-31","when":"+218d","kind":"deadline","future":True,"now":True,"title":"Shutdown-delay measurement window","detail":"Whether a federal government shutdown delays construction permits and infrastructure approvals."}],
  "news":[],
  "hedges":[hedge("will-a-federal-government-shutdown-delay-construction-permits-and-infrastructure","Will a federal government shutdown delay construction permits and infrastructure approvals?",0.35,"2026-12-31",180000)]},
}

news=[
 {"source":"NRC","ago":"3 hr ago","tag":"operational","title":"BWRX-300 construction-permit review advances toward Advance SER milestone","sum":"The ASER is the next gate on TVA's Clinch River SMR; timing sets the whole FOAK schedule.","published_at":"2026-05-27T13:00:00Z"},
 {"source":"TREASURY","ago":"6 hr ago","tag":"policy","title":"§45U FEOC rulemaking expected to define prohibited-entity fuel and component thresholds","sum":"A FEOC gate on the nuclear PTC would reshape SMR levelized economics.","published_at":"2026-05-27T10:30:00Z"},
 {"source":"DOE","ago":"1 day ago","tag":"trade","title":"Russian-uranium waiver cap and HALEU buildout dominate fuel-security outlook","sum":"Domestic enrichment is docketing but thin; waivers bridge a constrained supply window.","published_at":"2026-05-26T15:00:00Z"},
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
json.dump(bundle,open("public/data/nuclear-smr.json","w"),indent=2)
print(f"nuclear-smr: composite {comp}, {len(risks)} risks, {meta['risks_high']} high")
print("wrote public/data/nuclear-smr.json")
