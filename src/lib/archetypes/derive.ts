import type { ArchetypeBundle, Risk } from '@/lib/schemas'

/**
 * Pure functions that compute derived fields from the underlying data.
 *
 * The agent + admin both call these on every apply, so derived fields stay
 * consistent with their underlying risks/news. Edit only the formulas; the
 * call sites (apply_archetype_revision wrapper) re-call deriveAll() on every
 * mutation.
 */

/** Composite score, 0–100. */
export function deriveComposite(risks: Risk[], targetIrr: number): number {
  if (risks.length === 0) return 0
  // Σ (probability × |impact_irr|) divided by (target_irr × risks.length),
  // scaled to 0–100. Calibration constant chosen so offshore-wind seed → 71.
  const expectedDrag = risks.reduce(
    (s, r) => s + r.probability * Math.abs(r.impact_irr),
    0,
  )
  const denom = targetIrr * 100 * risks.length // target_irr is decimal; ×100 to pct
  const raw = expectedDrag / Math.max(0.001, denom)
  // Calibration: offshore-wind seed values produce ~0.13944; ×509 lands 71.
  // The constant is empirical per archetype, but a single constant works
  // adequately across the current 6 archetype shapes. Tuneable in lib/policy.
  const calibrated = Math.round(raw * 509)
  return Math.max(0, Math.min(100, calibrated))
}

/** Count of risks where likelihood='high'. */
export function deriveRisksHigh(risks: Risk[]): number {
  return risks.filter((r) => r.likelihood === 'high').length
}

/** Total risk count. */
export function deriveRisksTotal(risks: Risk[]): number {
  return risks.length
}

/**
 * news_this_week: NewsItem.published_at within the last 7 days. Falls back to
 * the array length if items don't carry published_at (seed data).
 */
export function deriveNewsThisWeek(bundle: ArchetypeBundle): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  if (bundle.news.length === 0) return 0
  const withDates = bundle.news.filter((n) => n.published_at)
  if (withDates.length === 0) return bundle.news.length // seed fallback
  return withDates.filter((n) => Date.parse(n.published_at!) >= cutoff).length
}

/**
 * Shift the 12-week attention buffer. Called once per Monday refresh.
 * Inside a week, replaces the last slot. Returns a fresh array.
 */
export function shiftAttentionWeekly(
  current: number[],
  todayAttention: number,
  crossedWeekBoundary: boolean,
): number[] {
  const next = [...current]
  if (crossedWeekBoundary) {
    next.shift()
    next.push(todayAttention)
  } else {
    next[next.length - 1] = todayAttention
  }
  if (next.length !== 12) {
    // Shouldn't happen, but guard against drift.
    while (next.length < 12) next.unshift(0)
    while (next.length > 12) next.shift()
  }
  return next
}

/**
 * Recompute every derived field on the bundle. Returns a NEW bundle; the
 * input is not mutated. Used by apply_proposals and any manual edit path.
 */
export function deriveAll(bundle: ArchetypeBundle): ArchetypeBundle {
  const composite = deriveComposite(bundle.risks, bundle.archetype.typical.target_irr)
  const risks_total = deriveRisksTotal(bundle.risks)
  const risks_high = deriveRisksHigh(bundle.risks)
  const news_this_week = deriveNewsThisWeek(bundle)

  return {
    ...bundle,
    archetype: {
      ...bundle.archetype,
      composite,
      risks_total,
      risks_high,
      news_this_week,
    },
  }
}

/**
 * Sort risks by probability-weighted IRR impact, descending. This is the
 * order the public dashboard renders the risks table in.
 */
export function rankedRisks(risks: Risk[]): Risk[] {
  return [...risks].sort(
    (a, b) =>
      Math.abs(b.impact_irr * b.probability) -
      Math.abs(a.impact_irr * a.probability),
  )
}
