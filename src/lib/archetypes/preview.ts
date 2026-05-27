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
  /** One plain-English sentence: what this proposal does. */
  action_summary: string
  /** Human-readable breadcrumb of where the change lands. */
  destination: string
  /** Plain-English description of what approving does. */
  apply_note: string
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
  attention: 'Attention score',
  likelihood: 'Likelihood',
  category: 'Category',
  title: 'Title',
  citation: 'Citation',
  subtitle: 'Subtitle',
  view: "Castle's view",
  tracked_since: 'Tracked since',
  hedge_cost: 'Hedge cost ($)',
}

/** Format a field value for human display (e.g. probability 0.72 -> "72%"). */
function fmtFieldValue(field: string, v: any): string {
  if (v === null || v === undefined) return '—'
  if (field === 'probability') return `${Math.round(Number(v) * 100)}%`
  if (field === 'impact_irr') return `${v} pp`
  if (field === 'impact_usd' || field === 'hedge_cost') return `$${Number(v).toLocaleString()}`
  return String(v)
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

  const archName = bundle.archetype?.name ?? prop.archetype_id
  const payload = prop.payload_json ?? {}
  let changes: DiffChange[] = []
  let context: string | null = null
  let action_summary = ''
  let destination = archName
  let apply_note = 'Approving applies this change to the live dashboard immediately.'

  try {
    switch (prop.op) {
      case 'update_risk': {
        const riskId = payload.risk_id
        const field = payload.field
        const risk = bundle.risks.find((r) => r.id === riskId)
        const detail = bundle.risk_details?.[riskId]
        const riskTitle = risk?.title ?? riskId
        context = riskTitle
        const fieldLabel = FIELD_LABELS[field] ?? field
        const rawBefore = (risk as any)?.[field] ?? (detail as any)?.[field] ?? null
        const isText = ['view', 'subtitle', 'title', 'citation'].includes(field)
        const beforeStr = isText
          ? (rawBefore == null ? null : String(rawBefore))
          : (rawBefore == null ? null : fmtFieldValue(field, rawBefore))
        const afterStr = isText
          ? (payload.new_value == null ? null : String(payload.new_value))
          : (payload.new_value == null ? null : fmtFieldValue(field, payload.new_value))

        action_summary = `Change the ${fieldLabel} of the risk “${riskTitle}” from ${beforeStr ?? '—'} to ${afterStr ?? '—'}.`
        destination = `${archName}  ›  Risk “${riskTitle}” (${riskId})`
        changes.push({
          label: fieldLabel,
          kind: isText ? 'text' : 'value',
          before: beforeStr,
          after: afterStr,
        })
        break
      }
      case 'pin_news': {
        const scope = payload.scope ?? {}
        const item = payload.news_item ?? {}
        if (scope.kind === 'risk') {
          const r = bundle.risks.find((x) => x.id === scope.risk_id)
          const riskTitle = r?.title ?? scope.risk_id
          context = riskTitle
          destination = `${archName}  ›  Risk “${riskTitle}” (${scope.risk_id})  ›  News feed`
          action_summary = `Add a news item to the “${riskTitle}” risk’s news feed.`
        } else {
          context = `${archName} — headline feed`
          destination = `${archName}  ›  Top-level news feed`
          action_summary = `Add a news item to ${archName}’s main headline feed.`
        }
        apply_note = 'Approving pins this headline to the feed shown on the public dashboard. It does not change any risk numbers.'
        changes.push({
          label: `New headline · ${item.source ?? 'source'}${item.ago ? ' · ' + item.ago : ''}`,
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
        const riskTitle = r?.title ?? riskId
        context = riskTitle
        destination = `${archName}  ›  Risk “${riskTitle}” (${riskId})  ›  Hedges`
        const existing = detail?.hedges?.find((h) => h.ticker === payload.ticker)
        const fmt = (h: any) =>
          h ? `${h.title}\nYES ${Math.round((h.yes ?? 0) * 100)}¢ · expires ${h.expiry ?? '—'} · sized $${(h.notional ?? 0).toLocaleString()}` : null
        if (payload.op === 'remove') {
          action_summary = `Remove a hedge contract from the “${riskTitle}” risk.`
          changes.push({ label: 'Hedge being removed', kind: 'remove', before: fmt(existing), after: null })
        } else if (payload.op === 'add') {
          action_summary = `Add a new hedge contract to the “${riskTitle}” risk.`
          changes.push({ label: 'Hedge being added', kind: 'add', before: null, after: fmt(payload.hedge) })
        } else {
          action_summary = `Update a hedge contract on the “${riskTitle}” risk.`
          changes.push({ label: 'Hedge', kind: 'value', before: fmt(existing), after: fmt(payload.hedge) })
        }
        break
      }
      case 'add_risk': {
        const rk = payload.risk ?? {}
        const riskTitle = rk.title ?? '(new risk)'
        context = riskTitle
        destination = `${archName}  ›  Tracked risks`
        action_summary = `Add a brand-new risk, “${riskTitle}”, to ${archName}.`
        apply_note = 'Approving adds this risk to the archetype and recomputes the composite score.'
        changes.push({
          label: 'New risk',
          kind: 'add',
          before: null,
          after: [
            rk.title,
            rk.category ? `Category: ${rk.category}` : null,
            rk.probability != null ? `Probability: ${Math.round(rk.probability * 100)}%` : null,
            rk.impact_irr != null ? `IRR impact: ${rk.impact_irr} pp` : null,
            payload.risk_detail?.view ? `\n${payload.risk_detail.view}` : null,
          ].filter(Boolean).join('\n'),
        })
        break
      }
      case 'remove_risk': {
        const riskId = payload.risk_id
        const r = bundle.risks.find((x) => x.id === riskId)
        const detail = bundle.risk_details?.[riskId]
        const riskTitle = r?.title ?? riskId
        context = riskTitle
        destination = `${archName}  ›  Tracked risks`
        action_summary = `Remove the risk “${riskTitle}” from ${archName}.`
        apply_note = 'Approving retires this risk from the archetype and recomputes the composite score.'
        changes.push({
          label: 'Risk being removed',
          kind: 'remove',
          before: [r?.title, detail?.subtitle].filter(Boolean).join('\n'),
          after: null,
        })
        break
      }
      default:
        action_summary = `Apply a ${prop.op} change.`
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
    archetype_name: archName,
    target: prop.target ?? null,
    context,
    action_summary,
    destination,
    apply_note,
    reasoning: prop.reasoning ?? '',
    changes,
  }
}
