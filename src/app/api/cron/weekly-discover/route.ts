import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Weekly-discover cron entrypoint — Pass B.
 *
 * Render Cron Job (castle-eri-weekly-discover) hits this Monday at 07:00 ET.
 * For each archetype, enqueue a `weekly_discover` pipeline run. The worker
 * picks them up and runs pull_sources → compute_attention → surface_new_risks,
 * the last of which asks Opus to propose any new risks worth tracking.
 *
 * Idempotency: skip archetypes that already have a queued/running
 * weekly_discover. This protects against double-fires (manual + scheduled).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const archetypeParam = new URL(req.url).searchParams.get('archetype') ?? 'all'
  const sb = createServiceRoleClient()

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

  const { data: existing, error: existErr } = await sb
    .from('pipeline_runs')
    .select('archetype_id, status')
    .eq('pipeline_name', 'weekly_discover')
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
        pipeline_name: 'weekly_discover',
        archetype_id: id,
        status: 'queued',
        triggered_by: 'cron:weekly-discover',
        input_json: {
          // Pull a wider window for Pass B — discovery needs more context
          // than the daily Pass A update path. 7 days catches a full week
          // of news; surface_new_risks looks back 90 days on news_cache.
          since: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
          limit_per_adapter: 100,
        },
      })
      .select('id')
      .single()
    if (error) {
      console.error(`[cron] weekly-discover enqueue ${id} failed:`, error.message)
      continue
    }
    if (row?.id) enqueued.push({ id: row.id, archetype: id })
  }

  console.log(
    `[cron] weekly-discover: archetype=${archetypeParam} requested, ${enqueued.length} enqueued, ${busy.size} skipped (already busy)`,
  )

  return NextResponse.json({
    archetype: archetypeParam,
    enqueued,
    skipped_busy: [...busy],
  })
}
