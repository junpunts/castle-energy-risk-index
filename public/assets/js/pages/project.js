import { loadAll, projectById, factorsForProject, scoreForProject, hedgesForProject, fmtUsd, fmtPct } from '../data.js';
import {
  renderRiskBar, renderRiskLegend, renderSubScoreReadouts,
  renderRiskTableHead, renderRiskRow, renderRiskDrawer, attachRiskRowHandlers,
} from '../components.js';

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || 'lone-star-solar-i';
  try {
    const { bundle, projects, markets, policies } = await loadAll();
    const project = projectById(projects, id);
    if (!project) {
      document.getElementById('content').innerHTML = `<div class="empty">No project with id "${id}".</div>`;
      return;
    }
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const score = scoreForProject(bundle, id);
    const factors = factorsForProject(bundle, id);
    const factorsById = new Map(factors.map(f => [f.id, f]));
    const hedges = hedgesForProject(bundle, id);

    document.title = `${project.name} — Castle Energy Risk Index`;

    // ── Header ──────────────────────────────────────────
    document.getElementById('hero').innerHTML = `
      <div>
        <div class="eri-eyebrow">${escape(project.technology)} · ${escape(project.capacity_label)} · ${escape(project.location)}</div>
        <h1 class="eri-h1">${escape(project.name)}</h1>
        <div class="project-hero-tags">
          <span class="tag">${escape(project.cod_quarter)} COD</span>
          <span class="tag">${fmtUsd(project.capex_usd)} capex</span>
          <span class="tag">Target equity IRR ${fmtPct(project.equity_irr_target, 1)}</span>
          <span class="tag">${escape(project.offtake_status)}</span>
        </div>
      </div>
      <div class="project-score-stack">
        <span class="eri-eyebrow">Composite risk index</span>
        <div class="eri-score is-mega num">${score.composite}</div>
        <div class="eri-eyebrow" style="margin-top:8px">of 100</div>
      </div>
    `;

    // ── Risk panel (stacked bar + sub-score readouts) ───
    document.getElementById('risk-panel').innerHTML = `
      ${renderRiskBar(score.sub_scores, { large: true })}
      ${renderRiskLegend(score.sub_scores)}
      ${renderSubScoreReadouts(score.sub_scores)}
    `;

    // ── BlackRock-style risk table (filtered to project) ─
    const ranked = factors.slice().sort((a, b) => {
      const aEL = a.dollar_impact_usd * a.probability;
      const bEL = b.dollar_impact_usd * b.probability;
      const maxEL = Math.max(...factors.map(f => f.dollar_impact_usd * f.probability), 1);
      const aScore = a.attention_score * 0.55 + (aEL / maxEL * 100) * 0.45;
      const bScore = b.attention_score * 0.55 + (bEL / maxEL * 100) * 0.45;
      return bScore - aScore;
    });
    document.getElementById('risk-table').innerHTML = `
      ${renderRiskTableHead({ showAffected: false })}
      ${ranked.map(f => renderRiskRow(f, projectMap, { showAffected: false })).join('')}
    `;
    attachRiskRowHandlers(document.getElementById('risk-table'), {
      onExpand: (factorId) => {
        const f = factorsById.get(factorId);
        return renderRiskDrawer(f, project, hedges, markets, policies);
      },
    });

    // ── Narrative + suppliers ───────────────────────────
    document.getElementById('narrative').innerHTML = `<p class="eri-lead">${escape(project.narrative)}</p>`;
    document.getElementById('suppliers').innerHTML = `
      <table class="exposure-table">
        <thead>
          <tr><th>Supplier</th><th>Country</th><th>Component</th><th>Share</th></tr>
        </thead>
        <tbody>
          ${project.key_suppliers.map(s => `<tr>
            <td class="exposure-title">${escape(s.name)}</td>
            <td>${escape(s.country)}</td>
            <td>${escape(s.component_type)}</td>
            <td class="num">${fmtPct(s.share_of_supply)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    document.body.classList.add('is-loaded');
  } catch (e) {
    console.error(e);
    document.getElementById('content').innerHTML = `<div class="empty">Could not load data: ${e.message}</div>`;
  }
})();

function escape(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
