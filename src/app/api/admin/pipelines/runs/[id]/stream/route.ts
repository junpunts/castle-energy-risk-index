import { type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * SSE stream of pipeline_traces rows for a run. The stream:
 *   1. Sends every existing trace as a 'trace' event.
 *   2. Polls for new/updated rows every 1.5s and emits diffs.
 *   3. Sends a 'done' event and closes when the run status leaves the
 *      'running' / 'claimed' / 'queued' set.
 *
 * Why polling, not Realtime? The browser already subscribes to
 * pipeline_runs via Supabase Realtime for table-level live updates.
 * This SSE adds the structured stage-by-stage log + cost ticks the trace
 * inspector needs.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin()
  const sb = createServiceRoleClient()

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const seen = new Map<number, string>() // trace.id → completed_at|error signature

      function send(event: string, data: any) {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      let alive = true
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping ${Date.now()}\n\n`))
        } catch {
          alive = false
        }
      }, 15_000)

      try {
        while (alive) {
          // Read traces
          const { data: traces } = await sb
            .from('pipeline_traces')
            .select('*')
            .eq('pipeline_run_id', params.id)
            .order('started_at')

          for (const t of traces ?? []) {
            const sig = `${t.completed_at}|${t.error}`
            if (seen.get(t.id) === sig) continue
            seen.set(t.id, sig)

            send('trace', {
              kind: t.error ? 'error' : t.completed_at ? 'log' : 'stage',
              ts: t.completed_at ?? t.started_at,
              text: t.error
                ? `✗ ${t.stage_name}: ${t.error}`
                : t.completed_at
                  ? `✓ ${t.stage_name} (${t.duration_ms ?? '?'}ms, $${Number(t.cost_usd ?? 0).toFixed(4)})`
                  : `▸ ${t.stage_name}`,
            })
          }

          // Check run status
          const { data: run } = await sb
            .from('pipeline_runs')
            .select('status')
            .eq('id', params.id)
            .maybeSingle()

          if (!run || !['queued', 'claimed', 'running'].includes(run.status)) {
            send('done', { status: run?.status ?? 'unknown' })
            break
          }
          await new Promise((r) => setTimeout(r, 1500))
        }
      } catch (err) {
        try {
          send('trace', { kind: 'error', ts: new Date().toISOString(), text: `stream error: ${String(err)}` })
        } catch {}
      } finally {
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
