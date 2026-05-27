import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { parseArchetypeBundle } from '@/lib/schemas'
import { runCopilotTurn } from '@/lib/agent/copilot'

export const runtime = 'nodejs'

/**
 * Admin Copilot turn endpoint.
 *
 * Body:
 *   archetype_id  string                 — required, the archetype being edited
 *   message       string                 — the admin's instruction/question
 *   session_id    string (uuid)          — optional; omit to start a new session
 *
 * Flow:
 *   1. Load the archetype bundle (full state) for context.
 *   2. Reuse or create a copilot_sessions row.
 *   3. Load prior messages (chat history) for the session.
 *   4. Run the agent turn → reply text + drafted proposals.
 *   5. Persist proposals (source='copilot', status='pending') so they land in
 *      the same review queue as cron/manual proposals.
 *   6. Persist the user + assistant messages.
 *   7. Return { session_id, reply, proposals:[{id, op, target, reasoning}] }.
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'invalid JSON' }, { status: 400 })
  }

  const { archetype_id, message } = body ?? {}
  let { session_id } = body ?? {}
  if (!archetype_id || !message || typeof message !== 'string') {
    return NextResponse.json({ ok: false, message: 'archetype_id and message required' }, { status: 400 })
  }

  const sb = createServiceRoleClient()

  // 1. Load archetype state.
  const { data: archRow, error: archErr } = await sb
    .from('archetypes')
    .select('state')
    .eq('id', archetype_id)
    .maybeSingle()
  if (archErr) return NextResponse.json({ ok: false, message: archErr.message }, { status: 500 })
  if (!archRow) return NextResponse.json({ ok: false, message: 'archetype not found' }, { status: 404 })

  let bundle
  try {
    bundle = parseArchetypeBundle(archRow.state)
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: `state invalid: ${e?.message}` }, { status: 500 })
  }

  // 2. Reuse or create session.
  if (!session_id) {
    const { data: s, error } = await sb
      .from('copilot_sessions')
      .insert({ archetype_id, summary: message.slice(0, 120) })
      .select('id')
      .single()
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
    session_id = s!.id
  } else {
    await sb
      .from('copilot_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', session_id)
  }

  // 3. Load history (user/assistant text only — tool plumbing isn't replayed).
  const { data: priorMsgs } = await sb
    .from('copilot_messages')
    .select('role, content_json')
    .eq('session_id', session_id)
    .in('role', ['user', 'assistant'])
    .order('id', { ascending: true })
    .limit(40)

  const history = (priorMsgs ?? [])
    .map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      text: typeof m.content_json === 'string' ? m.content_json : (m.content_json?.text ?? ''),
    }))
    .filter((m) => m.text)

  // 4. Run the agent turn.
  let result
  try {
    result = await runCopilotTurn({ bundle, history, message })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: `agent error: ${e?.message ?? e}` }, { status: 500 })
  }

  // 5. Persist drafted proposals into the shared review queue.
  const created: Array<{ id: string; op: string; target: string | null; reasoning: string }> = []
  for (const p of result.proposals) {
    const { data: row, error } = await sb
      .from('proposals')
      .insert({
        archetype_id,
        op: p.op,
        target: p.target,
        payload_json: p.payload,
        reasoning: p.reasoning,
        source: 'copilot',
        created_by: `copilot:${user.email}`,
        status: 'pending',
      })
      .select('id')
      .single()
    if (!error && row?.id) {
      created.push({ id: row.id, op: p.op, target: p.target, reasoning: p.reasoning })
    }
  }

  // 6. Persist the conversation turn (user message + assistant reply).
  await sb.from('copilot_messages').insert([
    { session_id, role: 'user', content_json: { text: message }, cost_usd: 0 },
    {
      session_id,
      role: 'assistant',
      content_json: { text: result.reply, proposal_ids: created.map((c) => c.id) },
      cost_usd: result.cost_usd,
    },
  ])

  return NextResponse.json({
    ok: true,
    session_id,
    reply: result.reply,
    proposals: created,
    cost_usd: result.cost_usd,
    model: result.model,
  })
}
