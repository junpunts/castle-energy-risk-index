/**
 * Anthropic token → USD pricing. Anthropic doesn't return cost in responses,
 * so we compute from the `usage` block ourselves.
 *
 * Prices are per 1M tokens. Cached read tokens are billed at 10% (per
 * Anthropic public pricing). Cache writes are billed at 125%.
 *
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 * Update this table when Anthropic changes pricing or adds a new model.
 */

export interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface ModelPrice {
  input: number   // $/1M input tokens
  output: number  // $/1M output tokens
  cacheWrite?: number
  cacheRead?: number
}

const PRICING: Record<string, ModelPrice> = {
  // Claude Sonnet 4 / 4.5 — same pricing tier as Sonnet 3.5.
  'claude-sonnet-4-5':        { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4':          { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-3-5':        { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-3-5-sonnet-latest': { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 },

  // Opus 4 / 4.5 / 4.8 — same pricing tier across the 4.x line.
  'claude-opus-4-8':          { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-7':          { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-5':          { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4':            { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },

  // Haiku — fallback for cheap calls.
  'claude-haiku-4-5':         { input: 1, output: 5 },
  'claude-3-5-haiku-latest':  { input: 1, output: 5 },
}

/**
 * Compute USD cost from a usage block. Returns 0 if the model isn't priced
 * (better to undercount than to crash a pipeline on a model bump).
 */
export function priceFor(model: string, usage: AnthropicUsage): number {
  const key = pricingKeyFor(model)
  const price = PRICING[key]
  if (!price) return 0

  const inTok = usage.input_tokens ?? 0
  const outTok = usage.output_tokens ?? 0
  const cwTok = usage.cache_creation_input_tokens ?? 0
  const crTok = usage.cache_read_input_tokens ?? 0

  return (
    (inTok / 1_000_000) * price.input +
    (outTok / 1_000_000) * price.output +
    (cwTok / 1_000_000) * (price.cacheWrite ?? price.input) +
    (crTok / 1_000_000) * (price.cacheRead ?? price.input)
  )
}

function pricingKeyFor(model: string): string {
  // Models come back as "claude-sonnet-4-5-20250929" etc; strip the date.
  // Also handle "claude-3-5-sonnet-20241022" style names by mapping to the
  // -latest entry.
  if (PRICING[model]) return model
  // Strip trailing -YYYYMMDD
  const noDate = model.replace(/-\d{8}$/, '')
  if (PRICING[noDate]) return noDate
  // Common synonyms
  if (noDate.includes('claude-3-5-sonnet')) return 'claude-3-5-sonnet-latest'
  if (noDate.includes('claude-3-5-haiku')) return 'claude-3-5-haiku-latest'
  if (noDate.startsWith('claude-sonnet')) return 'claude-sonnet-4-5'
  if (noDate.startsWith('claude-opus')) return 'claude-opus-4-5'
  if (noDate.startsWith('claude-haiku')) return 'claude-haiku-4-5'
  return noDate
}
