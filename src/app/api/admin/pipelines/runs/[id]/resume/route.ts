import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Resume a run that's in 'failed' or 'aborted' by flipping it back to
 * 'queued'. The worker picks it up on the next poll; checkpoints make sure
 * completed stages don't re-run.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const { error } = await sb
    .from('pipeline_runs')
    .update({
      status: 'queued',
      abort_requested: false,
      error_message: null,
      claimed_by: null,
      claimed_at: null,
      completed_at: null,
    })
    .eq('id', params.id)
    .in('status', ['failed', 'aborted', 'claimed', 'running'])
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
