// public/js/refunds.js — Refund Requests module

// ================================================================
// STATE
// ================================================================
const RefState = {
  page:       0,
  pageSize:   50,
  totalCount: 0,
  searchTimeout: null,
  editingId:  null,
};

// ================================================================
// ENTRY POINT
// ================================================================
async function loadRefundsPage() {
  RefState.page = 0;
  await fetchAndRenderRefunds();

  AppState.realtimeChannel = refundsApi.subscribeToChanges(() => {
    fetchAndRenderRefunds();
  });
}
window.loadRefundsPage = loadRefundsPage;

// ================================================================
// FETCH & RENDER TABLE
// ================================================================
async function fetchAndRenderRefunds() {
  const tbody = document.getElementById('ref-table-body');
  tbody.innerHTML = loadingHTML();

  const filters = getRefFilters();
  const { data, count, error } = await refundsApi.list({
    ...filters,
    page:     RefState.page,
    pageSize: RefState.pageSize,
  });

  RefState.totalCount = count || 0;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="inline-error">Error: ${error.message}</div></td></tr>`;
    return;
  }

  if (!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="12">
      <div class="empty-state">
        <div class="empty-state-icon">↑$</div>
        <div class="empty-state-title">No refund requests found</div>
        <div class="empty-state-sub">Try adjusting your filters or create a new request</div>
      </div>
    </td></tr>`;
  } else {
    tbody.innerHTML = data.map(r => renderRefRow(r)).join('');
  }

  renderPagination('ref-pagination', RefState.page, RefState.totalCount, RefState.pageSize, 'refGoToPage');
}

function getRefFilters() {
  return {
    status:    document.getElementById('ref-filter-status')?.value || '',
    country:   document.getElementById('ref-filter-country')?.value || AppState.selectedCountry || '',
    slaStatus: document.getElementById('ref-filter-sla')?.value    || '',
    dateFrom:  document.getElementById('ref-filter-from')?.value   || '',
    dateTo:    document.getElementById('ref-filter-to')?.value     || '',
    search:    document.getElementById('ref-search')?.value.trim() || '',
  };
}

function renderRefRow(r) {
  const canUpdateStatus = ['ols','supervisor','admin'].includes(AppState.currentRole);
  const amountStr = r.amount != null ? fmtAmount(r.amount, r.currency || 'USD') : '—';
  return `
    <tr class="${r.sla_status === 'C_red' ? 'row-red' : ''}">
      <td class="muted" style="font-size:11px;">${r.country || '—'}</td>
      <td class="muted">${fmtDate(r.request_date || r.created_at)}</td>
      <td class="mono">${r.case_number || '—'}</td>
      <td class="mono">${r.order_number || '—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.product || ''}">${r.product || '—'}</td>
      <td class="amount positive">${amountStr}</td>
      <td class="muted" style="font-size:11px;">${r.refund_type || '—'}</td>
      <td style="font-size:12px;">${r.agent_name || r.agent_id || '—'}</td>
      <td>${slaBadge(r.sla_status, r.aging_days)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="muted" style="font-size:11px;">${r.payment_method || '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-xs btn-ghost" onclick="openRefDetail('${r.id}')" title="View details">👁</button>
          ${canUpdateStatus ? `<button class="btn btn-xs btn-ghost" onclick="openRefStatusModal('${r.id}','${r.status}')" title="Update status">✎</button>` : ''}
          <button class="btn btn-xs btn-ghost" onclick="openRefCommentModal('${r.id}')" title="Add BO comment">💬</button>
        </div>
      </td>
    </tr>
  `;
}

// ================================================================
// PAGINATION
// ================================================================
function refGoToPage(pg) {
  const pages = Math.ceil(RefState.totalCount / RefState.pageSize);
  RefState.page = Math.max(0, Math.min(pg, pages - 1));
  fetchAndRenderRefunds();
}
window.refGoToPage = refGoToPage;

// ================================================================
// SEARCH & FILTER
// ================================================================
function refSearch() {
  clearTimeout(RefState.searchTimeout);
  RefState.searchTimeout = setTimeout(() => { RefState.page = 0; fetchAndRenderRefunds(); }, 300);
}
window.refSearch = refSearch;

function refFilter() {
  RefState.page = 0;
  fetchAndRenderRefunds();
}
window.refFilter = refFilter;

// ================================================================
// NEW CASE MODAL
// ================================================================
function openRefNewModal() {
  RefState.editingId = null;
  document.getElementById('ref-modal-title').textContent = 'New Refund Request';
  document.getElementById('ref-form').reset();
  document.getElementById('ref-form-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('ref-form-error').style.display = 'none';
  document.getElementById('ref-modal').classList.add('open');
}
window.openRefNewModal = openRefNewModal;

async function submitRefForm() {
  const errEl = document.getElementById('ref-form-error');
  errEl.style.display = 'none';

  const payload = {
    country:        document.getElementById('ref-form-country').value,
    request_date:   document.getElementById('ref-form-date').value,
    case_number:    document.getElementById('ref-form-case').value.trim(),
    order_number:   document.getElementById('ref-form-order').value.trim(),
    product:        document.getElementById('ref-form-product').value.trim(),
    quantity:       parseInt(document.getElementById('ref-form-qty').value) || null,
    amount:         parseFloat(document.getElementById('ref-form-amount').value) || null,
    currency:       document.getElementById('ref-form-currency').value || 'USD',
    refund_type:    document.getElementById('ref-form-type').value,
    payment_method: document.getElementById('ref-form-payment').value,
    reason:         document.getElementById('ref-form-reason').value.trim(),
    status:         document.getElementById('ref-form-status').value,
    bo_comment:     document.getElementById('ref-form-comment').value.trim() || null,
  };

  const required = ['country','request_date','case_number','order_number'];
  for (const f of required) {
    if (!payload[f]) {
      errEl.textContent = `Field "${f.replace(/_/g,' ')}" is required.`;
      errEl.style.display = 'block';
      return;
    }
  }

  const btn = document.getElementById('ref-form-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  let error;
  if (RefState.editingId) {
    ({ error } = await refundsApi.update(RefState.editingId, payload));
  } else {
    ({ error } = await refundsApi.create(payload));
  }

  btn.disabled = false;
  btn.textContent = 'Save Request';

  if (error) {
    errEl.textContent = `Error: ${error.message}`;
    errEl.style.display = 'block';
    return;
  }

  showToast(RefState.editingId ? 'Request updated' : 'Request created', 'success');
  closeModal('ref-modal');
  RefState.page = 0;
  await fetchAndRenderRefunds();
}
window.submitRefForm = submitRefForm;

// ================================================================
// VIEW DETAIL MODAL
// ================================================================
async function openRefDetail(id) {
  const { data, error } = await refundsApi.get(id);
  if (error || !data) { showToast('Failed to load request', 'error'); return; }

  document.getElementById('ref-detail-title').textContent = `Refund ${data.case_number || id}`;
  document.getElementById('ref-detail-body').innerHTML = `
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val">${statusBadge(data.status)}</div></div>
    <div class="detail-row"><div class="detail-label">SLA</div><div class="detail-val">${slaBadge(data.sla_status, data.aging_days)}</div></div>
    <div class="detail-row"><div class="detail-label">Country</div><div class="detail-val">${data.country || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Request Date</div><div class="detail-val">${fmtDate(data.request_date)}</div></div>
    <div class="detail-row"><div class="detail-label">Case Number</div><div class="detail-val mono">${data.case_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Order Number</div><div class="detail-val mono">${data.order_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Product</div><div class="detail-val">${data.product || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Quantity</div><div class="detail-val">${data.quantity ?? '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Refund Amount</div><div class="detail-val amount positive">${fmtAmount(data.amount, data.currency)}</div></div>
    <div class="detail-row"><div class="detail-label">Refund Type</div><div class="detail-val">${data.refund_type || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Payment Method</div><div class="detail-val">${data.payment_method || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Reason</div><div class="detail-val">${data.reason || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Agent</div><div class="detail-val">${data.agent_name || data.agent_id || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Aging Days</div><div class="detail-val">${data.aging_days ?? '—'}</div></div>
    <div class="detail-row"><div class="detail-label">BO Comment</div><div class="detail-val">${data.bo_comment || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Created</div><div class="detail-val muted">${fmtDate(data.created_at)}</div></div>
  `;
  document.getElementById('ref-detail-modal').classList.add('open');
}
window.openRefDetail = openRefDetail;

// ================================================================
// STATUS UPDATE MODAL
// ================================================================
function openRefStatusModal(id, currentStatus) {
  document.getElementById('ref-status-id').value     = id;
  document.getElementById('ref-status-select').value = currentStatus;
  document.getElementById('ref-status-comment').value = '';
  document.getElementById('ref-status-modal').classList.add('open');
}
window.openRefStatusModal = openRefStatusModal;

async function submitRefStatus() {
  const id      = document.getElementById('ref-status-id').value;
  const status  = document.getElementById('ref-status-select').value;
  const comment = document.getElementById('ref-status-comment').value.trim();

  const btn = document.getElementById('ref-status-submit');
  btn.disabled = true;
  const { error } = await refundsApi.updateStatus(id, status, comment || null);
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Status updated', 'success');
  closeModal('ref-status-modal');
  await fetchAndRenderRefunds();
}
window.submitRefStatus = submitRefStatus;

// ================================================================
// BO COMMENT MODAL
// ================================================================
function openRefCommentModal(id) {
  document.getElementById('ref-comment-id').value = id;
  document.getElementById('ref-comment-text').value = '';
  document.getElementById('ref-comment-modal').classList.add('open');
}
window.openRefCommentModal = openRefCommentModal;

async function submitRefComment() {
  const id      = document.getElementById('ref-comment-id').value;
  const comment = document.getElementById('ref-comment-text').value.trim();
  if (!comment) { showToast('Comment cannot be empty', 'warning'); return; }

  const btn = document.getElementById('ref-comment-submit');
  btn.disabled = true;
  const { error } = await refundsApi.update(id, { bo_comment: comment });
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Comment saved', 'success');
  closeModal('ref-comment-modal');
  await fetchAndRenderRefunds();
}
window.submitRefComment = submitRefComment;
