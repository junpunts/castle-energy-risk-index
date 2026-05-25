/**
 * Stage: recompute derived fields on an archetype.
 *
 * No LLM, no adapters — reads the archetype state, runs deriveAll(), and if
 * any derived field changed, emits an auto-approved `update_risk`-style …
 * wait, derived fields don't go through proposals (they're not editable).
 * Instead: this stage writes a new revision directly via the apply RPC with
 * a synthetic "system" proposal (so the audit log captures the event).
 *
 * In v1 we keep it simpler: insert a `pin_news` or do nothing if no change.
 * For now we just compute and log; the actual write goes through a future
 * pipeline-emitted proposal in M6.
 */

import { parseArchetypeBundle } from '@/lib/schemas'
import { deriveAll } from '@/lib/archetypes/derive'
import type { Stage } from '../registry'

export const recomputeDerivedStage: Stage<unknown, { changed: boolean; before: any; after: any }> = {
  name: 'recompute_derived',
  async run(ctx) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')
    ctx.log(`loading ${ctx.archetypeId}`)

    const { data, error } = await ctx.sb
      .from('archetypes')
      .select('state, state_version')
      .eq('id', ctx.archetypeId)
      .maybeSingle()

    if (error) throw new Error(`load failed: ${error.message}`)
    if (!data) throw new Error(`archetype ${ctx.archetypeId} not found`)

    const bundle = parseArchetypeBundle(data.state)
    const before = {
      composite: bundle.archetype.composite,
      risks_total: bundle.archetype.risks_total,
      risks_high: bundle.archetype.risks_high,
      news_this_week: bundle.archetype.news_this_week,
    }
    const derived = deriveAll(bundle)
    const after = {
      composite: derived.archetype.composite,
      risks_total: derived.archetype.risks_total,
      risks_high: derived.archetype.risks_high,
      news_this_week: derived.archetype.news_this_week,
    }

    const changed = JSON.stringify(before) !== JSON.stringify(after)
    ctx.log(`before: ${JSON.stringify(before)}`)
    ctx.log(`after:  ${JSON.stringify(after)}`)
    ctx.log(changed ? '⚠ derived fields changed — would emit proposal' : '✓ no change')

    if (changed) {
      // Persist the recomputed bundle as a system-driven revision.
      const next = {
        ...derived,
        generated_at: new Date().toISOString(),
        generated_by: `pipeline:${ctx.runId}`,
      }
      const newVersion = data.state_version + 1
      const { error: rpcErr } = await ctx.sb.rpc('apply_archetype_revision', {
        p_archetype_id: ctx.archetypeId,
        p_state_version: newVersion,
        p_state: next,
        p_proposal_id: null,
        p_applied_by: `pipeline:${ctx.runId}`,
      })
      if (rpcErr) throw new Error(`apply_archetype_revision: ${rpcErr.message}`)
      ctx.log(`✓ wrote revision v${newVersion}`)
    }

    return { output: { changed, before, after } }
  },
}
