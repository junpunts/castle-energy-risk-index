#!/usr/bin/env node
/**
 * Cron trigger — Render Cron Job entrypoint.
 *
 * Single responsibility: POST to /api/cron/<name> on the web service with
 * the CRON_SECRET header. The web endpoint does the work.
 *
 * Usage:
 *   node scripts/trigger-cron.mjs daily-refresh [archetype=all]
 */

const [, , name = 'daily-refresh', archetype = 'all'] = process.argv

const webUrl = process.env.WEB_URL
const cronSecret = process.env.CRON_SECRET

if (!webUrl) {
  console.error('WEB_URL not set')
  process.exit(2)
}
if (!cronSecret) {
  console.error('CRON_SECRET not set')
  process.exit(2)
}

const url = `${webUrl}/api/cron/${name}?archetype=${encodeURIComponent(archetype)}`
console.log(`[cron] POST ${url}`)

const res = await fetch(url, {
  method: 'POST',
  headers: { 'x-cron-secret': cronSecret },
})

const body = await res.text()
console.log(`[cron] ${res.status} ${body}`)

if (!res.ok) process.exit(1)
