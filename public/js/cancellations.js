// public/js/cancellations.js — RMA Cancellations module

// ================================================================
// STATE
// ================================================================
const CancState = {
  page:       0,
  pageSize:   50,
  totalCount: 0,
  searchTimeout: null,
  editingId:  null,
};

// ================================================================
// ENTRY POINT
// ================================================================
async function loadCancellationsPage() {
  CancState.page = 0;
  await fetchAndRenderCancellations();

  // Realtime subscription
  AppState.realtimeChannel = cancellationsApi.subscribeToChanges(() => {
    fetchAndRenderCancellations();
  });
}
window.loadCancellationsPage = loadCancellationsPage;

// ================================================================
// FETCH & RENDER TABLE
// ================================================================
async function fetchAndRenderCancellations() {
  const tbody = document.getElementById('canc-table-body');
  tbody.innerHTML = loadingHTML();

  const filters = getCancFilters();
  const { data, count, error } = await cancellationsApi.list({
    ...filters,
    page:     CancState.page,
    pageSize: CancState.pageSize,
  });

  CancState.totalCount = count || 0;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="inline-error">Error: ${error.message}</div></td></tr>`;
    return;
  }

  if (!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="12">
      <div class="empty-state">
        <div class="empty-state-icon">↩</div>
        <div class="empty-state-title">No cancellations found</div>
        <div class="empty-state-sub">Try adjusting your filters or create a new case</div>
      </div>
    </td></tr>`;
  } else {
    tbody.innerHTML = data.map(r => renderCancRow(r)).join('');
  }

  renderPagination('canc-pagination', CancState.page, CancState.totalCount, CancState.pageSize, 'cancGoToPage');
}

function getCancFilters() {
  return {
    status:    document.getElementById('canc-filter-status')?.value || '',
    country:   document.getElementById('canc-filter-country')?.value || AppState.selectedCountry || '',
    slaStatus: document.getElementById('canc-filter-sla')?.value    || '',
    dateFrom:  document.getElementById('canc-filter-from')?.value   || '',
    dateTo:    document.getElementById('canc-filter-to')?.value     || '',
    search:    document.getElementById('canc-search')?.value.trim() || '',
  };
}

function renderCancRow(r) {
  const canUpdateStatus = ['ols', 'supervisor', 'admin'].includes(AppState.currentRole);
  return `
    <tr class="${r.sla_status === 'C_red' ? 'row-red' : ''}">
      <td class="muted" style="font-size:11px;">${r.country || '—'}</td>
      <td class="muted">${fmtDate(r.case_date || r.created_at)}</td>
      <td class="mono">${r.case_number || '—'}</td>
      <td class="mono">${r.order_number || '—'}</td>
      <td class="mono">${r.rma_number || '—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.product || ''}">${r.product || '—'}</td>
      <td class="muted" style="text-align:center;">${r.quantity ?? '—'}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--text-muted);" title="${r.reason || ''}">${r.reason || '—'}</td>
      <td style="font-size:12px;">${r.agent_name || r.agent_id || '—'}</td>
      <td>${slaBadge(r.sla_status, r.aging_days)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-xs btn-ghost" onclick="openCancDetail('${r.id}')" title="View details">👁</button>
          ${canUpdateStatus ? `<button class="btn btn-xs btn-ghost" onclick="openCancStatusModal('${r.id}','${r.status}')" title="Update status">✎</button>` : ''}
          <button class="btn btn-xs btn-ghost" onclick="openCancCommentModal('${r.id}')" title="Add BO comment">💬</button>
        </div>
      </td>
    </tr>
  `;
}

// ================================================================
// PAGINATION
// ================================================================
function cancGoToPage(pg) {
  const pages = Math.ceil(CancState.totalCount / CancState.pageSize);
  CancState.page = Math.max(0, Math.min(pg, pages - 1));
  fetchAndRenderCancellations();
}
window.cancGoToPage = cancGoToPage;

// ================================================================
// SEARCH & FILTER
// ================================================================
function cancSearch() {
  clearTimeout(CancState.searchTimeout);
  CancState.searchTimeout = setTimeout(() => { CancState.page = 0; fetchAndRenderCancellations(); }, 300);
}
window.cancSearch = cancSearch;

function cancFilter() {
  CancState.page = 0;
  fetchAndRenderCancellations();
}
window.cancFilter = cancFilter;

// ================================================================
// NEW CASE MODAL
// ================================================================
function openCancNewModal() {
  CancState.editingId = null;
  document.getElementById('canc-modal-title').textContent = 'New RMA Cancellation Case';
  document.getElementById('canc-form').reset();
  document.getElementById('canc-form-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('canc-form-error').style.display = 'none';
  document.getElementById('canc-modal').classList.add('open');
}
window.openCancNewModal = openCancNewModal;

async function submitCancForm() {
  const errEl = document.getElementById('canc-form-error');
  errEl.style.display = 'none';

  const payload = {
    country:      document.getElementById('canc-form-country').value,
    case_date:    document.getElementById('canc-form-date').value,
    case_number:  document.getElementById('canc-form-case').value.trim(),
    order_number: document.getElementById('canc-form-order').value.trim(),
    rma_number:   document.getElementById('canc-form-rma').value.trim(),
    product:      document.getElementById('canc-form-product').value.trim(),
    quantity:     parseInt(document.getElementById('canc-form-qty').value) || null,
    reason:       document.getElementById('canc-form-reason').value.trim(),
    status:       document.getElementById('canc-form-status').value,
    bo_comment:   document.getElementById('canc-form-comment').value.trim() || null,
  };

  // Validation
  const required = ['country','case_date','case_number','order_number','product'];
  for (const f of required) {
    if (!payload[f]) {
      errEl.textContent = `Field "${f.replace(/_/g,' ')}" is required.`;
      errEl.style.display = 'block';
      return;
    }
  }

  const btn = document.getElementById('canc-form-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  let error;
  if (CancState.editingId) {
    ({ error } = await cancellationsApi.update(CancState.editingId, payload));
  } else {
    ({ error } = await cancellationsApi.create(payload));
  }

  btn.disabled = false;
  btn.textContent = 'Save Case';

  if (error) {
    errEl.textContent = `Error: ${error.message}`;
    errEl.style.display = 'block';
    return;
  }

  showToast(CancState.editingId ? 'Case updated' : 'Case created', 'success');
  closeModal('canc-modal');
  CancState.page = 0;
  await fetchAndRenderCancellations();
}
window.submitCancForm = submitCancForm;

// ================================================================
// VIEW DETAIL MODAL
// ================================================================
async function openCancDetail(id) {
  const { data, error } = await cancellationsApi.get(id);
  if (error || !data) { showToast('Failed to load case', 'error'); return; }

  document.getElementById('canc-detail-title').textContent = `Case ${data.case_number || id}`;
  document.getElementById('canc-detail-body').innerHTML = `
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val">${statusBadge(data.status)}</div></div>
    <div class="detail-row"><div class="detail-label">SLA</div><div class="detail-val">${slaBadge(data.sla_status, data.aging_days)}</div></div>
    <div class="detail-row"><div class="detail-label">Country</div><div class="detail-val">${data.country || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Case Date</div><div class="detail-val">${fmtDate(data.case_date)}</div></div>
    <div class="detail-row"><div class="detail-label">Case Number</div><div class="detail-val mono">${data.case_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Order Number</div><div class="detail-val mono">${data.order_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">RMA Number</div><div class="detail-val mono">${data.rma_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Product</div><div class="detail-val">${data.product || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Quantity</div><div class="detail-val">${data.quantity ?? '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Reason</div><div class="detail-val">${data.reason || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Agent</div><div class="detail-val">${data.agent_name || data.agent_id || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Aging Days</div><div class="detail-val">${data.aging_days ?? '—'}</div></div>
    <div class="detail-row"><div class="detail-label">BO Comment</div><div class="detail-val">${data.bo_comment || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Created</div><div class="detail-val muted">${fmtDate(data.created_at)}</div></div>
    <div class="detail-row"><div class="detail-label">Updated</div><div class="detail-val muted">${fmtDate(data.updated_at)}</div></div>
  `;
  document.getElementById('canc-detail-modal').classList.add('open');
}
window.openCancDetail = openCancDetail;

// ================================================================
// STATUS UPDATE MODAL (OLS+ only)
// ================================================================
function openCancStatusModal(id, currentStatus) {
  document.getElementById('canc-status-id').value     = id;
  document.getElementById('canc-status-select').value = currentStatus;
  document.getElementById('canc-status-comment').value = '';
  document.getElementById('canc-status-modal').classList.add('open');
}
window.openCancStatusModal = openCancStatusModal;

async function submitCancStatus() {
  const id      = document.getElementById('canc-status-id').value;
  const status  = document.getElementById('canc-status-select').value;
  const comment = document.getElementById('canc-status-comment').value.trim();

  const btn = document.getElementById('canc-status-submit');
  btn.disabled = true;
  const { error } = await cancellationsApi.updateStatus(id, status, comment || null);
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Status updated', 'success');
  closeModal('canc-status-modal');
  await fetchAndRenderCancellations();
}
window.submitCancStatus = submitCancStatus;

// ================================================================
// BO COMMENT MODAL
// ================================================================
function openCancCommentModal(id) {
  document.getElementById('canc-comment-id').value = id;
  document.getElementById('canc-comment-text').value = '';
  document.getElementById('canc-comment-modal').classList.add('open');
}
window.openCancCommentModal = openCancCommentModal;

async function submitCancComment() {
  const id      = document.getElementById('canc-comment-id').value;
  const comment = document.getElementById('canc-comment-text').value.trim();
  if (!comment) { showToast('Comment cannot be empty', 'warning'); return; }

  const btn = document.getElementById('canc-comment-submit');
  btn.disabled = true;
  const { error } = await cancellationsApi.update(id, { bo_comment: comment, updated_at: new Date().toISOString() });
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Comment saved', 'success');
  closeModal('canc-comment-modal');
  await fetchAndRenderCancellations();
}
window.submitCancComment = submitCancComment;
