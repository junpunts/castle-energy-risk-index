import { loadAll, fmtDate } from '../data.js';
import { renderPolicyRow, buildProjectMap, openPolicyModal } from '../components.js';

const state = {
  source: 'all',
  project: 'all',
  window: 'all',
};

(async function init() {
  const { policies, projects } = await loadAll();
  const projectMap = buildProjectMap(projects);
  const policiesById = new Map(policies.map(p => [p.id, p]));

  // Sources + projects for filter chips
  const sources = Array.from(new Set(policies.map(p => p.source))).sort();

  document.getElementById('filter-source').innerHTML = `
    <span class="eri-filter-label">Source</span>
    <button class="eri-pill is-active" data-source="all">All</button>
    ${sources.map(s => `<button class="eri-pill" data-source="${s}">${s.replace('_', ' ')}</button>`).join('')}
  `;
  document.getElementById('filter-project').innerHTML = `
    <span class="eri-filter-label">Project</span>
    <button class="eri-pill is-active" data-project="all">All</button>
    ${projects.map(p => `<button class="eri-pill" data-project="${p.id}">${p.name}</button>`).join('')}
  `;
  document.getElementById('filter-window').innerHTML = `
    <span class="eri-filter-label">Window</span>
    <button class="eri-pill" data-window="7">7 days</button>
    <button class="eri-pill" data-window="30">30 days</button>
    <button class="eri-pill" data-window="90">90 days</button>
    <button class="eri-pill is-active" data-window="all">All time</button>
  `;

  document.querySelectorAll('.eri-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrapper = btn.parentElement;
      wrapper.querySelectorAll('.eri-pill').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (btn.dataset.source) state.source = btn.dataset.source;
      if (btn.dataset.project) state.project = btn.dataset.project;
      if (btn.dataset.window) state.window = btn.dataset.window;
      render();
    });
  });

  function render() {
    let filtered = policies.slice();
    if (state.source !== 'all') {
      filtered = filtered.filter(p => p.source === state.source);
    }
    if (state.project !== 'all') {
      filtered = filtered.filter(p => (p.affected_project_ids || []).includes(state.project));
    }
    if (state.window !== 'all') {
      const days = parseInt(state.window, 10);
      const cutoff = Date.now() - days * 86400 * 1000;
      filtered = filtered.filter(p => {
        const d = new Date(p.latest_action_date);
        return !Number.isNaN(d.getTime()) && d.getTime() >= cutoff;
      });
    }
    filtered.sort((a, b) => (b.latest_action_date || '').localeCompare(a.latest_action_date || ''));

    document.getElementById('count').textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;

    if (!filtered.length) {
      document.getElementById('list').innerHTML = '<div class="empty">No policy items match those filters.</div>';
      return;
    }
    document.getElementById('list').innerHTML = filtered.map(item => renderPolicyRow(item, projectMap)).join('');
    document.querySelectorAll('.policy-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.policyId;
        const item = policiesById.get(id);
        if (item) openPolicyModal(item);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
    });
  }

  render();
  document.body.classList.add('is-loaded');
})();
