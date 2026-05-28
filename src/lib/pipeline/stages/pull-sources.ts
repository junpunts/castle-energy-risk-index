/**
 * Stage: pull_sources.
 *
 * Runs every adapter relevant to this archetype in parallel, dedupes the
 * union of their results on URL, runs the matcher to tag each item with
 * `matched_archetypes` / `matched_risks`, and persists to `news_cache` via
 * upsert (URL is the unique key).
 *
 * Input: { since?: string }  — ISO date. Defaults to last 24h.
 * Output: { fetched: number, persisted: number, matched_to_risks: number,
 *           items: NewsCacheRow[] }  (items are the rows actually
 *           persisted/refreshed this run, for the next stage).
 */

import type { Stage } from '../registry'
import { adaptersForArchetype } from '@/lib/adapters'
import { type SourceItem } from '@/lib/adapters/types'
import { matchItemAgainstArchetype } from '@/lib/adapters/match'
import { embedTexts, embeddingsEnabled } from '@/lib/adapters/embeddings'
import { parseArchetypeBundle } from '@/lib/schemas'

export interface NewsCacheRow {
  source: string
  url: string
  title: string
  body: string | null
  published_at: string
  matched_archetypes: string[]
  matched_risks: string[]
}

interface PullSourcesInput {
  since?: string
  limit_per_adapter?: number
}

interface PullSourcesOutput {
  fetched: number
  persisted: number
  matched_to_risks: number
  items: NewsCacheRow[]
}

export const pullSourcesStage: Stage<PullSourcesInput | null, PullSourcesOutput> = {
  name: 'pull_sources',
  async run(ctx, input) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')

    const since = input?.since ? new Date(input.since) : defaultSince()
    const limit = input?.limit_per_adapter ?? 50

    // Need the archetype bundle to run the matcher.
    const { data: archRow, error: archErr } = await ctx.sb
      .from('archetypes')
      .select('state')
      .eq('id', ctx.archetypeId)
      .single()
    if (archErr || !archRow) throw new Error(`load archetype: ${archErr?.message ?? 'missing'}`)
    const bundle = parseArchetypeBundle(archRow.state)

    const adapters = adaptersForArchetype(ctx.archetypeId, bundle)
    ctx.log(`pulling ${adapters.length} adapter${adapters.length === 1 ? '' : 's'} since ${since.toISOString()}`)
    if (adapters.length === 0) {
      return { output: { fetched: 0, persisted: 0, matched_to_risks: 0, items: [] } }
    }

    const settled = await Promise.allSettled(
      adapters.map((a) =>
        a.fetch({ since, limit, log: (m) => ctx.log(`  [${a.name}] ${m}`) }).then((items) => ({
          name: a.name,
          items,
        })),
      ),
    )

    const all: Array<{ source: string; item: SourceItem }> = []
    for (let i = 0; i < settled.length; i++) {
      const a = adapters[i]
      const r = settled[i]
      if (r.status === 'rejected') {
        ctx.log(`  ✗ ${a.name}: ${r.reason?.message ?? r.reason}`)
        continue
      }
      ctx.log(`  ✓ ${r.value.name}: ${r.value.items.length} item${r.value.items.length === 1 ? '' : 's'}`)
      for (const item of r.value.items) all.push({ source: r.value.name, item })
    }

    // Dedupe by URL across adapters; first-wins.
    const seen = new Set<string>()
    const unique: Array<{ source: string; item: SourceItem }> = []
    for (const x of all) {
      if (!x.item.url || seen.has(x.item.url)) continue
      seen.add(x.item.url)
      unique.push(x)
    }

    // Compute embeddings if OPENAI_API_KEY is set. Graceful no-op otherwise —
    // the matcher uses keywords only in that case. We batch one OpenAI call
    // per ~96 items, plus one call for the archetype's risk vectors (memoised
    // for the rest of this run).
    let itemEmbeddings: (number[] | null)[] = unique.map(() => null)
    let riskEmbeddings: Map<string, number[] | null> | undefined
    if (embeddingsEnabled() && unique.length > 0) {
      ctx.log(`embedding ${unique.length} items + ${bundle.risks.length} risks`)
      const itemTexts = unique.map(
        ({ item }) => `${item.title}\n${(item.body ?? '').slice(0, 2000)}`,
      )
      itemEmbeddings = await embedTexts(itemTexts, (m) => ctx.log(`  ${m}`))
      const riskTexts = bundle.risks.map((r) => {
        const d = bundle.risk_details[r.id]
        return [r.title, r.citation, d?.subtitle, d?.view]
          .filter(Boolean)
          .join('. ')
          .slice(0, 4000)
      })
      const rEmb = await embedTexts(riskTexts, (m) => ctx.log(`  ${m}`))
      riskEmbeddings = new Map<string, number[] | null>()
      bundle.risks.forEach((r, i) => riskEmbeddings!.set(r.id, rEmb[i]))
    }

    // Match each item to risks; build rows.
    const rows: NewsCacheRow[] = []
    let matchedCount = 0
    for (let i = 0; i < unique.length; i++) {
      const { source, item } = unique[i]
      const match = matchItemAgainstArchetype(item, bundle, {
        itemEmbedding: itemEmbeddings[i] ?? null,
        riskEmbeddings,
      })
      const risk_ids = match.risk_ids.map((id) => `${ctx.archetypeId}:${id}`)
      if (risk_ids.length > 0) matchedCount++
      rows.push({
        source,
        url: item.url,
        title: item.title,
        body: item.body ?? null,
        published_at: item.published_at,
        matched_archetypes: risk_ids.length > 0 ? [ctx.archetypeId!] : [],
        matched_risks: risk_ids,
      })
    }

    // Upsert into news_cache. URL is unique; updates refresh matched_* but
    // not body/title (so we don't churn on revisions to upstream text).
    let persisted = 0
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200)
        const { error } = await ctx.sb
          .from('news_cache')
          .upsert(chunk, { onConflict: 'url', ignoreDuplicates: false })
        if (error) {
          ctx.log(`  ✗ news_cache upsert: ${error.message}`)
        } else {
          persisted += chunk.length
        }
      }
    }

    // Persist embeddings in a separate UPDATE pass — the embedding column is
    // added by migration 007 and may not exist yet on older deployments.
    // Failure here doesn't block the pipeline.
    if (riskEmbeddings && itemEmbeddings.some((e) => e !== null)) {
      let embedded = 0
      for (let i = 0; i < rows.length; i++) {
        const emb = itemEmbeddings[i]
        if (!emb) continue
        const { error } = await ctx.sb
          .from('news_cache')
          .update({ embedding: emb })
          .eq('url', rows[i].url)
        if (error) {
          ctx.log(`  ✗ embedding update on first row failed: ${error.message}; skipping rest (migration 007 likely not applied)`)
          break
        }
        embedded++
      }
      if (embedded > 0) ctx.log(`  persisted ${embedded} embedding${embedded === 1 ? '' : 's'}`)
    }

    ctx.log(`✓ ${unique.length} unique item${unique.length === 1 ? '' : 's'} fetched, ${matchedCount} matched to ≥1 risk, ${persisted} persisted`)

    return {
      output: {
        fetched: unique.length,
        persisted,
        matched_to_risks: matchedCount,
        items: rows,
      },
    }
  },
}

/** Default since = last 24h. */
function defaultSince(): Date {
  return new Date(Date.now() - 24 * 3600 * 1000)
}
