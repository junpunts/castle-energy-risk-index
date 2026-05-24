import { loadAll, fmtUsd } from '../data.js';
import {
  renderRiskTableHead, renderRiskRow, renderRiskDrawer, attachRiskRowHandlers,
  renderAttnBarometer, renderSparkline,
} from '../components.js';

(async function init() {
  try {
    const { bundle, projects, policies, markets } = await loadAll();
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const factorsById = new Map(bundle.factors.map(f => [f.id, f]));
    const scoresById = new Map(bundle.scores.map(s => [s.project_id, s]));

    // ── Hero metrics ────────────────────────────────────
    const totalCapex = projects.reduce((s, p) => s + p.capex_usd, 0);
    const weightedScore = projects.reduce((s, p) => {
      const sc = scoresById.get(p.id); return s + (sc ? sc.composite * p.capex_usd : 0);
    }, 0) / totalCapex;
    const activeThisWeek = policies.filter(p => {
      const d = new Date(p.latest_action_date);
      return !Number.isNaN(d.getTime()) && (Date.now() - d.getTime()) < 7 * 86400 * 1000;
    }).length;

    document.getElementById('hero').innerHTML = `
      <div class="eri-hero-item">
        <div class="eri-hero-label">Tracked capex</div>
        <div class="eri-hero-value">${fmtUsd(totalCapex)}</div>
        <div class="eri-hero-detail">${projects.length} projects in portfolio</div>
      </div>
      <div class="eri-hero-item">
        <div class="eri-hero-label">Weighted risk score</div>
        <div class="eri-hero-value">${Math.round(weightedScore)}<span style="color:var(--fg-3);font-size:18px;letter-spacing:0">/100</span></div>
        <div class="eri-hero-detail">capex-weighted composite</div>
      </div>
      <div class="eri-hero-item">
        <div class="eri-hero-label">Tracked risks</div>
        <div class="eri-hero-value">${bundle.factors.length}</div>
        <div class="eri-hero-detail">${bundle.factors.filter(f => f.likelihood_bucket === 'high').length} judged high-likelihood</div>
      </div>
      <div class="eri-hero-item">
        <div class="eri-hero-label">Live policy items</div>
        <div class="eri-hero-value">${policies.length}</div>
        <div class="eri-hero-detail">${activeThisWeek} updated in the last 7 days</div>
      </div>
    `;

    // ── Attention barometer ─────────────────────────────
    // Sum weekly attention across all factors → portfolio sparkline
    const weeks = (bundle.factors[0]?.attention_weekly || []).length;
    const weeklyTotals = Array(weeks).fill(0);
    for (const f of bundle.factors) {
      (f.attention_weekly || []).forEach((v, i) => weeklyTotals[i] += v);
    }
    const portfolioAttention = Math.round(
      bundle.factors.reduce((s, f) => s + f.attention_score, 0) / Math.max(1, bundle.factors.length)
    );
    const hottest = bundle.factors
      .filter(f => f.attention_score > 0)
      .sort((a, b) => b.attention_score - a.attention_score)[0];
    const hottestProject = hottest && projectMap.get(hottest.project_id);
    const hottestHeadline = hottest && {
      headline: `${hottest.title} is the dominant signal in Congress and the Federal Register this quarter.`,
      subline: hottest.our_view || (hottestProject
        ? `Most exposed: ${hottestProject.name}. Click into the row below to see related bills and mapped hedges.`
        : 'Click into the row below to see related bills and mapped hedges.'),
    };
    document.getElementById('barometer').innerHTML = renderAttnBarometer({
      portfolioAttention,
      hottest: hottestHeadline,
      weeklyTotals,
    });

    // ── Top risks table ─────────────────────────────────
    // Rank by attention × expected loss; cap at 15 rows
    const ranked = bundle.factors.slice().sort((a, b) => {
      const aEL = a.dollar_impact_usd * a.probability;
      const bEL = b.dollar_impact_usd * b.probability;
      // Weight: 0.55 × attention, 0.45 × expected-loss normalized to portfolio max
      const maxEL = Math.max(...bundle.factors.map(f => f.dollar_impact_usd * f.probability), 1);
      const aScore = a.attention_score * 0.55 + (aEL / maxEL * 100) * 0.45;
      const bScore = b.attention_score * 0.55 + (bEL / maxEL * 100) * 0.45;
      return bScore - aScore;
    }).slice(0, 15);

    document.getElementById('risk-table').innerHTML = `
      ${renderRiskTableHead({ showAffected: true })}
      ${ranked.map(f => renderRiskRow(f, projectMap, { showAffected: true })).join('')}
    `;

    attachRiskRowHandlers(document.getElementById('risk-table'), {
      onExpand: (factorId) => {
        const f = factorsById.get(factorId);
        const project = projectMap.get(f.project_id);
        return renderRiskDrawer(f, project, bundle.hedges, markets, policies);
      },
    });

    // ── Compact portfolio strip (replaces old card grid) ─
    const stripHtml = projects.map(p => {
      const score = scoresById.get(p.id);
      const subs = score.sub_scores.map(s =>
        `<span class="risk-legend-item"><span class="risk-legend-swatch is-${s.category}"></span><span class="risk-legend-num">${Math.round(s.value)}</span></span>`
      ).join('');
      return `<a class="eri-card" href="project.html?id=${encodeURIComponent(p.id)}" style="min-height:auto">
        <div class="eri-card-top">
          <div class="eri-card-meta">
            <span class="eri-eyebrow">${p.technology} · ${p.capacity_label}</span>
            <h3 class="eri-card-name">${p.name}</h3>
            <div class="eri-card-tech">${p.location}</div>
          </div>
          <div class="eri-score num">${score.composite}</div>
        </div>
        <div class="risk-legend" style="margin-top:14px">${subs}</div>
      </a>`;
    }).join('');
    document.getElementById('portfolio-strip').innerHTML = stripHtml;

    document.body.classList.add('is-loaded');
  } catch (e) {
    console.error(e);
    document.getElementById('risk-table').innerHTML = `<div class="empty">Could not load data: ${e.message}</div>`;
  }
})();
