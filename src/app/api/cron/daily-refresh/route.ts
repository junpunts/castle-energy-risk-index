import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Daily-refresh cron entrypoint.
 *
 * The Render Cron Job (castle-eri-daily-refresh) hits this endpoint at 06:00
 * ET on weekdays with the CRON_SECRET header. We validate the secret, expand
 * archetype=all into every archetype id in the DB, and enqueue one
 * pipeline_runs row per archetype with `status='queued'`. The worker (the
 * castle-energy-risk-index-worker service) picks them up via claim_next_run().
 *
 * Idempotency: if a `daily_refresh` run for an archetype is already queued or
 * running, we skip enqueueing another one. This protects against double-fires
 * (manual + scheduled) clobbering each other.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const archetypeParam = new URL(req.url).searchParams.get('archetype') ?? 'all'
  const sb = createServiceRoleClient()

  // Resolve target archetype ids.
  let archetypeIds: string[]
  if (archetypeParam === 'all') {
    const { data, error } = await sb.from('archetypes').select('id').order('id')
    if (error) {
      return NextResponse.json({ error: `list archetypes: ${error.message}` }, { status: 500 })
    }
    archetypeIds = (data ?? []).map((r) => r.id)
  } else {
    archetypeIds = [archetypeParam]
  }

  // Idempotency check: skip archetypes that already have a queued/running run.
  const { data: existing, error: existErr } = await sb
    .from('pipeline_runs')
    .select('archetype_id, status')
    .eq('pipeline_name', 'daily_refresh')
    .in('status', ['queued', 'claimed', 'running'])
    .in('archetype_id', archetypeIds)
  if (existErr) {
    return NextResponse.json({ error: `existing-check: ${existErr.message}` }, { status: 500 })
  }
  const busy = new Set((existing ?? []).map((r) => r.archetype_id))
  const toEnqueue = archetypeIds.filter((id) => !busy.has(id))

  const enqueued: Array<{ id: string; archetype: string }> = []
  for (const id of toEnqueue) {
    const { data: row, error } = await sb
      .from('pipeline_runs')
      .insert({
        pipeline_name: 'daily_refresh',
        archetype_id: id,
        status: 'queued',
        triggered_by: 'cron:daily-refresh',
        input_json: {
          since: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          limit_per_adapter: 50,
        },
      })
      .select('id')
      .single()
    if (error) {
      console.error(`[cron] enqueue ${id} failed:`, error.message)
      continue
    }
    if (row?.id) enqueued.push({ id: row.id, archetype: id })
  }

  console.log(
    `[cron] daily-refresh: archetype=${archetypeParam} requested, ${enqueued.length} enqueued, ${busy.size} skipped (already busy)`,
  )

  return NextResponse.json({
    archetype: archetypeParam,
    enqueued,
    skipped_busy: [...busy],
  })
}
