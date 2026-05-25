import { NextResponse, type NextRequest } from 'next/server'

/**
 * Daily-refresh cron entrypoint.
 *
 * The Render Cron Job (see render.yaml) curls this endpoint with the
 * CRON_SECRET header. The endpoint validates the secret, parses
 * `?archetype=<id>|all`, and enqueues one `pipeline_runs` row per archetype
 * with `status='queued'`. The worker (separate Render service) picks them up.
 *
 * STUB for M0 — full implementation lands in M8 alongside the rest of the
 * daily-refresh pipeline. Right now we just authenticate and acknowledge.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const archetype = new URL(req.url).searchParams.get('archetype') ?? 'all'
  // TODO(M8): insert pipeline_runs rows here
  console.log(`[cron] daily-refresh trigger received for archetype=${archetype}`)

  return NextResponse.json({ enqueued: 0, archetype, note: 'M0 stub' })
}
