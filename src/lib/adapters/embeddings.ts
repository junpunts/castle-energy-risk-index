/**
 * OpenAI text-embedding helper.
 *
 * Uses text-embedding-3-small (1536-dim, $0.02/M tokens) by default — same
 * model the synthetic-contract-library Supabase uses, so news embeddings
 * are directly comparable to library embeddings if we ever wire that path.
 *
 * Gated on OPENAI_API_KEY. If absent, returns null for every input; callers
 * MUST treat null as "no embedding available" and fall back gracefully. The
 * goal is for the pipeline to keep working keyword-only when the key isn't
 * configured.
 */

const MODEL = 'text-embedding-3-small'
const DIM = 1536
// Hard cap per input to stay under model token limits. ~8K chars ≈ 2K tokens.
const MAX_CHARS = 8000
// API batch size cap. OpenAI supports up to 2048 inputs per request; we
// stay smaller for predictable latency.
const BATCH = 96

export const EMBEDDING_DIM = DIM

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

/**
 * Embed an array of texts. Returns parallel array of embeddings (or null for
 * inputs that couldn't be embedded). Batches automatically; failures within a
 * batch turn into nulls without throwing.
 */
export async function embedTexts(
  texts: string[],
  log?: (msg: string) => void,
): Promise<(number[] | null)[]> {
  if (!embeddingsEnabled()) {
    return texts.map(() => null)
  }
  if (texts.length === 0) return []

  const out: (number[] | null)[] = new Array(texts.length).fill(null)
  for (let start = 0; start < texts.length; start += BATCH) {
    const slice = texts.slice(start, start + BATCH).map((t) => (t ?? '').slice(0, MAX_CHARS))
    try {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: MODEL, input: slice }),
      })
      if (!resp.ok) {
        log?.(`embeddings: HTTP ${resp.status} on batch ${start}-${start + slice.length}`)
        continue
      }
      const json = (await resp.json()) as { data: Array<{ index: number; embedding: number[] }> }
      for (const row of json.data ?? []) {
        if (row?.embedding?.length === DIM) {
          out[start + row.index] = row.embedding
        }
      }
    } catch (err) {
      log?.(`embeddings: ${(err as Error).message}`)
    }
  }
  return out
}

/** Cosine similarity in [-1, 1]. Returns 0 for mismatched dims or zero vectors. */
export function cosineSimilarity(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}
