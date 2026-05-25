import { NextResponse } from 'next/server'

/**
 * Health probe. Render's web service health-check hits this every 30s.
 * Returns 200 quickly; deeper checks (Supabase round-trip, last-worker-seen)
 * are added in M10.
 */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'web', timestamp: new Date().toISOString() })
}
