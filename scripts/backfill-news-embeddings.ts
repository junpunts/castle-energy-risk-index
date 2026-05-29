#!/usr/bin/env tsx
/**
 * One-shot backfill: compute and persist embeddings on every news_cache row
 * that's missing one. Cheap — at $0.00002/1k tokens and ~500 tokens/item,
 * the full 260-row catalog costs well under $0.01.
 *
 * Idempotent: skips rows that already have an embedding. Safe to re-run.
 *
 * Usage:  tsx scripts/backfill-news-embeddings.ts
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { embedTexts, embeddingsEnabled } from '../src/lib/adapters/embeddings'

const BATCH = 96

async function main() {
  if (!embeddingsEnabled()) {
    console.error('OPENAI_API_KEY not set — aborting')
    process.exit(1)
  }
  const sb = createServiceRoleClient()
  let cursor = 0
  let totalEmbedded = 0
  let totalFailed = 0
  while (true) {
    const { data, error } = await sb
      .from('news_cache')
      .select('id, title, body')
      .is('embedding', null)
      .order('id', { ascending: true })
      .gt('id', cursor)
      .limit(BATCH)
    if (error) {
      console.error('select failed:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    const texts = data.map((r) => `${r.title}\n${(r.body ?? '').slice(0, 2000)}`)
    const embs = await embedTexts(texts, (m) => console.log(`  ${m}`))
    for (let i = 0; i < data.length; i++) {
      const emb = embs[i]
      if (!emb) {
        totalFailed++
        continue
      }
      const { error: updErr } = await sb
        .from('news_cache')
        .update({ embedding: emb })
        .eq('id', data[i].id)
      if (updErr) {
        console.error(`  ✗ id=${data[i].id} write failed: ${updErr.message}`)
        totalFailed++
      } else {
        totalEmbedded++
      }
    }
    cursor = data[data.length - 1].id
    console.log(`  cursor=${cursor}  embedded=${totalEmbedded}  failed=${totalFailed}`)
  }
  console.log(`\n✓ done: embedded ${totalEmbedded} rows, failed ${totalFailed}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
