/** Display helpers shared by public + admin views. Mirror the v2 prototype. */

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—'
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

export function fmtPct(n: number | null | undefined, d = 0): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(d)}%`
}

export function fmtSignedInt(n: number): string {
  if (n === 0) return '0'
  return n > 0 ? `+${n}` : `${n}`
}
