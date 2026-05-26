/**
 * Anthropic SDK wrapper with sane defaults and a single retry on transient
 * failures (5xx, 429). Used by every pipeline stage that calls the LLM.
 */

import Anthropic from '@anthropic-ai/sdk'

export const DEFAULT_MODEL_SONNET = 'claude-sonnet-4-5'
export const DEFAULT_MODEL_OPUS = 'claude-opus-4-5'

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (client) return client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  client = new Anthropic({ apiKey: key, maxRetries: 0 }) // we handle retry ourselves
  return client
}

/**
 * Call .messages.create with one retry on transient failures.
 * Wrap with llmLimit() at the call site if you want concurrency control.
 */
export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const sdk = getAnthropic()
  try {
    return await sdk.messages.create(params)
  } catch (err: any) {
    if (isTransient(err)) {
      // small jittered backoff
      await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1500)))
      return await sdk.messages.create(params)
    }
    throw err
  }
}

function isTransient(err: any): boolean {
  const status = err?.status ?? err?.response?.status
  if (status === 429) return true
  if (typeof status === 'number' && status >= 500) return true
  // Network blip
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'EAI_AGAIN') {
    return true
  }
  return false
}
