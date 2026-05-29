#!/usr/bin/env tsx
/**
 * Bulk-apply pending proposals matching a filter. By default narrowed to the
 * view-rewrite batch so this script can't fire indiscriminately.
 *
 * Usage:
 *   tsx scripts/apply-pending-proposals.ts                       # view rewrites only (default)
 *   tsx scripts/apply-pending-proposals.ts --created-by=manual   # all manual proposals
 *   tsx scripts/apply-pending-proposals.ts --op=update_risk      # all pending update_risk
 *   tsx scripts/apply-pending-proposals.ts --all                 # every pending proposal — careful
 *
 * Concurrency-safe: each apply runs through apply_archetype_revision which
 * uses optimistic concurrency on state_version. If two applies collide on the
 * same archetype, the loser gets concurrent_modification and is retried once.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { applyProposal } from '../src/lib/archetypes/apply'

interface Args {
  createdBy?: string
  op?: string
  archetype?: string
  all?: boolean
}
function parseArgs(): Args {
  const out: Args = {}
  for (const a of process.argv.slice(2)) {
    if (a === '--all') out.all = true
    else if (a.startsWith('--created-by=')) out.createdBy = a.slice('--created-by='.length)
    else if (a.startsWith('--op=')) out.op = a.slice('--op='.length)
    else if (a.startsWith('--archetype=')) out.archetype = a.slice('--archetype='.length)
  }
  // Default filter — the view-rewrite batch. Override with --created-by= or --all.
  if (!out.all && !out.createdBy && !out.op) {
    out.createdBy = 'script:queue-view-rewrites'
  }
  return out
}

async function main() {
  const args = parseArgs()
  const sb = createServiceRoleClient()

  let q = sb.from('proposals').select('id, archetype_id, op, target, created_by').eq('status', 'pending')
  if (args.createdBy) q = q.eq('created_by', args.createdBy)
  if (args.op) q = q.eq('op', args.op)
  if (args.archetype) q = q.eq('archetype_id', args.archetype)
  q = q.order('archetype_id', { ascending: true }).order('created_at', { ascending: true })
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = data ?? []
  console.log(`Found ${rows.length} pending proposals to apply`)
  console.log(`Filter: ${JSON.stringify(args)}`)
  if (rows.length === 0) return

  let applied = 0
  let failed = 0
  // Apply serially per-archetype to avoid concurrent_modification storms.
  // Across archetypes is fine in parallel but kept serial here for clean log
  // output — total time is fine at <100 proposals.
  for (const p of rows) {
    const result = await applyProposal(p.id, 'script:apply-pending')
    if (result.ok) {
      applied++
      console.log(`  ✓ ${p.id.slice(0, 8)}  ${p.archetype_id.padEnd(20)} ${p.op.padEnd(14)} ${(p.target ?? '').padEnd(6)} → v${result.newVersion}`)
    } else if (result.code === 'concurrent_modification') {
      // Retry once after a brief wait — version moved under us.
      await new Promise((r) => setTimeout(r, 250))
      const retry = await applyProposal(p.id, 'script:apply-pending')
      if (retry.ok) {
        applied++
        console.log(`  ✓ ${p.id.slice(0, 8)}  ${p.archetype_id.padEnd(20)} ${p.op.padEnd(14)} (retry) → v${retry.newVersion}`)
      } else {
        failed++
        console.log(`  ✗ ${p.id.slice(0, 8)}  ${p.archetype_id.padEnd(20)} ${retry.code}: ${retry.message}`)
      }
    } else {
      failed++
      console.log(`  ✗ ${p.id.slice(0, 8)}  ${p.archetype_id.padEnd(20)} ${result.code}: ${result.message}`)
    }
  }
  console.log(`\n✓ applied ${applied} / ${rows.length}  (${failed} failed)`)
}
main().catch((e) => { console.error(e); process.exit(1) })
