import { loadAll, fmtUsd, fmtDate } from '../data.js';
import { openMarketModal, buildProjectMap } from '../components.js';

const state = {
  project: 'all',
  sort: 'relevance',
};

(async function init() {
  const { bundle, projects, markets } = await loadAll();
  const projectMap = buildProjectMap(projects);
  const marketsById = new Map(markets.map(m => [m.id, m]));
  const factorsById = new Map(bundle.factors.map(f => [f.id, f]));

  // Build per-market aggregate: relevance, projects hedged, expected-loss covered
  const byMarket = new Map();
  for (const h of bundle.hedges) {
    if (!byMarket.has(h.market_id)) {
      const m = marketsById.get(h.market_id);
      if (!m) continue;
      byMarket.set(h.market_id, { market: m, hedges: [], maxRelevance: 0, projects: new Set(), totalNotional: 0 });
    }
    const e = byMarket.get(h.market_id);
    if (!e) continue;
    e.hedges.push(h);
    e.maxRelevance = Math.max(e.maxRelevance, h.relevance);
    e.projects.add(h.project_id);
    e.totalNotional += h.notional_usd;
  }
  const entries = Array.from(byMarket.values());

  document.getElementById('filter-project').innerHTML = `
    <span class="eri-filter-label">Hedges project</span>
    <button class="eri-pill is-active" data-project="all">All</button>
    ${projects.map(p => `<button class="eri-pill" data-project="${p.id}">${p.name}</button>`).join('')}
  `;
  document.getElementById('filter-sort').innerHTML = `
    <span class="eri-filter-label">Sort by</span>
    <button class="eri-pill is-active" data-sort="relevance">Relevance</button>
    <button class="eri-pill" data-sort="yield">YES price (low→high)</button>
    <button class="eri-pill" data-sort="expiry">Expiry (soonest)</button>
    <button class="eri-pill" data-sort="volume">Volume</button>
  `;
  document.querySelectorAll('.eri-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrapper = btn.parentElement;
      wrapper.querySelectorAll('.eri-pill').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (btn.dataset.project) state.project = btn.dataset.project;
      if (btn.dataset.sort) state.sort = btn.dataset.sort;
      render();
    });
  });

  function render() {
    let list = entries.slice();
    if (state.project !== 'all') {
      list = list.filter(e => e.projects.has(state.project));
    }
    if (state.sort === 'relevance') list.sort((a, b) => b.maxRelevance - a.maxRelevance);
    if (state.sort === 'yield') list.sort((a, b) => a.market.yes_price - b.market.yes_price);
    if (state.sort === 'expiry') list.sort((a, b) => (a.market.expiry_date || '').localeCompare(b.market.expiry_date || ''));
    if (state.sort === 'volume') list.sort((a, b) => b.market.volume_usd - a.market.volume_usd);

    document.getElementById('count').textContent = `${list.length} market${list.length === 1 ? '' : 's'}`;

    if (!list.length) {
      document.getElementById('grid').innerHTML = '<div class="empty">No mapped hedges for those filters.</div>';
      return;
    }

    document.getElementById('grid').innerHTML = list.map(({ market, hedges, projects: projIds, totalNotional }) => {
      const chips = Array.from(projIds)
        .map(id => projectMap.get(id))
        .filter(Boolean)
        .map(p => `<span class="affected-chip">${escape(p.name)}</span>`)
        .join('');
      const factorTitles = hedges
        .map(h => factorsById.get(h.factor_id)?.title)
        .filter(Boolean)
        .slice(0, 2)
        .join(' · ');
      return `<article class="hedge-card" data-market-id="${escape(market.id)}">
        <div class="hedge-top">
          <div class="hedge-event">${escape(market.event_title || market.ticker)}</div>
          <span class="hedge-platform">${escape(market.platform)}</span>
        </div>
        <div class="hedge-title">${escape(market.title)}</div>
        <div class="hedge-bottom">
          <div>
            <span class="hedge-prob-label">YES</span>
            <div class="hedge-prob num">${Math.round(market.yes_price * 100)}%</div>
          </div>
          <div class="hedge-meta">
            <div>Vol ${fmtUsd(market.volume_usd)}</div>
            <div>Resolves ${escape(fmtDate(market.expiry_date))}</div>
          </div>
        </div>
        <div class="hedge-rationale">
          ${factorTitles ? `<div>Maps to ${escape(factorTitles)}</div>` : ''}
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${chips}</div>
        </div>
      </article>`;
    }).join('');

    document.querySelectorAll('.hedge-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.marketId;
        const m = marketsById.get(id);
        if (m) openMarketModal(m);
      });
    });
  }

  render();
  document.body.classList.add('is-loaded');
})();

function escape(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
