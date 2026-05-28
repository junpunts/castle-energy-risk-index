/**
 * Stage: compute_attention.
 *
 * Aggregates the news_cache into per-risk weekly mention counts (12-week
 * window) and a normalized 0–100 attention score, then writes the updated
 * bundle through the audited apply_archetype_revision RPC.
 *
 * Runs in the daily_refresh pipeline immediately after pull_sources so it
 * picks up the day's freshly-tagged items. Idempotent: if nothing changed
 * since the last revision, no write happens.
 */

import type { Stage } from '../registry'
import { parseArchetypeBundle } from '@/lib/schemas'

const WEEK_MS = 7 * 24 * 3600 * 1000
const WINDOW_WEEKS = 12

interface ComputeAttentionOutput {
  changed: boolean
  risks_changed: number
  risks_nonzero: number
  top_total: number
}

export const computeAttentionStage: Stage<unknown, ComputeAttentionOutput> = {
  name: 'compute_attention',
  async run(ctx) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')
    const archetypeId = ctx.archetypeId

    // 1. Load current bundle.
    const { data: archRow, error: archErr } = await ctx.sb
      .from('archetypes')
      .select('state, state_version')
      .eq('id', archetypeId)
      .single()
    if (archErr || !archRow) throw new Error(`load archetype: ${archErr?.message ?? 'missing'}`)
    const bundle = parseArchetypeBundle(archRow.state)
    const riskIds = Object.keys(bundle.risk_details ?? {})
    if (riskIds.length === 0) {
      ctx.log('no risks; skipping')
      return { output: { changed: false, risks_changed: 0, risks_nonzero: 0, top_total: 0 } }
    }

    // 2. Pull matched news_cache rows for this archetype, last 12 weeks.
    const sinceISO = new Date(Date.now() - WINDOW_WEEKS * WEEK_MS).toISOString()
    const qualified = riskIds.map((rid) => `${archetypeId}:${rid}`)
    const { data: rows, error: ncErr } = await ctx.sb
      .from('news_cache')
      .select('published_at, matched_risks')
      .gte('published_at', sinceISO)
      .overlaps('matched_risks', qualified)
      .limit(5000)
    if (ncErr) throw new Error(`news_cache query: ${ncErr.message}`)

    // 3. Bucket per risk per week. Slot 11 = this week, 0 = 12 weeks ago.
    const now = Date.now()
    const weekly = new Map<string, number[]>()
    for (const rid of riskIds) weekly.set(rid, new Array(WINDOW_WEEKS).fill(0))
    for (const r of (rows ?? []) as Array<{ published_at: string; matched_risks: string[] | null }>) {
      const t = Date.parse(r.published_at)
      if (!Number.isFinite(t)) continue
      const wAgo = Math.floor((now - t) / WEEK_MS)
      if (wAgo < 0 || wAgo >= WINDOW_WEEKS) continue
      const slot = WINDOW_WEEKS - 1 - wAgo
      for (const qid of r.matched_risks ?? []) {
        if (!qid.startsWith(`${archetypeId}:`)) continue
        const rid = qid.slice(archetypeId.length + 1)
        const arr = weekly.get(rid)
        if (arr) arr[slot] += 1
      }
    }

    // 4. Compute attention score per risk: normalized 0–100 within this
    //    archetype (top-mentioned risk = 100, others scale). Falls back to 0
    //    when the archetype has zero total mentions.
    const totals = new Map<string, number>()
    let maxTotal = 0
    for (const rid of riskIds) {
      const t = (weekly.get(rid) ?? []).reduce((a, b) => a + b, 0)
      totals.set(rid, t)
      if (t > maxTotal) maxTotal = t
    }

    // 5. Build the candidate next-state and diff vs current.
    let risksChanged = 0
    let risksNonzero = 0
    const next = JSON.parse(JSON.stringify(bundle)) as typeof bundle
    for (const rid of riskIds) {
      const newWeekly = weekly.get(rid) ?? new Array(WINDOW_WEEKS).fill(0)
      const total = totals.get(rid) ?? 0
      if (total > 0) risksNonzero++
      const newAttention = maxTotal > 0 ? Math.round((100 * total) / maxTotal) : 0
      const oldDetail = bundle.risk_details[rid]
      const oldAttention = oldDetail?.attention ?? 0
      const attentionDelta = Math.max(-1, Math.min(1, (newAttention - oldAttention) / 100))
      // Persist
      if (next.risk_details[rid]) {
        next.risk_details[rid].weekly = newWeekly
        next.risk_details[rid].attention = newAttention
        next.risk_details[rid].attention_delta = attentionDelta
      }
      // Mirror into the rolled-up risks[] array (the dashboard reads attention
      // from there for the table; keep them in sync).
      const rk = next.risks?.find((x) => x.id === rid)
      if (rk) rk.attention = newAttention
      const changed =
        JSON.stringify(oldDetail?.weekly ?? []) !== JSON.stringify(newWeekly) ||
        oldAttention !== newAttention
      if (changed) risksChanged++
    }

    ctx.log(
      `${risksChanged} of ${riskIds.length} risks changed; ${risksNonzero} have non-zero counts; top total=${maxTotal}`,
    )

    if (risksChanged === 0) {
      return {
        output: { changed: false, risks_changed: 0, risks_nonzero: risksNonzero, top_total: maxTotal },
      }
    }

    // 6. Write a new revision through the audited RPC.
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
    ctx.log(`✓ wrote revision v${newVersion}`)

    return {
      output: { changed: true, risks_changed: risksChanged, risks_nonzero: risksNonzero, top_total: maxTotal },
    }
  },
}
