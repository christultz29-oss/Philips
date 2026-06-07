// public/js/dashboard.js — Dashboard page logic

// ================================================================
// STATE
// ================================================================
const DashState = {
  kpis: null,
  criticalCases: [],
  agentPerf: [],
};

// ================================================================
// ENTRY POINT
// ================================================================
async function loadDashboardPage() {
  const page = document.getElementById('page-dashboard');
  if (!page) return;

  // Set month picker value
  const mp = document.getElementById('dash-month');
  if (mp) mp.value = AppState.selectedMonth;

  // Render skeleton KPIs immediately
  document.getElementById('dash-kpi-grid').innerHTML = Array(8).fill(0).map(() => `
    <div class="kpi-card accent" style="min-height:90px;">
      <div class="kpi-label" style="background:var(--bg-raised);border-radius:4px;width:60%;height:11px;margin-bottom:12px;"></div>
      <div style="background:var(--bg-raised);border-radius:4px;width:40%;height:28px;"></div>
    </div>
  `).join('');

  document.getElementById('dash-critical-body').innerHTML = loadingHTML('Loading critical cases...');
  document.getElementById('dash-agent-body').innerHTML    = loadingHTML('Loading agent performance...');
  document.getElementById('dash-sla-content').innerHTML   = loadingHTML('Loading SLA data...');

  // Fetch all in parallel
  await Promise.all([
    fetchAndRenderKpis(),
    fetchAndRenderCriticalCases(),
    fetchAndRenderAgentPerf(),
  ]);
}

// ================================================================
// KPI CARDS
// ================================================================
async function fetchAndRenderKpis() {
  const { selectedMonth: month, selectedCountry: country } = AppState;

  let kpis = null;
  let error = null;

  try {
    const result = await kpisApi.getKpis(month, country || null);
    error = result.error;
    kpis  = result.data;
  } catch (e) {
    error = e;
  }

  const grid = document.getElementById('dash-kpi-grid');

  if (error || !kpis) {
    // Fallback: query tables directly
    const fallback = await buildFallbackKpis();
    kpis = fallback;
  }

  if (!kpis) {
    grid.innerHTML = `<div class="inline-error" style="grid-column:1/-1">Failed to load KPIs</div>`;
    return;
  }

  // Render KPI cards for each module
  const cards = [
    { label: 'Total Cases',           value: kpis.total_cases        ?? '—', color: 'accent' },
    { label: 'RMA Cancellations',     value: kpis.total_cancellations ?? '—', color: 'accent', sub: 'Open cases' },
    { label: 'Credit Notes',          value: kpis.total_credit_notes  ?? '—', color: 'purple', sub: 'Pending' },
    { label: 'Refunds Pending',       value: kpis.total_refunds       ?? '—', color: 'yellow', sub: 'Waiting' },
    { label: 'Payment Reserves',      value: kpis.total_reserves      ?? '—', color: 'accent', sub: 'Active' },
    { label: 'SLA Compliance',        value: kpis.sla_compliance_pct != null ? `${kpis.sla_compliance_pct}%` : '—', color: kpis.sla_compliance_pct >= 80 ? 'green' : 'red', sub: '80% target' },
    { label: 'Overdue (Red SLA)',     value: kpis.sla_red_count       ?? '—', color: 'red',    sub: '5+ days' },
    { label: 'At Risk (Yellow SLA)',  value: kpis.sla_yellow_count    ?? '—', color: 'yellow', sub: '3–5 days' },
  ];

  grid.innerHTML = cards.map(c => `
    <div class="kpi-card ${c.color}">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value ${c.color}">${c.value}</div>
      ${c.sub ? `<div class="kpi-sub">${c.sub}</div>` : ''}
    </div>
  `).join('');

  // Also render SLA gauge
  renderSlaGauge(kpis);
}

async function buildFallbackKpis() {
  // Query each table for counts when RPC fails
  try {
    const [canc, notes, refs, res] = await Promise.all([
      window.db.from('rma_cancellations').select('id, sla_status', { count: 'exact', head: false }),
      window.db.from('credit_notes').select('id, sla_status', { count: 'exact', head: false }),
      window.db.from('refund_requests').select('id, sla_status', { count: 'exact', head: false }),
      window.db.from('payment_reserves').select('id, sla_status', { count: 'exact', head: false }),
    ]);

    const all = [
      ...(canc.data || []),
      ...(notes.data || []),
      ...(refs.data || []),
      ...(res.data || []),
    ];
    const total = all.length;
    const green  = all.filter(r => r.sla_status === 'A_green').length;
    const yellow = all.filter(r => r.sla_status === 'B_yellow').length;
    const red    = all.filter(r => r.sla_status === 'C_red').length;
    const sla_pct = total > 0 ? Math.round((green / total) * 100) : 0;

    return {
      total_cases:          total,
      total_cancellations:  canc.count  || canc.data?.length || 0,
      total_credit_notes:   notes.count || notes.data?.length || 0,
      total_refunds:        refs.count  || refs.data?.length || 0,
      total_reserves:       res.count   || res.data?.length || 0,
      sla_compliance_pct:   sla_pct,
      sla_green_count:      green,
      sla_yellow_count:     yellow,
      sla_red_count:        red,
    };
  } catch (e) {
    return null;
  }
}

// ================================================================
// SLA GAUGE
// ================================================================
function renderSlaGauge(kpis) {
  const el = document.getElementById('dash-sla-content');
  if (!el) return;

  const total  = kpis.total_cases || 1;
  const green  = kpis.sla_green_count  || 0;
  const yellow = kpis.sla_yellow_count || 0;
  const red    = kpis.sla_red_count    || 0;

  const pGreen  = total > 0 ? Math.round((green  / total) * 100) : 0;
  const pYellow = total > 0 ? Math.round((yellow / total) * 100) : 0;
  const pRed    = total > 0 ? Math.round((red    / total) * 100) : 0;
  const compliance = kpis.sla_compliance_pct ?? pGreen;

  el.innerHTML = `
    <div class="sla-gauge-title">SLA Adherence — Target: 80% On-Time</div>

    <div class="sla-bar-row">
      <div class="sla-bar-label">On Time (1-2d)</div>
      <div class="sla-bar-track">
        <div class="sla-bar-fill green" style="width:${pGreen}%"></div>
        <div class="sla-target-line" title="80% target"></div>
      </div>
      <div class="sla-bar-pct" style="color:var(--sla-green)">${pGreen}%</div>
    </div>

    <div class="sla-bar-row">
      <div class="sla-bar-label">At Risk (3-5d)</div>
      <div class="sla-bar-track">
        <div class="sla-bar-fill yellow" style="width:${pYellow}%"></div>
      </div>
      <div class="sla-bar-pct" style="color:var(--sla-yellow)">${pYellow}%</div>
    </div>

    <div class="sla-bar-row">
      <div class="sla-bar-label">Overdue (5d+)</div>
      <div class="sla-bar-track">
        <div class="sla-bar-fill red" style="width:${pRed}%"></div>
      </div>
      <div class="sla-bar-pct" style="color:var(--sla-red)">${pRed}%</div>
    </div>

    <div class="sla-summary">
      <div class="sla-summary-item">
        <div class="sla-dot" style="background:var(--sla-green)"></div>
        <span><strong>${green}</strong> On Time</span>
      </div>
      <div class="sla-summary-item">
        <div class="sla-dot" style="background:var(--sla-yellow)"></div>
        <span><strong>${yellow}</strong> At Risk</span>
      </div>
      <div class="sla-summary-item">
        <div class="sla-dot" style="background:var(--sla-red)"></div>
        <span><strong>${red}</strong> Overdue</span>
      </div>
      <div class="sla-summary-item" style="margin-left:auto;">
        <span style="color:var(--text-muted);">Overall compliance:</span>
        <strong style="color:${compliance >= 80 ? 'var(--sla-green)' : 'var(--sla-red)'};margin-left:4px;">${compliance}%</strong>
        <span style="color:var(--text-hint);font-size:11px;margin-left:2px;">${compliance >= 80 ? '✓ On target' : '✗ Below target'}</span>
      </div>
    </div>
  `;
}

// ================================================================
// CRITICAL CASES
// ================================================================
async function fetchAndRenderCriticalCases() {
  const tbody = document.getElementById('dash-critical-body');

  let data = null, error = null;
  try {
    const result = await kpisApi.getCriticalCases();
    data  = result.data;
    error = result.error;
  } catch (e) {
    error = e;
  }

  if (error || !data) {
    // Fallback: directly query for red SLA cases
    const { data: fallback } = await window.db
      .from('bo_unified_dashboard')
      .select('*')
      .eq('sla_status', 'C_red')
      .order('aging_days', { ascending: false })
      .limit(20);
    data = fallback || [];
  }

  DashState.criticalCases = data;

  if (!data.length) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-state-icon">✓</div>
          <div class="empty-state-title">No critical cases</div>
          <div class="empty-state-sub">All cases are within SLA</div>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr class="row-red">
      <td><span class="badge badge-${r.module || 'open'}" style="font-size:10px;">${(r.module || r.type || 'case').toUpperCase()}</span></td>
      <td class="mono">${r.case_number || r.id?.slice(0,8) || '—'}</td>
      <td>${r.country || '—'}</td>
      <td>${r.agent_name || r.agent_id || '—'}</td>
      <td><span class="badge sla-red">Overdue · ${r.aging_days || '?'}d</span></td>
      <td class="muted">${fmtDate(r.created_at)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>
  `).join('');
}

// ================================================================
// AGENT PERFORMANCE
// ================================================================
async function fetchAndRenderAgentPerf() {
  const { selectedMonth: month, selectedCountry: country } = AppState;
  const tbody = document.getElementById('dash-agent-body');

  let data = null, error = null;
  try {
    const result = await kpisApi.getAgentPerformance(month, country || null);
    data  = result.data;
    error = result.error;
  } catch (e) {
    error = e;
  }

  if (error || !data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-title">No performance data</div>
        <div class="empty-state-sub">No data for ${month}${country ? ' · ' + country : ''}</div>
      </div>
    </td></tr>`;
    return;
  }

  DashState.agentPerf = data;

  tbody.innerHTML = data.map(r => {
    const compliance = r.sla_compliance_pct ?? r.compliance_pct ?? 0;
    const compColor  = compliance >= 80 ? 'var(--sla-green)' : compliance >= 60 ? 'var(--sla-yellow)' : 'var(--sla-red)';
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="user-avatar-sm">${(r.agent_name || '?')[0].toUpperCase()}</div>
            <span>${r.agent_name || r.agent_id || '—'}</span>
          </div>
        </td>
        <td class="muted">${r.country || '—'}</td>
        <td>${r.total_cases ?? '—'}</td>
        <td><span style="color:var(--sla-green)">${r.on_time_cases ?? '—'}</span></td>
        <td><span style="color:var(--sla-red)">${r.overdue_cases ?? '—'}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:6px;background:var(--bg-raised);border-radius:999px;overflow:hidden;min-width:60px;">
              <div style="height:100%;width:${Math.min(compliance,100)}%;background:${compColor};border-radius:999px;"></div>
            </div>
            <span style="color:${compColor};font-weight:600;font-size:12px;width:36px;text-align:right;">${compliance}%</span>
          </div>
        </td>
        <td class="muted">${r.avg_aging_days != null ? r.avg_aging_days + 'd avg' : '—'}</td>
      </tr>
    `;
  }).join('');
}

// ================================================================
// MONTH CHANGE HANDLER
// ================================================================
function dashMonthChange() {
  const val = document.getElementById('dash-month')?.value;
  if (val) AppState.selectedMonth = val;
  loadDashboardPage();
}
window.dashMonthChange = dashMonthChange;

// Expose main loader
window.loadDashboardPage = loadDashboardPage;
