// public/js/reserves.js — Payment Reserves module

// ================================================================
// STATE
// ================================================================
const ResState = {
  page:       0,
  pageSize:   50,
  totalCount: 0,
  searchTimeout: null,
  editingId:  null,
};

// ================================================================
// ENTRY POINT
// ================================================================
async function loadReservesPage() {
  ResState.page = 0;
  await fetchAndRenderReserves();

  AppState.realtimeChannel = reservesApi.subscribeToChanges(() => {
    fetchAndRenderReserves();
  });
}
window.loadReservesPage = loadReservesPage;

// ================================================================
// FETCH & RENDER TABLE
// ================================================================
async function fetchAndRenderReserves() {
  const tbody = document.getElementById('res-table-body');
  tbody.innerHTML = loadingHTML();

  const filters = getResFilters();
  const { data, count, error } = await reservesApi.list({
    ...filters,
    page:     ResState.page,
    pageSize: ResState.pageSize,
  });

  ResState.totalCount = count || 0;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="inline-error">Error: ${error.message}</div></td></tr>`;
    return;
  }

  if (!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="12">
      <div class="empty-state">
        <div class="empty-state-icon">⊠</div>
        <div class="empty-state-title">No payment reserves found</div>
        <div class="empty-state-sub">Try adjusting your filters or create a new reserve</div>
      </div>
    </td></tr>`;
  } else {
    tbody.innerHTML = data.map(r => renderResRow(r)).join('');
  }

  renderPagination('res-pagination', ResState.page, ResState.totalCount, ResState.pageSize, 'resGoToPage');
}

function getResFilters() {
  return {
    status:    document.getElementById('res-filter-status')?.value || '',
    country:   document.getElementById('res-filter-country')?.value || AppState.selectedCountry || '',
    slaStatus: document.getElementById('res-filter-sla')?.value    || '',
    dateFrom:  document.getElementById('res-filter-from')?.value   || '',
    dateTo:    document.getElementById('res-filter-to')?.value     || '',
    search:    document.getElementById('res-search')?.value.trim() || '',
  };
}

function renderResRow(r) {
  const canUpdateStatus = ['ols','supervisor','admin'].includes(AppState.currentRole);
  const reservedAmt = r.reserved_amount != null ? fmtAmount(r.reserved_amount, r.currency || 'USD') : '—';
  const releasedAmt = r.released_amount != null ? fmtAmount(r.released_amount, r.currency || 'USD') : '—';
  return `
    <tr class="${r.sla_status === 'C_red' ? 'row-red' : ''}">
      <td class="muted" style="font-size:11px;">${r.country || '—'}</td>
      <td class="muted">${fmtDate(r.reserve_date || r.created_at)}</td>
      <td class="mono">${r.case_number || '—'}</td>
      <td class="mono">${r.order_number || '—'}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.customer_name || ''}">${r.customer_name || '—'}</td>
      <td class="amount">${reservedAmt}</td>
      <td class="amount positive">${releasedAmt}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.reserve_type || '—'}</td>
      <td style="font-size:12px;">${r.agent_name || r.agent_id || '—'}</td>
      <td>${slaBadge(r.sla_status, r.aging_days)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-xs btn-ghost" onclick="openResDetail('${r.id}')" title="View details">👁</button>
          ${canUpdateStatus ? `<button class="btn btn-xs btn-ghost" onclick="openResStatusModal('${r.id}','${r.status}')" title="Update status">✎</button>` : ''}
          <button class="btn btn-xs btn-ghost" onclick="openResCommentModal('${r.id}')" title="Add BO comment">💬</button>
        </div>
      </td>
    </tr>
  `;
}

// ================================================================
// PAGINATION
// ================================================================
function resGoToPage(pg) {
  const pages = Math.ceil(ResState.totalCount / ResState.pageSize);
  ResState.page = Math.max(0, Math.min(pg, pages - 1));
  fetchAndRenderReserves();
}
window.resGoToPage = resGoToPage;

// ================================================================
// SEARCH & FILTER
// ================================================================
function resSearch() {
  clearTimeout(ResState.searchTimeout);
  ResState.searchTimeout = setTimeout(() => { ResState.page = 0; fetchAndRenderReserves(); }, 300);
}
window.resSearch = resSearch;

function resFilter() {
  ResState.page = 0;
  fetchAndRenderReserves();
}
window.resFilter = resFilter;

// ================================================================
// NEW RESERVE MODAL
// ================================================================
function openResNewModal() {
  ResState.editingId = null;
  document.getElementById('res-modal-title').textContent = 'New Payment Reserve';
  document.getElementById('res-form').reset();
  document.getElementById('res-form-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('res-form-error').style.display = 'none';
  document.getElementById('res-modal').classList.add('open');
}
window.openResNewModal = openResNewModal;

async function submitResForm() {
  const errEl = document.getElementById('res-form-error');
  errEl.style.display = 'none';

  const payload = {
    country:         document.getElementById('res-form-country').value,
    reserve_date:    document.getElementById('res-form-date').value,
    case_number:     document.getElementById('res-form-case').value.trim(),
    order_number:    document.getElementById('res-form-order').value.trim(),
    customer_name:   document.getElementById('res-form-customer').value.trim(),
    reserved_amount: parseFloat(document.getElementById('res-form-amount').value) || null,
    released_amount: parseFloat(document.getElementById('res-form-released').value) || null,
    currency:        document.getElementById('res-form-currency').value || 'USD',
    reserve_type:    document.getElementById('res-form-type').value,
    reason:          document.getElementById('res-form-reason').value.trim(),
    status:          document.getElementById('res-form-status').value,
    bo_comment:      document.getElementById('res-form-comment').value.trim() || null,
  };

  const required = ['country','reserve_date','case_number'];
  for (const f of required) {
    if (!payload[f]) {
      errEl.textContent = `Field "${f.replace(/_/g,' ')}" is required.`;
      errEl.style.display = 'block';
      return;
    }
  }

  const btn = document.getElementById('res-form-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  let error;
  if (ResState.editingId) {
    ({ error } = await reservesApi.update(ResState.editingId, payload));
  } else {
    ({ error } = await reservesApi.create(payload));
  }

  btn.disabled = false;
  btn.textContent = 'Save Reserve';

  if (error) {
    errEl.textContent = `Error: ${error.message}`;
    errEl.style.display = 'block';
    return;
  }

  showToast(ResState.editingId ? 'Reserve updated' : 'Reserve created', 'success');
  closeModal('res-modal');
  ResState.page = 0;
  await fetchAndRenderReserves();
}
window.submitResForm = submitResForm;

// ================================================================
// VIEW DETAIL MODAL
// ================================================================
async function openResDetail(id) {
  const { data, error } = await reservesApi.get(id);
  if (error || !data) { showToast('Failed to load reserve', 'error'); return; }

  document.getElementById('res-detail-title').textContent = `Reserve ${data.case_number || id}`;
  document.getElementById('res-detail-body').innerHTML = `
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val">${statusBadge(data.status)}</div></div>
    <div class="detail-row"><div class="detail-label">SLA</div><div class="detail-val">${slaBadge(data.sla_status, data.aging_days)}</div></div>
    <div class="detail-row"><div class="detail-label">Country</div><div class="detail-val">${data.country || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Reserve Date</div><div class="detail-val">${fmtDate(data.reserve_date)}</div></div>
    <div class="detail-row"><div class="detail-label">Case Number</div><div class="detail-val mono">${data.case_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Order Number</div><div class="detail-val mono">${data.order_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Customer</div><div class="detail-val">${data.customer_name || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Reserved Amount</div><div class="detail-val amount">${fmtAmount(data.reserved_amount, data.currency)}</div></div>
    <div class="detail-row"><div class="detail-label">Released Amount</div><div class="detail-val amount positive">${fmtAmount(data.released_amount, data.currency)}</div></div>
    <div class="detail-row"><div class="detail-label">Currency</div><div class="detail-val">${data.currency || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Reserve Type</div><div class="detail-val">${data.reserve_type || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Reason</div><div class="detail-val">${data.reason || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Agent</div><div class="detail-val">${data.agent_name || data.agent_id || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Aging Days</div><div class="detail-val">${data.aging_days ?? '—'}</div></div>
    <div class="detail-row"><div class="detail-label">BO Comment</div><div class="detail-val">${data.bo_comment || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Created</div><div class="detail-val muted">${fmtDate(data.created_at)}</div></div>
  `;
  document.getElementById('res-detail-modal').classList.add('open');
}
window.openResDetail = openResDetail;

// ================================================================
// STATUS UPDATE MODAL
// ================================================================
function openResStatusModal(id, currentStatus) {
  document.getElementById('res-status-id').value     = id;
  document.getElementById('res-status-select').value = currentStatus;
  document.getElementById('res-status-comment').value = '';
  document.getElementById('res-status-modal').classList.add('open');
}
window.openResStatusModal = openResStatusModal;

async function submitResStatus() {
  const id      = document.getElementById('res-status-id').value;
  const status  = document.getElementById('res-status-select').value;
  const comment = document.getElementById('res-status-comment').value.trim();

  const btn = document.getElementById('res-status-submit');
  btn.disabled = true;
  const { error } = await reservesApi.updateStatus(id, status, comment || null);
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Status updated', 'success');
  closeModal('res-status-modal');
  await fetchAndRenderReserves();
}
window.submitResStatus = submitResStatus;

// ================================================================
// BO COMMENT MODAL
// ================================================================
function openResCommentModal(id) {
  document.getElementById('res-comment-id').value = id;
  document.getElementById('res-comment-text').value = '';
  document.getElementById('res-comment-modal').classList.add('open');
}
window.openResCommentModal = openResCommentModal;

async function submitResComment() {
  const id      = document.getElementById('res-comment-id').value;
  const comment = document.getElementById('res-comment-text').value.trim();
  if (!comment) { showToast('Comment cannot be empty', 'warning'); return; }

  const btn = document.getElementById('res-comment-submit');
  btn.disabled = true;
  const { error } = await reservesApi.update(id, { bo_comment: comment });
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Comment saved', 'success');
  closeModal('res-comment-modal');
  await fetchAndRenderReserves();
}
window.submitResComment = submitResComment;
