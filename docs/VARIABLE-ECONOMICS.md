# Variable Project Economics — Methodology (review draft, NOT yet built)

**Status:** design artifact for review. No code changed. Pressure-test this before
we build the recompute engine or any UI.

---

## 0. The question we're answering

The dashboard shows a "typical project" (capacity, capex, target IRR, COD, PPA) and,
per risk, an `impact_irr` (IRR pp drag) and `impact_usd` (dollars at risk). Today those
impacts are **authored scalars** — a human typed them. Nothing connects them to the
typical-project inputs, so changing an input changes nothing downstream.

Goal: let a client change the inputs and have the **deal economics** recompute, while
**world facts stay fixed**. (Bucketing confirmed in prior discussion: inputs → recompute
deal economics → leave probabilities / news / catalyst dates / hedge prices static.)

---

## 1. The load-bearing discovery: the two impacts are NOT independent

I tested whether `impact_irr` and `impact_usd` are internally consistent by computing,
for every risk, `k = |impact_irr| / (impact_usd / capex × 100)` — i.e. "IRR points of
drag per 1% of capex at risk."

| Archetype | mean k | spread | reads as |
|---|---|---|---|
| utility-solar | **0.136** | 0.133–0.139 | tight, consistent |
| natural-gas | **0.127** | 0.125–0.130 | tight, consistent |
| offshore-wind | 0.281 | **0.217–0.341** | inconsistent / hand-authored |

**Interpretation:** for solar and gas, the impacts already obey a near-constant linear
law — `impact_irr ≈ k · (impact_usd / capex)`. That's not a coincidence; it means a
dollar shock of X% of capex maps to a predictable IRR hit, where `k` is an
**archetype-level capital-structure constant** (gas's lower k reflects its higher
target IRR / different cash-flow profile vs solar).

**Two consequences:**
1. We don't have to model `impact_irr` and `impact_usd` separately. One is primary
   (driver-specific), the other follows via `k`. This collapses the model to one
   degree of freedom per risk — much harder to get wrong.
2. **Offshore-wind's numbers are internally inconsistent** (k ranges 0.22–0.34). They
   were authored by hand before any model existed. Reprojection will *regularize* them —
   a side benefit, but also a flag: we should re-baseline OW's impacts to a consistent
   k as part of this work, or its waterfall will keep looking subtly off.

---

## 2. Calibrate-then-reproject (the core honesty move)

We never overwrite the analyst's judgment. We **read** it as a shock parameter at the
current ("reference") inputs, hold that parameter fixed, and **reproject** it onto the
client's inputs.

For each risk:

```
Step A (calibrate, done once from the stored bundle at reference inputs):
   back out the risk's intrinsic shock parameter from its authored impact.

Step B (reproject, runs live in the browser on every slider move):
   apply that fixed parameter at the client's new inputs → new impact_usd
   → new impact_irr via the archetype k → deriveAll() cascades composite, waterfall, etc.
```

The reference inputs and the authored impacts are the **anchor**. At reference inputs,
reprojection returns exactly the authored numbers (by construction). Move a slider and
you see the analyst's judgment *extrapolated*, not a fresh fabrication.

---

## 3. The three drivers (one new field: `risk.driver`)

Each risk gets tagged with how its shock scales. This is where my economic judgment
enters — **this table is the thing to review.**

### cost — shock is a dollar cost (tariffs, duties, FEOC disqualification, steel)
- **Calibrate:** `cost_fraction = impact_usd / capex` (the % of capex this risk puts at risk)
- **Reproject:** `impact_usd' = cost_fraction × capex'` ; `impact_irr' = -k × cost_fraction × 100`
- **Behavior:** scale the project 2× → dollar loss ~2×, **IRR drag ~unchanged** (a cost
  that's 22% of capex is 22% of a bigger capex). Target-IRR change barely moves a pure
  cost drag (it mostly moves the baseline bar). ✔ matches intuition.

### delay — shock is months of schedule slip (interconnection, permitting, FERC, stop-work)
- **Calibrate:** treat authored `impact_irr` as the drag from an implied slip at reference
  COD and reference target IRR. Back out `delay_severity = |impact_irr| / (cod_ref × r_ref)`.
- **Reproject:** `impact_irr' = -delay_severity × cod' × r'`  (longer build and/or higher
  cost of capital → more NPV erosion per month of slip) ; `impact_usd'` follows via k and capex.
- **Behavior:** raise target IRR 9%→12% → delay risks bite harder; lengthen COD → same. ✔

### revenue — shock is $/MWh or volume at risk (curtailment, OREC re-opener, PPA, Henry Hub spark)
- **Calibrate:** `rev_fraction = impact_usd / (capacity × ppa × ref_factor)` — share of
  lifetime revenue at risk.
- **Reproject:** `impact_usd' ∝ capacity' × ppa'` ; `impact_irr'` via k.
- **Behavior:** bigger plant or higher PPA → more revenue exposed → larger $ and IRR hit. ✔

---

## 4. Proposed per-risk driver tags (REVIEW THIS)

### utility-solar
| risk | title | proposed driver | why |
|---|---|---|---|
| us1 | AD/CVD Solar IV orders | **cost** | duty applied to module capex |
| us2 | Chinese panel tariffs >60% | **cost** | module cost shock |
| us3 | 48E/45Y FEOC guidance delay | **cost** | credit value at risk = $ of capex |
| us4 | UFLPA detentions widen | **delay** | held shipments slip COD (could argue cost) |
| us5 | Interconnection queue >2yr | **delay** | pure schedule |
| us6 | ERCOT curtailment >25% | **revenue** | lost MWh revenue |
| us7 | LONGi Prohibited Foreign Entity | **cost** | re-sourcing cost / lost credit |

### natural-gas
| risk | title | proposed driver | why |
|---|---|---|---|
| ng1 | LNG export auth stall | **revenue** | demand-side → offtake/price |
| ng2 | CP2 remanded | **delay** | terminal/pipeline schedule |
| ng3 | FERC pipeline >18mo | **delay** | pure schedule |
| ng4 | Henry Hub >$5 | **revenue** | spark-spread / fuel margin (revenue-side) |
| ng5 | EPA turbine rule delay | **delay** | permitting schedule |
| ng6 | PJM capacity shortfall | **revenue** | capacity-market revenue (note: upside risk) |
| ng7 | NEPA cat-ex injunction | **delay** | re-imposed review schedule |

### offshore-wind (also needs k re-baselining — see §1)
| risk | title | proposed driver | why |
|---|---|---|---|
| ow1 | EO 14154 / COP freeze | **delay** | approval freeze = schedule |
| ow2 | Mid-construction stop-work | **delay** | schedule |
| ow3 | Section 232 steel | **cost** | monopile/tower steel cost |
| ow4 | Jones Act WTIV | **cost** | vessel premium / feeder cost |
| ow5 | 45Y/48E narrowing | **cost** | credit value at risk |
| ow6 | FEOC domestic-content | **cost** | credit disqualification |
| ow7 | NEPA/ESA right whale | **delay** | consultation schedule |
| ow8 | OCS clean air EAB remand | **delay** | permit schedule |
| ow9 | OREC pricing re-opener | **revenue** | offtake price |

**Judgment calls worth challenging:**
- **us4 (UFLPA)** — I called it delay (held containers slip COD), but it's arguably cost
  (re-sourcing premium). Which framing do you want clients to see?
- **ng4 (Henry Hub) / ng6 (PJM capacity)** — these are *symmetric/upside* risks (a spike
  can help a merchant gas plant; a capacity shortfall raises its revenue). Our model only
  expresses downside drag. Do we (a) keep modeling them as downside-only, (b) flag them as
  "two-sided" and exclude from the IRR waterfall, or (c) build signed impacts? I lean (a)
  for v1 with a footnote, but it's a real modeling stance.
- **ng1 (LNG)** — tagged revenue (demand thesis), but it's upstream of price; could be its
  own "demand" driver later.

---

## 5. What the backend needs (readiness)

| piece | status | work |
|---|---|---|
| input surface (`typical`) | ✅ exists, structured/numeric | none |
| derive hook (`deriveAll`) | ✅ exact right pattern; composite already cascades from impacts | none |
| read path | ✅ clean | none |
| **`risk.driver` field** | ❌ missing | 1 additive, backward-compatible enum field |
| **archetype `k` constant** | ❌ implicit | store per-archetype (or derive from current data) |
| **`projectImpacts(bundle, inputs)`** | ❌ doesn't exist | 1 pure function — the engine |
| reference inputs | ✅ = current `typical` | freeze a copy as `typical_ref` so calibration is stable if someone edits `typical` |
| persistence (saved scenarios) | n/a for Tier 1 | client-side only; nothing touches DB |

**Verdict:** architecture is ~70% there. The missing 30% is one schema field, one stored
constant, and one pure function. No re-plumb. Tier 1 (client-side what-if) writes nothing
to the DB — the recompute runs in the browser against the bundle already on the page.

---

## 6. Guardrails (non-negotiable for credibility)

1. **Reference case is labeled "Castle vetted." What-if output is labeled "modeled / your
   inputs."** A client must never confuse an extrapolated slider number with a vetted one.
2. **Reprojection is first-order.** We surface a short "model assumptions" note: linear
   capex scaling, k held constant, probabilities/timing unchanged. No hidden black box.
3. **Probabilities, news, catalyst dates, hedge prices NEVER move** with the sliders.
   Hedge *notional* (sizing) does scale — it's a function of project size.
4. **Bounds.** Clamp inputs to sane ranges so a client can't drive IRR negative-infinity
   and screenshot nonsense.

---

## 7. Open decisions for you

1. **Driver tags (§4)** — sign off, or adjust the flagged ones (us4, ng4, ng6).
2. **Two-sided risks (ng4, ng6)** — downside-only with footnote (my lean), or exclude
   from waterfall, or build signed impacts?
3. **Offshore-wind k re-baseline** — fix OW's inconsistent impacts to a constant k as part
   of this (recommended — its waterfall is subtly wrong today), or leave OW authored and
   only reproject solar/gas?
4. **k source** — store an explicit per-archetype `irr_capex_k` (cleaner, reviewable) vs.
   derive it live from the current data (zero new field, but fragile if data drifts)?
5. **Scope confirm** — Tier 1 client-side what-if first (recommended), Tier 2 saved
   scenarios deferred?

Once these are settled, the build order is: (a) add `driver` + `k` + `typical_ref` to the
schema and backfill, (b) write + unit-test `projectImpacts()` against the reference case
(must return authored numbers exactly at reference inputs), (c) build the what-if panel UI.
