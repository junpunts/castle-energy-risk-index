/**
 * Stage: update_existing_risks (Pass A).
 *
 * Input: { changes: Record<risk_id, EvidencePacket> } — built by the
 * diff_against_prior stage (M7). For now we accept the changes packet as
 * input and call Pass A on each risk in parallel through llmLimit.
 *
 * Output: per-risk proposal counts + total cost.
 */

import type { Stage } from '../registry'
import { runPassA, type EvidencePacket } from '@/lib/agent/pass-a'
import { parseArchetypeBundle } from '@/lib/schemas'

interface PassAStageInput {
  changes: Record<string, EvidencePacket>
  /** Optional scaffold lookup; if absent we skip the scaffold section. */
  scaffold_by_risk?: Record<string, string>
}

interface PassAStageOutput {
  total_proposals: number
  total_cost_usd: number
  per_risk: Array<{
    risk_id: string
    proposals: number
    cost_usd: number
    error?: string
  }>
  proposal_ids: string[]
}

export const updateExistingRisksStage: Stage<PassAStageInput, PassAStageOutput> = {
  name: 'update_existing_risks',
  async run(ctx, input) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')
    if (!input?.changes || Object.keys(input.changes).length === 0) {
      ctx.log('no changes to process')
      return { output: { total_proposals: 0, total_cost_usd: 0, per_risk: [], proposal_ids: [] } }
    }

    // Load the archetype bundle once to get risk_details + risk lookup.
    const { data: archRow, error: archErr } = await ctx.sb
      .from('archetypes')
      .select('state')
      .eq('id', ctx.archetypeId)
      .single()
    if (archErr) throw new Error(`load archetype: ${archErr.message}`)
    const bundle = parseArchetypeBundle(archRow!.state)

    const riskIds = Object.keys(input.changes)
    ctx.log(`pass A: ${riskIds.length} risk${riskIds.length === 1 ? '' : 's'} affected`)

    // Fan out: runPassA already uses llmLimit() internally.
    const results = await Promise.allSettled(
      riskIds.map(async (riskId) => {
        const detail = bundle.risk_details[riskId]
        if (!detail) throw new Error(`risk ${riskId} not in bundle`)
        const evidence = input.changes[riskId]
        const scaffold_section = input.scaffold_by_risk?.[riskId]
        return runPassA(detail, { ...evidence, scaffold_section }).then((r) => ({
          risk_id: riskId,
          ...r,
        }))
      }),
    )

    const perRisk: PassAStageOutput['per_risk'] = []
    const proposal_ids: string[] = []
    let totalProposals = 0
    let totalCost = 0

    for (let i = 0; i < riskIds.length; i++) {
      const riskId = riskIds[i]
      const r = results[i]
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        ctx.log(`  ✗ ${riskId}: ${msg}`)
        perRisk.push({ risk_id: riskId, proposals: 0, cost_usd: 0, error: msg })
        continue
      }
      const { proposals, cost_usd } = r.value
      totalProposals += proposals.length
      totalCost += cost_usd
      await ctx.cost('claude-sonnet-4-5', 0, 0, cost_usd)
      ctx.log(`  ${riskId}: ${proposals.length} proposal${proposals.length === 1 ? '' : 's'} ($${cost_usd.toFixed(4)})`)

      // Persist proposals as pending rows.
      for (const p of proposals) {
        const { data: row, error } = await ctx.sb
          .from('proposals')
          .insert({
            archetype_id: ctx.archetypeId,
            op: p.op,
            target: p.target,
            payload_json: p.payload,
            reasoning: p.reasoning,
            source: 'cron-passA',
            created_by: `pipeline:${ctx.runId}`,
            status: 'pending',
          })
          .select('id')
          .single()
        if (error) {
          ctx.log(`    ✗ persist proposal: ${error.message}`)
          continue
        }
        if (row?.id) proposal_ids.push(row.id)
      }
      perRisk.push({ risk_id: riskId, proposals: proposals.length, cost_usd })
    }

    ctx.log(`✓ ${totalProposals} proposal${totalProposals === 1 ? '' : 's'} queued, $${totalCost.toFixed(4)} spent`)

    return {
      output: {
        total_proposals: totalProposals,
        total_cost_usd: totalCost,
        per_risk: perRisk,
        proposal_ids,
      },
      cost_usd: totalCost,
    }
  },
}
