/**
 * Stage: estimate_probabilities_opus.
 *
 * One Opus call per archetype, batched across all active risks. Opus
 * returns analyst-style probability estimates that we write into
 * risk.probability + risk_details[id].probability via the audited revision
 * RPC.
 *
 * Why Opus and not market YES:
 *   - Markets carry a liquidity / risk-premium that pushes prices toward 0.5
 *     even when the analytical truth is much higher (§45W "termination holds"
 *     trades at 0.80 but the real probability is ~0.99).
 *   - Opus's calibration on policy / regulatory questions is good enough that
 *     for a hedging-product display, the honest analytical number beats the
 *     market-clearing one.
 *
 * Realized risks are skipped — their probability is locked at the gen-script
 * value (typically 0.99) since the underlying change already occurred.
 *
 * Idempotent: writes a revision only when at least one estimate moved ≥ 1pp.
 */

import type { Stage } from '../registry'
import { createMessage } from '@/lib/llm/client'
import { llmLimit } from '@/lib/llm/limiter'
import { priceFor } from '@/lib/llm/cost'
import {
  parseArchetypeBundle,
  type ArchetypeBundle,
  type Risk,
} from '@/lib/schemas'

// Latest Opus — calibration matters for these analyst-style estimates.
const OPUS_MODEL = 'claude-opus-4-8'
const MIN_MOVE = 0.01

interface AppliedEstimate {
  risk_id: string
  old_prob: number
  new_prob: number
  rationale: string
}

interface EstimateOutput {
  changed: boolean
  active_count: number
  realized_skipped: number
  applied: AppliedEstimate[]
  cost_usd: number
  model: string
}

export const estimateProbabilitiesOpusStage: Stage<unknown, EstimateOutput> = {
  name: 'estimate_probabilities_opus',
  async run(ctx) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')
    const archetypeId = ctx.archetypeId

    const { data: archRow, error: archErr } = await ctx.sb
      .from('archetypes')
      .select('state, state_version')
      .eq('id', archetypeId)
      .single()
    if (archErr || !archRow) throw new Error(`load archetype: ${archErr?.message ?? 'missing'}`)
    const bundle = parseArchetypeBundle(archRow.state)

    const active = bundle.risks.filter((r) => r.status !== 'realized')
    const realizedSkipped = bundle.risks.length - active.length
    if (active.length === 0) {
      ctx.log(`no active risks; skipping (${realizedSkipped} realized)`)
      return {
        output: {
          changed: false,
          active_count: 0,
          realized_skipped: realizedSkipped,
          applied: [],
          cost_usd: 0,
          model: OPUS_MODEL,
        },
      }
    }

    ctx.log(`estimating probabilities for ${active.length} active risks (Opus)`)

    const system = SYSTEM_PROMPT
    const user = buildUserPrompt(bundle, active)
    const msg = await llmLimit(() =>
      createMessage({
        model: OPUS_MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    )
    const cost_usd = priceFor(msg.model, msg.usage)
    await ctx.cost(msg.model, msg.usage.input_tokens, msg.usage.output_tokens, cost_usd)

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    const estimates = parseEstimates(text)
    if (estimates.length === 0) {
      ctx.log(`opus returned no usable estimates; leaving probabilities as-is`)
      return {
        output: {
          changed: false,
          active_count: active.length,
          realized_skipped: realizedSkipped,
          applied: [],
          cost_usd,
          model: msg.model,
        },
      }
    }

    const next = JSON.parse(JSON.stringify(bundle)) as ArchetypeBundle
    const applied: AppliedEstimate[] = []
    let anyChange = false
    for (const est of estimates) {
      const newP = Math.max(0, Math.min(1, est.probability))
      const r = next.risks.find((x) => x.id === est.risk_id)
      const d = next.risk_details[est.risk_id]
      if (!r || !d) continue
      if (r.status === 'realized') continue
      const oldP = r.probability
      if (Math.abs(newP - oldP) < MIN_MOVE) continue
      r.probability = newP
      d.probability = newP
      anyChange = true
      applied.push({ risk_id: est.risk_id, old_prob: oldP, new_prob: newP, rationale: est.rationale })
      ctx.log(`  ${est.risk_id}: ${oldP.toFixed(2)} → ${newP.toFixed(2)}  — ${est.rationale.slice(0, 80)}`)
    }

    if (!anyChange) {
      ctx.log(`✓ all estimates within ${MIN_MOVE}; no revision written`)
      return {
        output: {
          changed: false,
          active_count: active.length,
          realized_skipped: realizedSkipped,
          applied: [],
          cost_usd,
          model: msg.model,
        },
      }
    }

    next.generated_at = new Date().toISOString()
    next.generated_by = `pipeline:${ctx.runId}`
    const newVersion = archRow.state_version + 1
    const { error: rpcErr } = await ctx.sb.rpc('apply_archetype_revision', {
      p_archetype_id: archetypeId,
      p_state_version: newVersion,
      p_state: next,
      p_proposal_id: null,
      p_applied_by: `pipeline:${ctx.runId}`,
    })
    if (rpcErr) throw new Error(`apply_archetype_revision: ${rpcErr.message}`)
    ctx.log(`✓ wrote v${newVersion}: ${applied.length} probability updates ($${cost_usd.toFixed(4)})`)

    return {
      output: {
        changed: true,
        active_count: active.length,
        realized_skipped: realizedSkipped,
        applied,
        cost_usd,
        model: msg.model,
      },
      cost_usd,
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt + parsing
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Castle's senior risk analyst. For each risk in the input you receive, return an 18-month materialisation probability — the probability that the described adverse event occurs (or, for already-in-effect policy changes, that it is NOT reversed) within the next 18 months.

You are an analyst, not a market-maker. Your probability should reflect honest base rates, political dynamics, regulatory cadence, and recent evidence. Prediction-market prices on these topics often carry a liquidity / risk-premium that compresses them toward 0.5 even when the analytical answer is much closer to 0 or 1 — calibrate to the analytical truth.

OUTPUT STRICTLY this JSON, with no commentary outside the object:
{
  "estimates": [
    {
      "risk_id": "ev3",
      "probability": 0.74,
      "rationale": "One short sentence — the key driver behind the number."
    }
  ]
}

Rules:
  • Cover every risk in the input. Use the exact risk_ids provided.
  • probability ∈ [0, 1], two decimals.
  • Pick a number. No hedging language.
  • Rationale: one sentence, ≤25 words, declarative.`

function buildUserPrompt(bundle: ArchetypeBundle, active: Risk[]): string {
  const lines: string[] = []
  lines.push(`ARCHETYPE: ${bundle.archetype.name}`)
  lines.push(`Context: ${bundle.archetype.blurb}`)
  lines.push('')
  lines.push('RISKS — estimate the 18-month materialisation probability for each:')
  for (const r of active) {
    const d = bundle.risk_details[r.id]
    lines.push('')
    lines.push(`--- ${r.id} (${r.category}) ---`)
    lines.push(`Title:    ${r.title}`)
    lines.push(`Citation: ${r.citation}`)
    if (d?.subtitle) lines.push(`Detail:   ${d.subtitle}`)
    if (d?.view) lines.push(`View:     ${d.view}`)
    lines.push(`Anchor probability (your starting point — refine): ${r.probability.toFixed(2)}`)
  }
  lines.push('')
  lines.push('Return ONE JSON object with the estimates array. Cover every risk above.')
  return lines.join('\n')
}

function parseEstimates(
  text: string,
): Array<{ risk_id: string; probability: number; rationale: string }> {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return []
  try {
    const obj = JSON.parse(m[0])
    const arr = obj?.estimates
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (e: any) =>
          typeof e?.risk_id === 'string' &&
          typeof e?.probability === 'number' &&
          Number.isFinite(e.probability),
      )
      .map((e: any) => ({
        risk_id: e.risk_id,
        probability: e.probability,
        rationale: typeof e.rationale === 'string' ? e.rationale : '',
      }))
  } catch {
    return []
  }
}

// Local Anthropic namespace for the TextBlock type-narrowing above.
import type Anthropic from '@anthropic-ai/sdk'
