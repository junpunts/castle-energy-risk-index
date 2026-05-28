/**
 * Castle's-view generation methodology — the single source of truth for HOW a
 * risk's `view` is written.
 *
 * Edit `CASTLE_VIEW_SPEC` to change the house style everywhere at once. It is
 * consumed by:
 *   - the cron's Pass A (lib/agent/pass-a.ts) — every daily refresh writes/rewrites
 *     views to this spec, so legacy long-form views migrate to it over time;
 *   - the copilot and any one-off reformat pass.
 *
 * Methodology v2 ("headline"): the view is a two-sentence headline, not a
 * paragraph and not a restatement of the numbers shown next to it.
 */

export const VIEW_METHODOLOGY_VERSION = 'v2-headline'

/** Hard caps the lint enforces. Kept small so the view reads like a headline. */
export const VIEW_SENTENCE_CAP = 2
export const VIEW_WORD_CAP = 50

export const CASTLE_VIEW_SPEC = `Castle's view reads like a TWO-SENTENCE HEADLINE — not a paragraph, and not a summary of the numbers shown beside it.

  - Exactly two sentences. ~40 words, hard cap ${VIEW_WORD_CAP}.
  - Sentence 1 — THE CALL: the verdict in headline voice. Is this the binding constraint on the archetype, and the single reason why.
  - Sentence 2 — THE MOVE + THE HEDGE: the most material recent development and the contract or milestone ladder to express it.

Format (strict):
  - Probabilities are whole-number percentages — "28%", never "0.28".
  - Present tense, declarative, active voice. No hedging verbs (may, could, is likely to).
  - Do NOT restate probability, attention, $-at-risk, or IRR — those render directly above the view.
  - Name at most one primary source inline. No semicolons, no run-on sentences.`

/** The block injected into LLM system prompts wherever a view is authored. */
export function viewMethodologyBlock(): string {
  return `CASTLE'S VIEW — HOUSE FORMAT (methodology ${VIEW_METHODOLOGY_VERSION}; follow exactly when writing the \`view\` field):\n${CASTLE_VIEW_SPEC}`
}

export interface ViewLint {
  ok: boolean
  wordCount: number
  sentenceCount: number
  /** Decimal-probability tokens found (e.g. "0.28") — should be percentages. */
  decimals: string[]
}

// Standalone "0.xx" not part of a larger number (so "1.25" / "10.0" don't match).
const DECIMAL_PROB = /(?<![\d.])0\.\d{1,2}(?![\d.])/g

/**
 * Advisory check that a view conforms to the methodology. Used by Pass A to
 * self-verify and by a reformat pass to confirm output. Not wired into the Zod
 * apply-path schema (that would reject legacy views and break applies until
 * everything is regenerated).
 */
export function lintView(view: string): ViewLint {
  const trimmed = view.trim()
  const wordCount = (trimmed.match(/\S+/g) ?? []).length
  const sentenceCount = (trimmed.match(/[.!?]+(?:\s|$)/g) ?? []).length || (trimmed ? 1 : 0)
  const decimals = trimmed.match(DECIMAL_PROB) ?? []
  return {
    ok: wordCount <= VIEW_WORD_CAP && sentenceCount <= VIEW_SENTENCE_CAP && decimals.length === 0,
    wordCount,
    sentenceCount,
    decimals,
  }
}
