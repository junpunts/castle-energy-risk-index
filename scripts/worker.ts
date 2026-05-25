/**
 * Worker entrypoint — long-lived Node process.
 *
 * In M5 this becomes the claim_next_run polling loop that drives pipelines.
 * In M0 it's a heartbeat so the Render worker service has something to keep
 * alive and we can see logs in the dashboard.
 */

const WORKER_ID = crypto.randomUUID().slice(0, 8)
const HEARTBEAT_MS = 30_000

let shuttingDown = false
process.on('SIGTERM', () => {
  console.log(`[worker:${WORKER_ID}] SIGTERM received, draining`)
  shuttingDown = true
})
process.on('SIGINT', () => {
  console.log(`[worker:${WORKER_ID}] SIGINT received, draining`)
  shuttingDown = true
})

async function main() {
  console.log(`[worker:${WORKER_ID}] alive`)
  while (!shuttingDown) {
    console.log(`[worker:${WORKER_ID}] heartbeat ${new Date().toISOString()}`)
    // TODO(M5): claim_next_run + executePipeline
    await new Promise((r) => setTimeout(r, HEARTBEAT_MS))
  }
  console.log(`[worker:${WORKER_ID}] shutdown clean`)
}

main().catch((err) => {
  console.error(`[worker:${WORKER_ID}] fatal`, err)
  process.exit(1)
})
