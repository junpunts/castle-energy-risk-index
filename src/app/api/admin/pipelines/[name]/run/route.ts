import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getPipeline } from '@/lib/pipeline/registry'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  const user = await requireAdmin()
  const pipeline = getPipeline(params.name)
  if (!pipeline) {
    return NextResponse.json({ ok: false, message: `unknown pipeline: ${params.name}` }, { status: 404 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* allow empty body */
  }
  const archetypeId = body?.archetypeId ?? null

  const sb = createServiceRoleClient()
  const { data, error } = await sb
    .from('pipeline_runs')
    .insert({
      pipeline_name: params.name,
      archetype_id: archetypeId,
      status: 'queued',
      triggered_by: `admin:${user.email}`,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, runId: data?.id })
}
