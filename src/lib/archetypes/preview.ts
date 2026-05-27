/**
 * Dry-run preview of a proposal: load the proposal + current archetype state
 * and compute a structured, field-level before→after diff WITHOUT persisting.
 *
 * This powers the admin proposal diff modal ("what exactly is changing").
 * It deliberately mirrors the op handlers in apply.ts so the preview reflects
 * what an approve would actually do — but it never writes.
 */

import {
  parseArchetypeBundle,
  type ArchetypeBundle,
} from '@/lib/schemas'
import { createServiceRoleClient } from '@/lib/supabase/server'

export interface DiffChange {
  /** Human label for the field/section changing. */
  label: string
  /** Diff rendering kind. */
  kind: 'text' | 'value' | 'add' | 'remove'
  /** Prior value (null for pure additions). */
  before: string | null
  /** New value (null for pure removals). */
  after: string | null
}

export interface ProposalPreview {
  ok: true
  id: string
  op: string
  archetype_id: string
  archetype_name: string
  target: string | null
  /** A short title for the risk/section being touched, if any. */
  context: string | null
  reasoning: string
  changes: DiffChange[]
}
export interface PreviewError {
  ok: false
  code: 'not_found' | 'db_error' | 'invalid_payload' | 'op_failed'
  message: string
}

const FIELD_LABELS: Record<string, string> = {
  probability: 'Probability',
  impact_irr: 'IRR impact (pp)',
  impact_usd: 'Capital at risk ($)',
  attention: 'Attention',
  likelihood: 'Likelihood',
  category: 'Category',
  title: 'Title',
  citation: 'Citation',
  subtitle: 'Subtitle',
  view: "Castle's view",
  tracked_since: 'Tracked since',
  hedge_cost: 'Hedge cost ($)',
}

export async function previewProposal(
  proposalId: string,
): Promise<ProposalPreview | PreviewError> {
  const sb = createServiceRoleClient()

  const { data: prop, error: propErr } = await sb
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle()
  if (propErr) return { ok: false, code: 'db_error', message: propErr.message }
  if (!prop) return { ok: false, code: 'not_found', message: 'proposal not found' }

  const { data: archRow, error: archErr } = await sb
    .from('archetypes')
    .select('state')
    .eq('id', prop.archetype_id)
    .maybeSingle()
  if (archErr) return { ok: false, code: 'db_error', message: archErr.message }
  if (!archRow) return { ok: false, code: 'not_found', message: 'archetype not found' }

  let bundle: ArchetypeBundle
  try {
    bundle = parseArchetypeBundle(archRow.state)
  } catch (e: any) {
    return { ok: false, code: 'invalid_payload', message: `state invalid: ${e?.message ?? e}` }
  }

  const payload = prop.payload_json ?? {}
  let changes: DiffChange[] = []
  let context: string | null = null

  try {
    switch (prop.op) {
      case 'update_risk': {
        const riskId = payload.risk_id
        const field = payload.field
        const risk = bundle.risks.find((r) => r.id === riskId)
        const detail = bundle.risk_details?.[riskId]
        context = risk?.title ?? riskId ?? null
        const before =
          (risk as any)?.[field] ??
          (detail as any)?.[field] ??
          null
        changes.push({
          label: FIELD_LABELS[field] ?? field,
          kind: field === 'view' || field === 'subtitle' || field === 'title' || field === 'citation' ? 'text' : 'value',
          before: before === null || before === undefined ? null : String(before),
          after: payload.new_value === undefined ? null : String(payload.new_value),
        })
        break
      }
      case 'pin_news': {
        const scope = payload.scope ?? {}
        const item = payload.news_item ?? {}
        if (scope.kind === 'risk') {
          const r = bundle.risks.find((x) => x.id === scope.risk_id)
          context = r?.title ?? scope.risk_id ?? null
        } else {
          context = 'Archetype headline feed'
        }
        changes.push({
          label: `Pin news · ${item.source ?? '—'}`,
          kind: 'add',
          before: null,
          after: [item.title, item.sum].filter(Boolean).join('\n\n'),
        })
        break
      }
      case 'update_hedge': {
        const riskId = payload.risk_id
        const r = bundle.risks.find((x) => x.id === riskId)
        const detail = bundle.risk_details?.[riskId]
        context = r?.title ?? riskId ?? null
        const existing = detail?.hedges?.find((h) => h.ticker === payload.ticker)
        const fmt = (h: any) =>
          h ? `${h.title}\nYES ${Math.round((h.yes ?? 0) * 100)}¢ · ${h.expiry ?? '—'} · $${(h.notional ?? 0).toLocaleString()}` : null
        if (payload.op === 'remove') {
          changes.push({ label: `Hedge · ${payload.ticker}`, kind: 'remove', before: fmt(existing), after: null })
        } else if (payload.op === 'add') {
          changes.push({ label: `Hedge · ${payload.ticker}`, kind: 'add', before: null, after: fmt(payload.hedge) })
        } else {
          changes.push({ label: `Hedge · ${payload.ticker}`, kind: 'value', before: fmt(existing), after: fmt(payload.hedge) })
        }
        break
      }
      case 'add_risk': {
        const rk = payload.risk ?? {}
        context = rk.title ?? '(new risk)'
        changes.push({
          label: 'New risk',
          kind: 'add',
          before: null,
          after: [
            rk.title,
            rk.category ? `Category: ${rk.category}` : null,
            rk.probability != null ? `Probability: ${rk.probability}` : null,
            rk.impact_irr != null ? `IRR impact: ${rk.impact_irr}pp` : null,
            payload.risk_detail?.view ? `\n${payload.risk_detail.view}` : null,
          ].filter(Boolean).join('\n'),
        })
        break
      }
      case 'remove_risk': {
        const riskId = payload.risk_id
        const r = bundle.risks.find((x) => x.id === riskId)
        const detail = bundle.risk_details?.[riskId]
        context = r?.title ?? riskId ?? null
        changes.push({
          label: `Remove risk · ${riskId}`,
          kind: 'remove',
          before: [r?.title, detail?.subtitle].filter(Boolean).join('\n'),
          after: null,
        })
        break
      }
      default:
        changes.push({ label: prop.op, kind: 'value', before: null, after: JSON.stringify(payload, null, 2) })
    }
  } catch (e: any) {
    return { ok: false, code: 'op_failed', message: e?.message ?? String(e) }
  }

  return {
    ok: true,
    id: prop.id,
    op: prop.op,
    archetype_id: prop.archetype_id,
    archetype_name: bundle.archetype?.name ?? prop.archetype_id,
    target: prop.target ?? null,
    context,
    reasoning: prop.reasoning ?? '',
    changes,
  }
}
