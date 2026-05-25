import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ProposalOpSchema } from '@/lib/schemas'

export const runtime = 'nodejs'

/**
 * Create a proposal (manual or copilot-driven).
 *
 * Body:
 *   archetype_id   string
 *   op             'update_risk' | 'add_risk' | …
 *   payload        object — validated against the op's schema
 *   reasoning      string
 *   source         optional, default 'manual'
 *   target         optional (e.g. risk_id)
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'invalid JSON' }, { status: 400 })
  }
  const { archetype_id, op, payload, reasoning, source = 'manual', target } = body ?? {}
  if (!archetype_id || !op || !payload || !reasoning) {
    return NextResponse.json({ ok: false, message: 'missing required fields' }, { status: 400 })
  }
  try {
    ProposalOpSchema.parse({ op, payload })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: zodMessage(e) }, { status: 400 })
  }

  const sb = createServiceRoleClient()
  const { data, error } = await sb
    .from('proposals')
    .insert({
      archetype_id,
      op,
      target: target ?? null,
      payload_json: payload,
      reasoning,
      source,
      created_by: `admin:${user.email}`,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}

function zodMessage(e: any): string {
  if (e?.issues) return e.issues.map((i: any) => `${i.path?.join('.') || '<root>'}: ${i.message}`).join('; ')
  return e?.message ?? String(e)
}
