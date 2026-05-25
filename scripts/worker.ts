/**
 * Long-lived worker process. Polls pipeline_runs for queued rows, claims one
 * via the claim_next_run SQL function, executes it through the pipeline
 * runtime, and loops.
 *
 * Honors SIGTERM by finishing the current run if possible, otherwise letting
 * the reclaimer flip it back to 'queued' on next boot.
 */

// Polyfill WebSocket so @supabase/supabase-js Realtime constructor doesn't
// blow up on Node 20. We never use realtime here but the SDK initializes it
// unconditionally.
import ws from 'ws'
if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = ws as any

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { executePipeline } from '../src/lib/pipeline/runtime'

const WORKER_ID = (globalThis.crypto?.randomUUID?.() ?? `wkr-${Date.now()}`).slice(0, 12)
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_MS ?? 2000)
const RECLAIM_INTERVAL_MS = 60_000

let shuttingDown = false
process.on('SIGTERM', () => {
  console.log(`[worker:${WORKER_ID}] SIGTERM`)
  shuttingDown = true
})
process.on('SIGINT', () => {
  console.log(`[worker:${WORKER_ID}] SIGINT`)
  shuttingDown = true
})

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[worker] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } },
  })

  console.log(`[worker:${WORKER_ID}] online`)

  // Periodic reclaimer pass.
  setInterval(async () => {
    try {
      const { data, error } = await sb.rpc('reclaim_stuck_runs', { stuck_minutes: 5 })
      if (error) console.warn(`[worker:${WORKER_ID}] reclaim error: ${error.message}`)
      else if (data && Number(data) > 0) console.log(`[worker:${WORKER_ID}] reclaimed ${data} runs`)
    } catch (e) {
      console.warn(`[worker:${WORKER_ID}] reclaim exception:`, e)
    }
  }, RECLAIM_INTERVAL_MS)

  while (!shuttingDown) {
    try {
      const { data: claimed, error } = await sb.rpc('claim_next_run', { worker_id: WORKER_ID })
      if (error) {
        console.warn(`[worker:${WORKER_ID}] claim error: ${error.message}`)
      } else if (claimed && (Array.isArray(claimed) ? claimed.length > 0 : claimed)) {
        const run = Array.isArray(claimed) ? claimed[0] : claimed
        console.log(`[worker:${WORKER_ID}] claimed ${run.pipeline_name}/${run.archetype_id ?? '—'} (${run.id})`)
        try {
          await executePipeline(run as any, { sb, onLog: (line) => console.log(`[${run.id.slice(0, 8)}] ${line}`) })
        } catch (e: any) {
          console.error(`[worker:${WORKER_ID}] execute exception:`, e)
        }
        continue // poll again immediately
      }
    } catch (e: any) {
      console.error(`[worker:${WORKER_ID}] poll exception:`, e)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  console.log(`[worker:${WORKER_ID}] clean shutdown`)
  process.exit(0)
}

main().catch((e) => {
  console.error('[worker] FATAL', e)
  process.exit(1)
})
