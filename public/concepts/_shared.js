// Tiny shared loader for the concept variants. Each concept does its own
// rendering — we only expose the raw data + a few utilities.

export async function loadBundle() {
  const [bundle, projects] = await Promise.all([
    fetch('../data/index.json', { cache: 'no-cache' }).then(r => r.json()),
    fetch('../data/projects.json', { cache: 'no-cache' }).then(r => r.json()),
  ]);
  return { bundle, projects };
}

export function fmtUsd(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
export function fmtPct(n, d = 0) { return n == null ? '—' : `${(n * 100).toFixed(d)}%`; }
export function escape(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
export function trunc(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

export const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MONTH_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'];

export const CAT_LABEL = { policy: 'Policy', trade: 'Trade', geopolitical: 'Geopolitical', macro: 'Macro' };
export const CAT_COLOR = {
  policy: '#246075',
  trade:  '#00544F',
  geopolitical: '#395938',
  macro:  '#3A5C9A',
};

export function calendarItems(bundle) {
  return (bundle.catalysts || []).map(c => {
    const dt = new Date(c.date + (c.date.length === 10 ? 'T12:00:00Z' : ''));
    return { ...c, dt, day: dt.getUTCDate(), monthIdx: dt.getUTCMonth(), year: dt.getUTCFullYear() };
  });
}

export function rankedFactors(bundle, n = 8) {
  return bundle.factors.slice()
    .sort((a, b) => (b.attention_score * b.dollar_impact_usd * b.probability) -
                    (a.attention_score * a.dollar_impact_usd * a.probability))
    .slice(0, n);
}
