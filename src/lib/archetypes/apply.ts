/**
 * Apply a single proposal to its archetype's canonical state.
 *
 * Sequence:
 *   1. Load proposal + current archetype state (with version).
 *   2. Validate the proposal payload against its op-specific schema.
 *   3. Apply the op to a deep copy of the bundle.
 *   4. Re-run deriveAll() so composite/risks_total/etc. stay consistent.
 *   5. Validate the resulting bundle against the schema + invariants.
 *   6. Call apply_archetype_revision SQL function (atomic; optimistic concurrency).
 *   7. (Best effort) revalidate the public ISR tag.
 */

import {
  ProposalOpSchema,
  parseArchetypeBundle,
  type ArchetypeBundle,
  type UpdateRiskPayload,
  type AddRiskPayload,
  type RemoveRiskPayload,
  type PinNewsPayload,
  type UpdateHedgePayload,
} from '@/lib/schemas'
import { deriveAll } from '@/lib/archetypes/derive'
import { createServiceRoleClient } from '@/lib/supabase/server'

export interface ApplyResult {
  ok: true
  revisionId: number
  newVersion: number
}
export interface ApplyError {
  ok: false
  code:
    | 'not_found'
    | 'already_resolved'
    | 'invalid_payload'
    | 'invalid_resulting_state'
    | 'concurrent_modification'
    | 'op_failed'
    | 'db_error'
  message: string
}

export async function applyProposal(
  proposalId: string,
  appliedBy: string,
): Promise<ApplyResult | ApplyError> {
  const sb = createServiceRoleClient()

  // ── 1. Load proposal + state
  const { data: prop, error: propErr } = await sb
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle()
  if (propErr) return { ok: false, code: 'db_error', message: propErr.message }
  if (!prop) return { ok: false, code: 'not_found', message: 'proposal not found' }
  if (prop.status !== 'pending') {
    return { ok: false, code: 'already_resolved', message: `proposal is ${prop.status}` }
  }

  const { data: archRow, error: archErr } = await sb
    .from('archetypes')
    .select('state, state_version')
    .eq('id', prop.archetype_id)
    .maybeSingle()
  if (archErr) return { ok: false, code: 'db_error', message: archErr.message }
  if (!archRow) return { ok: false, code: 'not_found', message: 'archetype not found' }

  // ── 2. Validate payload against op-specific schema
  let parsedOp
  try {
    parsedOp = ProposalOpSchema.parse({ op: prop.op, payload: prop.payload_json })
  } catch (e: any) {
    return { ok: false, code: 'invalid_payload', message: zodMessage(e) }
  }

  // ── 3. Apply op to a copy
  let bundle: ArchetypeBundle
  try {
    bundle = parseArchetypeBundle(archRow.state)
  } catch (e: any) {
    return { ok: false, code: 'invalid_payload', message: `existing state invalid: ${zodMessage(e)}` }
  }

  let mutated: ArchetypeBundle
  try {
    mutated = applyOp(bundle, parsedOp)
  } catch (e: any) {
    return { ok: false, code: 'op_failed', message: e?.message ?? String(e) }
  }

  // ── 4. Re-derive
  mutated.generated_at = new Date().toISOString()
  mutated.generated_by = appliedBy
  const derived = deriveAll(mutated)

  // ── 5. Validate
  try {
    parseArchetypeBundle(derived)
  } catch (e: any) {
    return { ok: false, code: 'invalid_resulting_state', message: zodMessage(e) }
  }

  // ── 6. SQL apply
  const newVersion = archRow.state_version + 1
  const { data: rev, error: applyErr } = await sb.rpc('apply_archetype_revision', {
    p_archetype_id: prop.archetype_id,
    p_state_version: newVersion,
    p_state: derived,
    p_proposal_id: proposalId,
    p_applied_by: appliedBy,
  })

  if (applyErr) {
    if (applyErr.message?.includes('concurrent modification')) {
      return { ok: false, code: 'concurrent_modification', message: applyErr.message }
    }
    return { ok: false, code: 'db_error', message: applyErr.message }
  }

  // rev is the inserted archetype_revisions row
  const revRow = Array.isArray(rev) ? rev[0] : rev
  return { ok: true, revisionId: revRow?.id ?? -1, newVersion }
}

// ───────────────────────────────────────────────────────────────────────────
// Op handlers
// ───────────────────────────────────────────────────────────────────────────

type ParsedOp =
  | { op: 'update_risk'; payload: UpdateRiskPayload }
  | { op: 'add_risk'; payload: AddRiskPayload }
  | { op: 'remove_risk'; payload: RemoveRiskPayload }
  | { op: 'pin_news'; payload: PinNewsPayload }
  | { op: 'update_hedge'; payload: UpdateHedgePayload }

function applyOp(bundle: ArchetypeBundle, op: ParsedOp): ArchetypeBundle {
  switch (op.op) {
    case 'update_risk':
      return applyUpdateRisk(bundle, op.payload)
    case 'add_risk':
      return applyAddRisk(bundle, op.payload)
    case 'remove_risk':
      return applyRemoveRisk(bundle, op.payload)
    case 'pin_news':
      return applyPinNews(bundle, op.payload)
    case 'update_hedge':
      return applyUpdateHedge(bundle, op.payload)
  }
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function applyUpdateRisk(bundle: ArchetypeBundle, p: UpdateRiskPayload): ArchetypeBundle {
  const out = deepClone(bundle)
  const risk = out.risks.find((r) => r.id === p.risk_id)
  const detail = out.risk_details[p.risk_id]
  if (!risk || !detail) throw new Error(`risk ${p.risk_id} not found`)

  // Field set governed by RiskFieldSchema in lib/schemas.ts.
  switch (p.field) {
    case 'probability': {
      const n = Number(p.new_value)
      if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('probability must be in [0,1]')
      const oldP = risk.probability
      risk.probability = n
      detail.probability = n
      detail.probability_delta = Math.max(-1, Math.min(1, n - oldP))
      detail.last_updated = 'just now'
      break
    }
    case 'impact_irr': {
      const n = Number(p.new_value)
      if (!Number.isFinite(n) || n > 0) throw new Error('impact_irr must be ≤0')
      risk.impact_irr = n
      detail.impact_irr = n
      break
    }
    case 'impact_usd': {
      const n = Number(p.new_value)
      if (!Number.isFinite(n) || n < 0) throw new Error('impact_usd must be ≥0')
      risk.impact_usd = n
      detail.impact_usd = n
      break
    }
    case 'attention': {
      const n = Number(p.new_value)
      if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error('attention must be 0..100')
      risk.attention = n
      detail.attention = n
      break
    }
    case 'likelihood': {
      const v = String(p.new_value)
      if (!['low', 'medium', 'high'].includes(v)) throw new Error('likelihood enum violation')
      risk.likelihood = v as any
      break
    }
    case 'category': {
      const v = String(p.new_value)
      if (!['policy', 'trade', 'operational', 'market'].includes(v))
        throw new Error('category enum violation')
      risk.category = v as any
      detail.category = v as any
      break
    }
    case 'title':
      risk.title = String(p.new_value)
      detail.title = String(p.new_value)
      break
    case 'citation':
      risk.citation = String(p.new_value)
      detail.citation = String(p.new_value)
      break
    case 'subtitle':
      detail.subtitle = String(p.new_value)
      break
    case 'view':
      detail.view = String(p.new_value)
      detail.last_updated = 'just now'
      break
    case 'tracked_since':
      detail.tracked_since = String(p.new_value)
      break
    case 'hedge_cost': {
      const n = Number(p.new_value)
      if (!Number.isInteger(n) || n < 0) throw new Error('hedge_cost must be a non-negative integer')
      detail.hedge_cost = n
      break
    }
  }
  return out
}

function applyAddRisk(bundle: ArchetypeBundle, p: AddRiskPayload): ArchetypeBundle {
  const out = deepClone(bundle)
  const newId = p.suggested_id ?? nextRiskId(out)
  if (out.risks.some((r) => r.id === newId)) throw new Error(`risk id ${newId} already exists`)

  // Cheap dedupe gate: refuse if the proposed title or citation is a
  // near-exact match for an existing risk. The semantic-similarity gate
  // (cosine ≥ 0.85) happens at proposal-creation time in surface_new_risks;
  // this is the last-line defence on apply.
  const newTitle = (p.risk.title ?? '').trim().toLowerCase()
  const newCitation = (p.risk.citation ?? '').trim().toLowerCase()
  for (const existing of out.risks) {
    if (newTitle && existing.title.trim().toLowerCase() === newTitle) {
      throw new Error(`risk with identical title already exists (${existing.id})`)
    }
    if (newCitation && existing.citation.trim().toLowerCase() === newCitation) {
      throw new Error(`risk with identical citation already exists (${existing.id})`)
    }
  }

  // Coerce: agent supplies partial risk + detail; we set the id + defaults.
  const risk = {
    id: newId,
    category: p.risk.category ?? 'policy',
    title: p.risk.title ?? '(untitled)',
    citation: p.risk.citation ?? '',
    impact_irr: p.risk.impact_irr ?? 0,
    impact_usd: p.risk.impact_usd ?? 0,
    probability: p.risk.probability ?? 0.5,
    attention: p.risk.attention ?? 0,
    likelihood: p.risk.likelihood ?? 'medium',
    headline_change: p.risk.headline_change ?? '0',
    status: p.risk.status ?? 'active',
    ...(p.risk.realized_date ? { realized_date: p.risk.realized_date } : {}),
    ...(p.risk.driver ? { driver: p.risk.driver } : {}),
    ...(p.risk.primary_hedge_ticker ? { primary_hedge_ticker: p.risk.primary_hedge_ticker } : {}),
  } as any

  const detail = {
    archetype_id: bundle.archetype_id,
    archetype_name: bundle.archetype.name,
    id: newId,
    category: risk.category,
    title: risk.title,
    citation: risk.citation,
    subtitle: p.risk_detail.subtitle ?? '',
    tracked_since: p.risk_detail.tracked_since ?? new Date().toISOString().slice(0, 10),
    last_updated: 'just now',
    attention: risk.attention,
    attention_delta: p.risk_detail.attention_delta ?? 0,
    probability: risk.probability,
    probability_delta: p.risk_detail.probability_delta ?? 0,
    impact_irr: risk.impact_irr,
    impact_usd: risk.impact_usd,
    hedge_cost: p.risk_detail.hedge_cost ?? 0,
    view: p.risk_detail.view ?? '',
    weekly: p.risk_detail.weekly ?? new Array(12).fill(0),
    events: p.risk_detail.events ?? [
      {
        date: new Date().toISOString().slice(0, 10),
        when: 'today',
        kind: 'castle',
        future: false,
        title: 'Risk added to watchlist',
        detail: 'Initial entry — surfaced by Pass B.',
      },
    ],
    news: p.risk_detail.news ?? [],
    hedges: p.risk_detail.hedges ?? [],
    status: p.risk.status ?? 'active',
    ...(p.risk.realized_date ? { realized_date: p.risk.realized_date } : {}),
  } as any

  out.risks.push(risk)
  out.risk_details[newId] = detail
  return out
}

function applyRemoveRisk(bundle: ArchetypeBundle, p: RemoveRiskPayload): ArchetypeBundle {
  const out = deepClone(bundle)
  // Soft retire: drop from risks[] and risk_details. Audit log captures the
  // pre-state via archetype_revisions.
  out.risks = out.risks.filter((r) => r.id !== p.risk_id)
  delete out.risk_details[p.risk_id]
  return out
}

function applyPinNews(bundle: ArchetypeBundle, p: PinNewsPayload): ArchetypeBundle {
  const out = deepClone(bundle)
  if (p.scope.kind === 'archetype') {
    out.news = [p.news_item, ...out.news].slice(0, 50)
  } else {
    const d = out.risk_details[p.scope.risk_id]
    if (!d) throw new Error(`risk ${p.scope.risk_id} not found`)
    d.news = [p.news_item, ...d.news].slice(0, 20)
  }
  return out
}

function applyUpdateHedge(bundle: ArchetypeBundle, p: UpdateHedgePayload): ArchetypeBundle {
  const out = deepClone(bundle)
  const detail = out.risk_details[p.risk_id]
  if (!detail) throw new Error(`risk ${p.risk_id} not found`)
  const idx = detail.hedges.findIndex((h) => h.ticker === p.ticker)

  if (p.op === 'remove') {
    if (idx === -1) throw new Error(`hedge ${p.ticker} not found`)
    detail.hedges.splice(idx, 1)
  } else if (p.op === 'add') {
    if (idx !== -1) throw new Error(`hedge ${p.ticker} already exists; use replace`)
    if (!p.hedge) throw new Error('add requires hedge payload')
    detail.hedges.push(p.hedge)
  } else if (p.op === 'replace') {
    if (idx === -1) throw new Error(`hedge ${p.ticker} not found`)
    if (!p.hedge) throw new Error('replace requires hedge payload')
    detail.hedges[idx] = p.hedge
  }
  return out
}

function nextRiskId(bundle: ArchetypeBundle): string {
  // Risk ids look like "ow1", "us12", "bs3"; the prefix is the 2-letter
  // namespace already used by this archetype's risks. Read it from the
  // existing risks rather than guessing from the archetype_id string —
  // archetype_id="ev-charging" maps to prefix "ev", not "ec".
  const used = new Set(bundle.risks.map((r) => r.id))
  let prefix = ''
  for (const r of bundle.risks) {
    const m = r.id.match(/^([a-z]+)\d+$/)
    if (m) {
      prefix = m[1]
      break
    }
  }
  if (!prefix) {
    // First-ever risk on this archetype — derive a 2-letter handle from the id.
    const parts = bundle.archetype_id.split('-').filter(Boolean)
    if (parts.length >= 2) {
      prefix = (parts[0][0] + parts[1][0]).toLowerCase()
    } else {
      prefix = bundle.archetype_id.slice(0, 2).toLowerCase()
    }
  }
  // Find max integer suffix among existing ids with this prefix, +1.
  let maxN = 0
  const re = new RegExp(`^${prefix}(\\d+)$`)
  for (const id of used) {
    const m = id.match(re)
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }
  for (let i = maxN + 1; i < maxN + 1000; i++) {
    const id = `${prefix}${i}`
    if (!used.has(id)) return id
  }
  throw new Error('could not allocate risk id')
}

function zodMessage(e: any): string {
  if (e?.issues) {
    return e.issues.map((i: any) => `${i.path?.join('.') || '<root>'}: ${i.message}`).join('; ')
  }
  return e?.message ?? String(e)
}
