import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const { error } = await sb
    .from('pipeline_runs')
    .update({ abort_requested: true })
    .eq('id', params.id)
    .in('status', ['queued', 'claimed', 'running'])
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
