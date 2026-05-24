// Shared render functions (vanilla, no framework).
import { escapeHtml, fmtUsd, fmtPct, fmtDate, relTime } from './data.js';

const CATS = ['policy', 'trade', 'geopolitical', 'macro'];
const CAT_LABEL = {
  policy: 'Policy',
  trade: 'Trade',
  geopolitical: 'Geopolitical',
  macro: 'Macro',
};

export function renderRiskBar(subScores, { large = false } = {}) {
  // Width = weight × value (out of 100 × weight), padded to fill the bar
  // We render the *contribution* width, which sums to composite/100 of bar width.
  // To make it always full-width, scale by total contribution.
  const total = subScores.reduce((acc, s) => acc + s.contribution, 0) || 1;
  const sizeClass = large ? ' is-large' : '';
  const segs = subScores.map(s => {
    const pct = (s.contribution / total) * 100;
    const tip = `${CAT_LABEL[s.category]} · ${Math.round(s.value)} / 100 · weight ${Math.round(s.weight * 100)}%`;
    return `<div class="risk-bar-seg is-${s.category}" style="width:${pct.toFixed(2)}%" title="${escapeHtml(tip)}" data-cat="${s.category}"></div>`;
  }).join('');
  return `<div class="risk-bar${sizeClass}">${segs}</div>`;
}

export function renderRiskLegend(subScores) {
  return `<div class="risk-legend">${subScores.map(s => `
    <span class="risk-legend-item">
      <span class="risk-legend-swatch is-${s.category}"></span>
      <span>${CAT_LABEL[s.category]}</span>
      <span class="risk-legend-num">${Math.round(s.value)}</span>
    </span>
  `).join('')}</div>`;
}

export function renderProjectCard(project, score, exposures) {
  const topExposures = exposures
    .slice()
    .sort((a, b) => (b.dollar_impact_usd * b.probability) - (a.dollar_impact_usd * a.probability))
    .slice(0, 2);
  return `<a class="eri-card" href="project.html?id=${encodeURIComponent(project.id)}">
    <div class="eri-card-top">
      <div class="eri-card-meta">
        <span class="eri-eyebrow">${escapeHtml(project.technology)} · ${escapeHtml(project.capacity_label)}</span>
        <h3 class="eri-card-name">${escapeHtml(project.name)}</h3>
        <div class="eri-card-tech">${escapeHtml(project.location)} · COD ${escapeHtml(project.cod_quarter)}</div>
      </div>
      <div class="eri-score num">${score.composite}</div>
    </div>
    <div class="eri-card-body">
      ${renderRiskBar(score.sub_scores)}
      ${renderRiskLegend(score.sub_scores)}
      <ul class="eri-card-bullets">
        ${topExposures.map(e => `<li>${escapeHtml(e.title)} · <span class="num">${fmtUsd(e.dollar_impact_usd * e.probability)}</span> expected loss</li>`).join('')}
      </ul>
    </div>
    <span class="eri-card-link">View project</span>
  </a>`;
}

export function renderSubScoreReadouts(subScores) {
  return `<div class="sub-scores">${subScores.map(s => `
    <div class="sub-score">
      <div class="sub-score-cat">${CAT_LABEL[s.category]} · ${Math.round(s.weight * 100)}%</div>
      <div class="sub-score-val num">${Math.round(s.value)}<span class="of">/100</span></div>
      <div class="sub-score-drivers">
        ${s.drivers.slice(0, 3).map(d => `<div>${escapeHtml(d)}</div>`).join('')}
      </div>
    </div>
  `).join('')}</div>`;
}

export function renderExposureRow(factor) {
  const expected = factor.dollar_impact_usd * factor.probability;
  return `<tr data-factor-id="${escapeHtml(factor.id)}">
    <td><span class="cat-pill is-${factor.category}">${CAT_LABEL[factor.category]}</span></td>
    <td>
      <div class="exposure-title">${escapeHtml(factor.title)}</div>
      <div class="exposure-desc">${escapeHtml(factor.description)}</div>
      ${factor.citation ? `<div class="exposure-citation">${escapeHtml(factor.citation)}</div>` : ''}
    </td>
    <td class="num">${fmtUsd(factor.dollar_impact_usd)}</td>
    <td class="num">${fmtPct(factor.probability)}</td>
    <td class="num">${fmtUsd(expected)}</td>
    <td>${escapeHtml(factor.status)}</td>
  </tr>`;
}

export function renderHedgeCard(hedge, market, factor) {
  if (!market) return '';
  return `<article class="hedge-card" data-market-id="${escapeHtml(market.id)}" data-factor-id="${escapeHtml(factor?.id || '')}">
    <div class="hedge-top">
      <div>
        <div class="hedge-event">${escapeHtml(market.event_title || market.ticker)}</div>
      </div>
      <span class="hedge-platform">${escapeHtml(market.platform)}</span>
    </div>
    <div class="hedge-title">${escapeHtml(market.title)}</div>
    <div class="hedge-bottom">
      <div>
        <span class="hedge-prob-label">YES</span>
        <div class="hedge-prob num">${Math.round(market.yes_price * 100)}%</div>
      </div>
      <div class="hedge-notional">
        <span class="label">Notional · hedge size</span>
        ${fmtUsd(hedge.notional_usd)}
      </div>
    </div>
    ${factor ? `<div class="hedge-rationale">Hedges <strong>${escapeHtml(factor.title)}</strong> (relevance ${hedge.relevance.toFixed(2)})</div>` : ''}
  </article>`;
}

export function renderTicker(items) {
  if (!items?.length) {
    return `<div class="news-ticker"><div class="news-ticker-track"><span class="news-item">No live policy items right now</span></div></div>`;
  }
  // Duplicate the list so the scroll loops seamlessly
  const doubled = items.concat(items);
  const dur = Math.max(60, items.length * 8);
  return `<div class="news-ticker" style="--ticker-dur:${dur}s">
    <div class="news-ticker-track">
      ${doubled.map(it => `<span class="news-item">
        <span class="source">${escapeHtml(it.source.replace('_', ' '))}</span>
        <span>${escapeHtml(it.title)}</span>
        <span class="source">${escapeHtml(it.latest_action_date ? relTime(it.latest_action_date) : '')}</span>
        <span class="dot">•</span>
      </span>`).join('')}
    </div>
  </div>`;
}

export function renderPolicyRow(item, projectMap) {
  const chips = (item.affected_project_ids || [])
    .map(id => projectMap.get(id))
    .filter(Boolean)
    .map(p => `<span class="affected-chip">${escapeHtml(p.name)}</span>`)
    .join('');
  const source = item.source.replace('_', ' ');
  const action = [item.latest_action, item.agency].filter(Boolean).join(' · ');
  return `<div class="policy-row" data-policy-id="${escapeHtml(item.id)}" tabindex="0" role="button">
    <div>
      <div class="policy-row-source">${escapeHtml(source)}</div>
      <div class="policy-row-source" style="margin-top:6px;color:var(--fg-2)">${escapeHtml(fmtDate(item.latest_action_date))}</div>
    </div>
    <div>
      <div class="policy-row-title">${escapeHtml(item.title)}</div>
      ${action ? `<div class="policy-row-action">${escapeHtml(action)}</div>` : ''}
    </div>
    <div class="policy-row-affected">${chips}</div>
  </div>`;
}

// Modal: open a backdrop with details for either a policy item or a market.
export function openPolicyModal(item) {
  const summary = item.summary || item.latest_action || '';
  const html = `<div class="modal-backdrop" data-modal>
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <div class="eri-eyebrow">${escapeHtml(item.source.replace('_', ' '))} · ${escapeHtml(fmtDate(item.latest_action_date))}</div>
        </div>
        <button class="modal-close" onclick="this.closest('[data-modal]').remove()" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>
      </div>
      <h2 class="modal-title">${escapeHtml(item.title)}</h2>
      ${summary ? `<p class="modal-summary">${escapeHtml(summary)}</p>` : ''}
      <div class="modal-meta">
        <div><div class="modal-meta-label">Severity</div><div class="modal-meta-value">${escapeHtml(item.severity)}</div></div>
        <div><div class="modal-meta-label">Source</div><div class="modal-meta-value">${escapeHtml(item.source.replace('_', ' '))}</div></div>
        <div><div class="modal-meta-label">Agency</div><div class="modal-meta-value">${escapeHtml(item.agency || '—')}</div></div>
      </div>
      <div class="modal-actions">
        ${item.url ? `<a class="btn-primary" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open source →</a>` : ''}
        <button class="btn-secondary" onclick="this.closest('[data-modal]').remove()">Close</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.body.querySelector('[data-modal]:last-of-type');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

export function openMarketModal(market) {
  const yes = Math.round(market.yes_price * 100);
  const html = `<div class="modal-backdrop" data-modal>
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div><div class="eri-eyebrow">${escapeHtml(market.platform.toUpperCase())} · ${escapeHtml(market.event_title || market.ticker)}</div></div>
        <button class="modal-close" onclick="this.closest('[data-modal]').remove()" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>
      </div>
      <h2 class="modal-title">${escapeHtml(market.title)}</h2>
      <div class="modal-meta">
        <div><div class="modal-meta-label">YES</div><div class="modal-meta-value">${yes}%</div></div>
        <div><div class="modal-meta-label">Volume</div><div class="modal-meta-value">${fmtUsd(market.volume_usd)}</div></div>
        <div><div class="modal-meta-label">Resolves</div><div class="modal-meta-value">${escapeHtml(fmtDate(market.expiry_date))}</div></div>
      </div>
      <div class="modal-actions">
        ${market.url ? `<a class="btn-primary" href="${escapeHtml(market.url)}" target="_blank" rel="noopener">Open on Kalshi →</a>` : ''}
        <button class="btn-secondary" onclick="this.closest('[data-modal]').remove()">Close</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.body.querySelector('[data-modal]:last-of-type');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

export function buildProjectMap(projects) {
  const m = new Map();
  for (const p of projects) m.set(p.id, p);
  return m;
}

// ── BlackRock-style risk row + sparkline ──────────────────

export function renderSparkline(weekly, { w = 140, h = 28 } = {}) {
  if (!weekly || !weekly.length) return '';
  const max = Math.max(1, ...weekly);
  const step = w / (weekly.length - 1 || 1);
  const points = weekly.map((v, i) => [i * step, h - (v / max) * (h - 4) - 2]);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const fill = `${line} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path class="fill" d="${fill}"/>
    <path class="line" d="${line}"/>
    <circle class="last" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2"/>
  </svg>`;
}

const LIKELIHOOD_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

export function renderLikelihoodPill(bucket) {
  return `<span class="likelihood-pill is-${bucket}">${LIKELIHOOD_LABEL[bucket] || bucket}</span>`;
}

// Map a factor's category + magnitude into per-sub-score arrows.
// The factor primarily loads onto its own category. We render one arrow row for the primary category;
// for high-impact factors we add a secondary arrow on the closest neighbor category.
const NEIGHBOR = {
  policy: 'trade',
  trade: 'policy',
  geopolitical: 'trade',
  macro: 'policy',
};
function arrowsFor(magnitude) {
  if (magnitude >= 2) return '↑↑';
  if (magnitude >= 1) return '↑';
  if (magnitude <= -2) return '↓↓';
  if (magnitude <= -1) return '↓';
  return '→';
}

export function renderImpactArrows(factor, project) {
  const expectedFrac = (factor.dollar_impact_usd * factor.probability) / (project?.capex_usd || factor.dollar_impact_usd || 1);
  let primary = 2;
  if (expectedFrac < 0.01) primary = 1;
  if (expectedFrac < 0.005) primary = 0;
  if (expectedFrac >= 0.04) primary = 2;
  const main = factor.category;
  const secondary = expectedFrac >= 0.03 ? NEIGHBOR[main] : null;
  const rows = [
    `<div class="impact-row"><span class="swatch is-${main}"></span><span class="label">${CAT_LABEL[main].slice(0, 4)}</span><span class="arrows">${arrowsFor(primary)}</span></div>`,
  ];
  if (secondary) {
    rows.push(`<div class="impact-row"><span class="swatch is-${secondary}"></span><span class="label">${CAT_LABEL[secondary].slice(0, 4)}</span><span class="arrows">${arrowsFor(1)}</span></div>`);
  }
  return `<div class="risk-impact">${rows.join('')}</div>`;
}

export function renderRiskTableHead({ showAffected = true } = {}) {
  return `<div class="risk-table-head">
    <div>${showAffected ? 'Risk · affected projects' : 'Risk'}</div>
    <div>Attention · 12-week activity</div>
    <div>Likelihood</div>
    <div>Castle view</div>
    <div>Impact</div>
    <div></div>
  </div>`;
}

export function renderRiskRow(factor, projectMap, { showAffected = true } = {}) {
  const project = projectMap.get(factor.project_id);
  const affectedChips = showAffected && project
    ? `<div class="affected"><span class="chip">${escapeHtml(project.name)}</span></div>`
    : '';
  return `<article class="risk-row" data-factor-id="${escapeHtml(factor.id)}" tabindex="0" role="button">
    <div class="risk-row-name">
      <div class="name-line">
        <span class="cat-pill is-${factor.category}">${CAT_LABEL[factor.category]}</span>
        <span class="title">${escapeHtml(factor.title)}</span>
      </div>
      ${factor.citation ? `<div class="citation">${escapeHtml(factor.citation)}</div>` : ''}
      ${affectedChips}
    </div>
    <div class="risk-attn">
      <span class="num">${factor.attention_score}</span>
      ${renderSparkline(factor.attention_weekly)}
      <span class="note">${sumActivity(factor.attention_weekly)} mentions · 12w</span>
    </div>
    <div>${renderLikelihoodPill(factor.likelihood_bucket)}</div>
    <div class="risk-view">${escapeHtml(factor.our_view || factor.description.split(/[.!?]/)[0])}</div>
    ${renderImpactArrows(factor, project)}
    <div class="risk-expand-toggle">+</div>
  </article>`;
}

function sumActivity(weekly) {
  return (weekly || []).reduce((a, b) => a + b, 0);
}

export function renderRiskDrawer(factor, project, hedges, markets, policies) {
  const expected = factor.dollar_impact_usd * factor.probability;
  const factorHedges = hedges
    .filter(h => h.factor_id === factor.id)
    .map(h => ({ h, market: markets.find(m => m.id === h.market_id) }))
    .filter(({ market }) => market)
    .slice(0, 4);

  // Up to 5 most recent policy items whose text references any factor keyword
  const f_kw = factor.keywords.map(k => k.toLowerCase());
  const relatedPolicies = policies
    .filter(p => {
      const text = (p.title + ' ' + (p.summary || '') + ' ' + (p.latest_action || '')).toLowerCase();
      return f_kw.some(k => k && k.length > 3 && text.includes(k));
    })
    .sort((a, b) => (b.latest_action_date || '').localeCompare(a.latest_action_date || ''))
    .slice(0, 5);

  return `<div class="risk-drawer">
    <div class="risk-drawer-grid">
      <div>
        <h4>Detailed view</h4>
        <p class="desc">${escapeHtml(factor.description)}</p>
        <div class="stat-line">
          <div class="stat-cell"><div class="stat-label">$ at risk</div><div class="stat-val">${fmtUsd(factor.dollar_impact_usd)}</div></div>
          <div class="stat-cell"><div class="stat-label">Probability</div><div class="stat-val">${fmtPct(factor.probability)}</div></div>
          <div class="stat-cell"><div class="stat-label">Expected loss</div><div class="stat-val">${fmtUsd(expected)}</div></div>
          <div class="stat-cell"><div class="stat-label">Source</div><div class="stat-val" style="font-size:12px;text-transform:uppercase">${escapeHtml(factor.source.replace('_', ' '))}</div></div>
        </div>
        ${relatedPolicies.length ? `<h4 style="margin-top:20px">Related items</h4>
          <div class="links">
            ${relatedPolicies.map(p => `<a href="${escapeHtml(p.url || '#')}" target="_blank" rel="noopener" title="${escapeHtml(p.title)}">${escapeHtml(truncate(p.title, 60))}</a>`).join('')}
          </div>` : ''}
      </div>
      <div>
        <h4>Mapped Kalshi hedges</h4>
        ${factorHedges.length ? `<div class="hedge-list">
          ${factorHedges.map(({ h, market }) => `<article class="hedge-card">
            <div class="hedge-top">
              <div class="hedge-event">${escapeHtml(market.event_title || market.ticker)}</div>
              <span class="hedge-platform">${escapeHtml(market.platform)}</span>
            </div>
            <div class="hedge-title">${escapeHtml(market.title)}</div>
            <div class="hedge-bottom">
              <div><span class="hedge-prob-label">YES</span><div class="hedge-prob num">${Math.round(market.yes_price * 100)}%</div></div>
              <div class="hedge-notional"><span class="label">Notional</span>${fmtUsd(h.notional_usd)}</div>
            </div>
          </article>`).join('')}
        </div>` : '<div class="empty" style="padding:16px">No mapped Kalshi market.</div>'}
      </div>
    </div>
  </div>`;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function attachRiskRowHandlers(container, { onExpand } = {}) {
  container.querySelectorAll('.risk-row').forEach(row => {
    const toggle = () => {
      const wasExpanded = row.classList.contains('is-expanded');
      // Collapse all other rows in the container
      container.querySelectorAll('.risk-row.is-expanded').forEach(r => {
        if (r !== row) {
          r.classList.remove('is-expanded');
          const t = r.querySelector('.risk-expand-toggle'); if (t) t.textContent = '+';
          const d = r.querySelector('.risk-drawer'); if (d) d.remove();
        }
      });
      if (wasExpanded) {
        row.classList.remove('is-expanded');
        row.querySelector('.risk-expand-toggle').textContent = '+';
        const d = row.querySelector('.risk-drawer'); if (d) d.remove();
      } else {
        row.classList.add('is-expanded');
        row.querySelector('.risk-expand-toggle').textContent = '−';
        if (onExpand) {
          const drawerHtml = onExpand(row.dataset.factorId);
          if (drawerHtml) row.insertAdjacentHTML('beforeend', drawerHtml);
        }
      }
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      toggle();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

export function renderAttnBarometer({ portfolioAttention, hottest, weeklyTotals }) {
  return `<section class="attn-barometer">
    <div>
      <span class="label">Portfolio attention · live · 12-week window</span>
      <h2>${escapeHtml(hottest ? hottest.headline : 'The portfolio is quiet this week.')}</h2>
      <p class="sub">${escapeHtml(hottest ? hottest.subline : 'No risk factor is currently registering elevated activity in Congress.gov or the Federal Register.')}</p>
    </div>
    <div class="reading">
      <span class="label">Attention reading</span>
      <div class="reading-val num">${portfolioAttention}</div>
      ${renderSparkline(weeklyTotals, { w: 240, h: 48 })}
      <span class="label" style="margin-top:6px;display:block">12-week activity · all risks</span>
    </div>
  </section>`;
}

export { CATS, CAT_LABEL, fmtUsd, fmtPct };
