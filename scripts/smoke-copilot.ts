import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
import ws from 'ws'
if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = ws as any
import { createClient } from '@supabase/supabase-js'
import { parseArchetypeBundle } from '../src/lib/schemas'
import { runCopilotTurn } from '../src/lib/agent/copilot'

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data } = await sb.from('archetypes').select('state').eq('id', 'nuclear-smr').single()
  const bundle = parseArchetypeBundle(data!.state)

  console.log('--- TEST 1: question (should NOT propose) ---')
  const q = await runCopilotTurn({ bundle, history: [], message: "what's the single biggest risk right now and why?" })
  console.log('reply:', q.reply.slice(0, 300))
  console.log('proposals:', q.proposals.length, '| cost $', q.cost_usd.toFixed(4))

  console.log('\n--- TEST 2: explicit edit (should draft 1 proposal) ---')
  const e = await runCopilotTurn({
    bundle,
    history: [],
    message: 'bump ns1 probability to 0.78 — the FSER timeline slipped and a construction-permit slip is now more likely',
  })
  console.log('reply:', e.reply.slice(0, 300))
  console.log('proposals:', JSON.stringify(e.proposals, null, 2))
  console.log('cost $', e.cost_usd.toFixed(4))
}
main().catch((e) => { console.error(e); process.exit(1) })
