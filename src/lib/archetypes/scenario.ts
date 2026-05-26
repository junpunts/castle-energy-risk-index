/**
 * Scenario model — re-projects authored risk impacts onto a user-adjusted
 * "what-if" version of the typical project.
 *
 * ── Design principle ──────────────────────────────────────────────────────
 * The authored impact_irr / impact_usd on each risk are an analyst's judgment
 * AT THE REFERENCE SCENARIO (the bundle's archetype.typical). We treat those
 * as the calibration point: back out an implied shock parameter, then re-apply
 * it at the user's inputs. We never invent magnitudes — we re-scale the
 * analyst's call onto a differently-sized deal.
 *
 * What recomputes (deal economics):
 *   - each risk's impact_usd and impact_irr
 *   - the waterfall (base = target IRR, per-risk drag, stressed endpoint)
 *   - the composite score
 *   - hedge notional sizing
 *
 * What stays fixed (world facts): probability, attention, news, catalyst
 * dates, hedge market prices. The scenario never touches these.
 *
 * ── Driver model ──────────────────────────────────────────────────────────
 * Each risk reacts to inputs differently depending on its `driver`:
 *
 *   cost    — a capex-denominated shock (tariffs, AD/CVD, steel). The dollar
 *             hit scales linearly with capex. Because IRR drag is ~the ratio
 *             of an incremental cost to the project's value, it is ~invariant
 *             to project SIZE but does move with the target-IRR baseline.
 *   delay   — a schedule shock (interconnection, permitting, stop-work). NPV
 *             erosion per month of slip scales with cost-of-capital (target
 *             IRR) and the COD timeline. Dollar hit also scales with capex.
 *   revenue — an offtake/merchant shock (curtailment, OREC, PPA). Scales with
 *             the revenue base ≈ capacity × PPA price.
 *
 * Defaults when `driver` is absent: policy/trade→cost, operational→delay,
 * market→revenue.
 */

import type { ArchetypeBundle, Risk, TypicalProject } from '@/lib/schemas'
import { deriveComposite } from '@/lib/archetypes/derive'

export type Driver = 'cost' | 'delay' | 'revenue'

export interface ScenarioInputs {
  /** Nameplate capacity, archetype-native unit magnitude (e.g. MWdc value). */
  capacity: number
  /** Total project capex, USD. */
  capex: number
  /** Target equity IRR, decimal (0.09 = 9%). */
  target_irr: number
  /** Months from FID to COD. */
  cod_months: number
  /** PPA price $/MWh, or null for non-PPA archetypes. */
  ppa_price: number | null
}

export interface ScenarioRisk {
  id: string
  impact_irr: number
  impact_usd: number
  /** Probability-weighted IRR drag (always ≥0), used by the waterfall. */
  weighted_drag: number
}

export interface ScenarioResult {
  risks: ScenarioRisk[]
  composite: number
  baseIRR: number
  stressedIRR: number
  totalDrag: number
}

/** Resolve a risk's driver, falling back to a category default. */
export function driverFor(risk: Risk): Driver {
  if (risk.driver) return risk.driver
  switch (risk.category) {
    case 'operational':
      return 'delay'
    case 'market':
      return 'revenue'
    default:
      return 'cost' // policy, trade
  }
}

/** Pull the reference scenario from a bundle's typical project. */
export function referenceInputs(typical: TypicalProject): ScenarioInputs {
  return {
    capacity: parseCapacity(typical.capacity),
    capex: typical.capex,
    target_irr: typical.target_irr,
    cod_months: typical.cod_months,
    ppa_price: typical.ppa_price,
  }
}

/** Best-effort numeric capacity from the display string ("200 MWdc" → 200). */
export function parseCapacity(s: string): number {
  const m = s.replace(/,/g, '').match(/[\d.]+/)
  return m ? Number(m[0]) : 1
}

/**
 * Re-project one risk's impact from the reference scenario onto `inp`.
 * `ref` is the reference inputs; the risk's authored values are the calibration.
 */
function projectRisk(
  risk: Risk,
  ref: ScenarioInputs,
  inp: ScenarioInputs,
): { impact_irr: number; impact_usd: number } {
  const driver = driverFor(risk)
  const irr0 = risk.impact_irr // ≤0
  const usd0 = risk.impact_usd // ≥0

  // Ratios vs reference. Guard against div-by-zero.
  const rCapex = safeRatio(inp.capex, ref.capex)
  const rIrr = safeRatio(inp.target_irr, ref.target_irr)
  const rCod = safeRatio(inp.cod_months, ref.cod_months)
  const rRev = safeRatio(
    inp.capacity * (inp.ppa_price ?? 1),
    ref.capacity * (ref.ppa_price ?? 1),
  )

  let irr = irr0
  let usd = usd0

  switch (driver) {
    case 'cost':
      // Dollar hit scales with capex. IRR drag ~invariant to size, but a
      // higher target IRR slightly raises the opportunity cost of the hit.
      usd = usd0 * rCapex
      irr = irr0 * lerpToward(rIrr, 0.4) // muted sensitivity to IRR
      break
    case 'delay':
      // NPV erosion per month scales with cost-of-capital × timeline.
      // Dollar hit also scales with capex.
      irr = irr0 * rIrr * rCod
      usd = usd0 * rCapex * rCod
      break
    case 'revenue':
      // Offtake/merchant shock scales with the revenue base.
      usd = usd0 * rRev
      irr = irr0 * lerpToward(rRev, 0.6) // revenue hit erodes equity return
      break
  }

  // Clamp to schema-valid ranges.
  irr = Math.min(0, irr)
  usd = Math.max(0, usd)
  return { impact_irr: round1(irr), impact_usd: Math.round(usd) }
}

/**
 * Compute a full scenario result for a bundle at the given inputs.
 * Probabilities come straight from the (unchanged) risks.
 */
export function computeScenario(
  bundle: ArchetypeBundle,
  inp: ScenarioInputs,
): ScenarioResult {
  const ref = referenceInputs(bundle.archetype.typical)

  const scRisks: ScenarioRisk[] = bundle.risks.map((r) => {
    const { impact_irr, impact_usd } = projectRisk(r, ref, inp)
    return {
      id: r.id,
      impact_irr,
      impact_usd,
      weighted_drag: Math.abs(impact_irr * r.probability),
    }
  })

  // Composite reuses the canonical formula, fed the scenario impacts.
  const compositeRisks: Risk[] = bundle.risks.map((r, i) => ({
    ...r,
    impact_irr: scRisks[i].impact_irr,
  }))
  const composite = deriveComposite(compositeRisks, inp.target_irr)

  const totalDrag = scRisks.reduce((s, r) => s + r.weighted_drag, 0)
  const baseIRR = inp.target_irr * 100
  const stressedIRR = baseIRR - totalDrag

  return { risks: scRisks, composite, baseIRR, stressedIRR, totalDrag }
}

/**
 * Scale a hedge's suggested notional with project capex. A 2× project needs
 * ~2× the hedge to cover the same proportional exposure.
 */
export function scaleNotional(
  notional: number,
  ref: ScenarioInputs,
  inp: ScenarioInputs,
): number {
  const scaled = notional * safeRatio(inp.capex, ref.capex)
  // Round to a clean $5k step for display.
  return Math.max(0, Math.round(scaled / 5000) * 5000)
}

// ── helpers ────────────────────────────────────────────────────────────────
function safeRatio(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 1
  return a / b
}
/** Move a ratio partway toward 1 — damps sensitivity for second-order effects. */
function lerpToward(ratio: number, strength: number): number {
  return 1 + (ratio - 1) * strength
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}
