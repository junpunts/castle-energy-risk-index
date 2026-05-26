// Watch a pipeline_runs row to completion and dump traces + proposals.
// Usage: node scripts/_verify-cron.mjs <run_id>
import { config } from 'dotenv'; config({path:'.env.local'});
import WS from 'ws'; globalThis.WebSocket ??= WS;
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const runId = process.argv[2];
if (!runId) { console.error('usage: node scripts/_verify-cron.mjs <run_id>'); process.exit(2); }
const target = Date.now() + 5*60*1000;
while (Date.now() < target) {
  const {data: r} = await sb.from('pipeline_runs').select('status, current_stage, cost_usd, error_message, claimed_by').eq('id', runId).single();
  const stamp = new Date().toISOString().slice(11,19);
  console.log(`[${stamp}] ${r.status} stage=${r.current_stage ?? '-'} cost=$${(r.cost_usd ?? 0).toFixed(4)} ${r.error_message ? 'ERR: '+r.error_message : ''}`);
  if (['completed','failed','aborted'].includes(r.status)) break;
  await new Promise(r => setTimeout(r, 5000));
}
const {data: traces} = await sb.from('pipeline_traces').select('stage_name, duration_ms, error').eq('pipeline_run_id', runId).order('id');
console.log('\nstages:');
for (const t of traces ?? []) console.log(`  [${t.stage_name}] ${t.duration_ms}ms ${t.error ? '✗ '+t.error : ''}`);
const {data: ps} = await sb.from('proposals').select('id, op, target, reasoning').eq('created_by', `pipeline:${runId}`);
console.log(`\n${(ps??[]).length} proposals`);
for (const p of ps ?? []) console.log(`  [${p.op}] ${p.target}: ${p.reasoning.slice(0,140)}`);
process.exit(0);
