// Tiny fetch helper. All JSON lives in /data/ relative to the page.
const _cache = new Map();

export async function loadJSON(name) {
  if (_cache.has(name)) return _cache.get(name);
  const res = await fetch(`./data/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`failed to load ${name}.json (${res.status})`);
  const data = await res.json();
  _cache.set(name, data);
  return data;
}

export async function loadAll() {
  const [bundle, projects, policies, markets] = await Promise.all([
    loadJSON('index'),
    loadJSON('projects'),
    loadJSON('policies'),
    loadJSON('markets'),
  ]);
  return { bundle, projects, policies, markets };
}

export function projectById(projects, id) {
  return projects.find(p => p.id === id) || null;
}

export function factorsForProject(bundle, projectId) {
  return (bundle.factors || []).filter(f => f.project_id === projectId);
}

export function scoreForProject(bundle, projectId) {
  return (bundle.scores || []).find(s => s.project_id === projectId);
}

export function hedgesForProject(bundle, projectId) {
  return (bundle.hedges || []).filter(h => h.project_id === projectId);
}

export function marketById(markets, id) {
  return markets.find(m => m.id === id) || null;
}

export function fmtUsd(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtPct(n, digits = 0) {
  if (n == null) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} months ago`;
  return `${Math.round(months / 12)} years ago`;
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
