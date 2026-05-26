#!/usr/bin/env python3
"""
Rewrite offshore-wind.json hedge tickers from fabricated placeholders to real
synthetic_contract_library slugs. Preserves each hedge's display title and
notional; updates ticker + yes (live library price) + expiry.

Mapping is curated: each placeholder → the library contract that best matches
the same underlying risk question.
"""
import json

# placeholder ticker -> (real slug, yes, expiry_date)
MAP = {
    # ow1 — BOEM/COP freeze & moratorium
    "library-ef7635e4-96cc-479e-827d-d5fc6d04ca04": ("will-the-trump-administration-lift-the-january-2025-offshore-wind-project-morato", 0.323, "2026-06-30"),
    "synthetic-doi-order-offshore-wind-delay":       ("will-the-december-22-2025-trump-administration-offshore-wind-pause-citing-nation", 0.45, "2026-12-31"),
    "synthetic-boem-offshore-wind-trump-policy":     ("will-boem-formally-lift-the-trump-administration-s-january-2025-offshore-wind-le", 0.18, "2026-12-31"),
    "synthetic-first-circuit-wind-moratorium-ruling":("will-federal-courts-issue-final-rulings-permanently-blocking-boem-s-december-202", 0.645, "2026-09-30"),
    # ow2 — stop-work / injunction (reuse the court-blocking + moratorium contracts)
    "synthetic-boem-stop-work-injunction":           ("will-federal-courts-issue-final-rulings-permanently-blocking-boem-s-december-202", 0.645, "2026-09-30"),
    "synthetic-empire-wind-ocs-a-0512-injunction":   ("will-the-december-22-2025-trump-administration-offshore-wind-pause-citing-nation", 0.45, "2026-12-31"),
    # ow3 — Section 232 steel
    "library-50-pct-steel-aluminum-tariff-continuity":("will-section-232-tariffs-on-steel-and-aluminum-be-reduced-below-25-by-september-", 0.08, "2026-09-30"),
    "library-section-232-tariff-reduction":          ("will-section-232-steel-and-aluminum-tariffs-be-reduced-below-40-by-september-30-", 0.07, "2026-09-30"),
    "library-section-232-derivatives-expansion":     ("will-section-232-derivative-product-coverage-be-expanded-to-include-additional-f", 0.08, "2026-06-30"),
    "KXTARIFFREVENUE-26DEC31-T200":                  ("will-section-232-derivative-product-coverage-be-expanded-to-include-additional-f", 0.08, "2026-06-30"),
    # ow4 — Jones Act WTIV
    "kalshi-KXJONESACTREPEAL-27-JAN04":              ("will-the-march-18-2026-jones-act-noncontiguous-shipping-waiver-be-formally-exten", 0.38, "2026-07-31"),
    "poly-1516727":                                  ("will-the-trump-administration-issue-a-presidential-jones-act-waiver-covering-lng", 0.03, "2026-12-31"),
    # ow5 — 45Y/48E narrowing
    "synthetic-obbba-45y-48e-repeal-recon":          ("will-congress-pass-legislation-restoring-section-45y-ptc-or-section-48e-itc-for-", 0.355, "2026-12-31"),
    "synthetic-obbba-offshore-wind-domestic-content-55":("will-treasury-issue-final-regulations-setting-the-offshore-wind-domestic-content", 0.632, "2027-03-31"),
    "synthetic-treasury-feoc-offshore-wind-2026":    ("will-irs-delays-in-issuing-final-feoc-guidance-for-sections-48e-45y-extend-beyon", 0.507, "2026-07-15"),
    "synthetic-48e-domestic-content-27pct-compliance":("will-treasury-issue-final-guidance-under-obbba-45y-48e-45x-feoc-material-assista", 0.25, "2026-12-31"),
    "KX48ETAXCREDIT-26MAY":                          ("will-irs-delays-in-issuing-final-feoc-guidance-for-sections-48e-45y-extend-beyon", 0.507, "2026-07-15"),
    # ow6 — FEOC domestic content (shares ow5 contracts)
    # (handled by same keys above; ow6 hedges reference the two below)
    # ow7 — right whale / NMFS
    "synthetic-house-naturalresources-rightwhale-hearing":("will-noaa-publish-the-right-whale-vessel-speed-anprm-with-35-65-foot-vessel-exem", 0.25, "2026-06-30"),
    "synthetic-noaa-rightwhale-anprm-publication":   ("will-fws-and-nmfs-finalize-proposed-esa-interagency-consultation-revisions-docke", 0.38, "2026-12-31"),
    # ow8 — Atlantic Shores EPA EAB
    "synthetic-atlantic-shores-epa-permit-resolution":("will-the-epa-environmental-appeals-board-issue-a-final-decision-on-the-remanded-", 0.35, "2026-12-31"),
    "synthetic-atlantic-shores-eab-remand-timeline": ("will-the-epa-environmental-appeals-board-deny-the-region-2-remand-request-and-re", 0.08, "2026-09-30"),
    # ow9 — OREC solicitations
    "synthetic-nyserda-orecrfp25-solicitation":      ("will-nyserda-issue-and-complete-a-successor-offshore-wind-solicitation-to-orecrf", 0.2, "2026-12-31"),
    "synthetic-new-york-offshore-wind-policy-continuation":("will-nyserda-issue-and-complete-a-successor-offshore-wind-solicitation-to-orecrf", 0.2, "2026-12-31"),
    "synthetic-nj-bpu-atlantic-shores-solicitation": ("will-the-new-jersey-board-of-public-utilities-reopen-an-offshore-wind-solicitati", 0.08, "2026-12-31"),
}

MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
def expiry_human(d):
    y,m,_ = d.split("-")
    return f"{MONTHS[int(m)-1]} {y}"

b = json.load(open("public/data/offshore-wind.json"))
changed = 0
unmapped = []
for rid, d in b["risk_details"].items():
    for h in d.get("hedges", []):
        old = h["ticker"]
        if old in MAP:
            slug, yes, exp = MAP[old]
            h["ticker"] = slug
            h["yes"] = yes
            h["change"] = 0.0
            h["expiry"] = expiry_human(exp)
            changed += 1
        else:
            unmapped.append(f"{rid}:{old}")

json.dump(b, open("public/data/offshore-wind.json","w"), indent=2)
print(f"rewrote {changed} hedge tickers")
if unmapped:
    print("UNMAPPED:", unmapped)
else:
    print("all hedges mapped to real slugs")
