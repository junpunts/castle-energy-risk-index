#!/usr/bin/env tsx
/**
 * One-shot: rewrite every risk's `view` paragraph to the methodology
 * (≤50 words, two-sentence headline, %s not decimals) and queue each
 * rewrite as a pending `update_risk` proposal in the admin inbox.
 *
 * Does NOT auto-apply — proposals land in /admin/proposals?op=update_risk
 * for human review. Approve in bulk or pick & choose.
 *
 * One Opus call per archetype, batched across all risks whose current
 * view fails the lint. Cost ≈ $0.15–0.30 per archetype.
 *
 * Usage:  tsx scripts/queue-view-rewrites.ts [archetype_id|all]
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { parseArchetypeBundle } from '../src/lib/schemas'
import { createMessage } from '../src/lib/llm/client'
import { priceFor } from '../src/lib/llm/cost'
import { CASTLE_VIEW_SPEC, lintView } from '../src/lib/agent/view-methodology'
import type Anthropic from '@anthropic-ai/sdk'

const OPUS_MODEL = 'claude-opus-4-8'

interface Rewrite {
  risk_id: string
  new_view: string
}

async function processArchetype(archetypeId: string) {
  const sb = createServiceRoleClient()
  const { data: arch, error } = await sb
    .from('archetypes')
    .select('state')
    .eq('id', archetypeId)
    .single()
  if (error || !arch) {
    console.error(`✗ ${archetypeId}: ${error?.message ?? 'missing'}`)
    return
  }
  const bundle = parseArchetypeBundle(arch.state)

  // Lint each risk's current view; only rewrite the failing ones.
  const targets: Array<{ risk_id: string; title: string; citation: string; current: string; lint: ReturnType<typeof lintView> }> = []
  for (const r of bundle.risks) {
    const d = bundle.risk_details[r.id]
    if (!d) continue
    const result = lintView(d.view ?? '')
    if (!result.ok) {
      targets.push({ risk_id: r.id, title: r.title, citation: r.citation, current: d.view ?? '', lint: result })
    }
  }
  if (targets.length === 0) {
    console.log(`✓ ${archetypeId}: all views already conform`)
    return
  }
  console.log(`\n── ${archetypeId} (${bundle.archetype.name})  ${targets.length}/${bundle.risks.length} non-conforming ──`)
  for (const t of targets) {
    console.log(`  ${t.risk_id}: ${t.lint.wordCount}w / ${t.lint.sentenceCount}s${t.lint.decimals.length ? ' / decimals=' + t.lint.decimals.join(',') : ''}`)
  }

  // Build the Opus prompt.
  const system = `You are Castle's risk analyst rewriting the \`view\` paragraph on a set of risks to the house methodology.

${CASTLE_VIEW_SPEC}

You will receive a JSON list of risks, each with id / title / citation / current_view. Rewrite each view in place — keep the analytical content of the current view (the call, the move, the hedge) but compress to the methodology.

Return STRICTLY this JSON, with no commentary outside the object:
{
  "rewrites": [
    { "risk_id": "ow1", "new_view": "..." }
  ]
}

Cover every risk_id you receive. Each new_view must be ≤ ${50} words and exactly two sentences. No decimal probabilities. Never restate the IRR / $ / probability numbers shown alongside the view.`

  const userPayload = {
    archetype: bundle.archetype.name,
    blurb: bundle.archetype.blurb,
    risks: targets.map((t) => ({
      risk_id: t.risk_id,
      title: t.title,
      citation: t.citation,
      current_view: t.current,
    })),
  }

  const msg = await createMessage({
    model: OPUS_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
  })
  const cost = priceFor(msg.model, msg.usage)
  console.log(`  opus: ${msg.usage.input_tokens}in/${msg.usage.output_tokens}out  $${cost.toFixed(4)}`)
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) {
    console.error(`  ✗ no JSON in opus response`)
    return
  }
  let parsed: { rewrites?: Rewrite[] }
  try {
    parsed = JSON.parse(m[0])
  } catch (e: any) {
    console.error(`  ✗ JSON parse: ${e?.message ?? e}`)
    return
  }
  const rewrites = parsed.rewrites ?? []
  console.log(`  opus produced ${rewrites.length} rewrites`)

  // For each rewrite, queue an update_risk proposal. Skip ones that still fail lint.
  let queued = 0
  let skipped = 0
  for (const rw of rewrites) {
    if (!rw.risk_id || typeof rw.new_view !== 'string' || rw.new_view.length === 0) {
      skipped++
      continue
    }
    const target = targets.find((t) => t.risk_id === rw.risk_id)
    if (!target) {
      skipped++
      continue
    }
    const newLint = lintView(rw.new_view)
    if (!newLint.ok) {
      console.log(`  ⚠ ${rw.risk_id}: rewrite still fails lint (${newLint.wordCount}w / ${newLint.sentenceCount}s) — queueing anyway`)
    }
    const { data: row, error: insErr } = await sb
      .from('proposals')
      .insert({
        archetype_id: archetypeId,
        op: 'update_risk',
        target: rw.risk_id,
        payload_json: {
          risk_id: rw.risk_id,
          field: 'view',
          new_value: rw.new_view.trim(),
        },
        reasoning: `Reformatting view paragraph to the headline methodology (≤50 words, two sentences, % not decimals). Original was ${target.lint.wordCount} words / ${target.lint.sentenceCount} sentences.`,
        source: 'manual',
        created_by: 'script:queue-view-rewrites',
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) {
      console.log(`  ✗ ${rw.risk_id}: ${insErr.message}`)
      skipped++
      continue
    }
    queued++
    console.log(`  ✓ ${rw.risk_id}  (${newLint.wordCount}w/${newLint.sentenceCount}s)  proposal ${row?.id?.slice(0, 8)}`)
  }
  console.log(`  → queued ${queued}, skipped ${skipped}, cost $${cost.toFixed(4)}`)
}

async function main() {
  const target = process.argv[2] ?? 'all'
  const ids =
    target === 'all'
      ? ['battery-storage', 'ev-charging', 'natural-gas', 'nuclear-smr', 'offshore-wind', 'utility-solar']
      : [target]
  for (const id of ids) {
    try {
      await processArchetype(id)
    } catch (e: any) {
      console.error(`✗ ${id} fatal: ${e?.message ?? e}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
