// public/js/credit-notes.js — Credit Notes module

// ================================================================
// STATE
// ================================================================
const CNState = {
  page:       0,
  pageSize:   50,
  totalCount: 0,
  searchTimeout: null,
  editingId:  null,
};

// ================================================================
// ENTRY POINT
// ================================================================
async function loadCreditNotesPage() {
  CNState.page = 0;
  await fetchAndRenderCreditNotes();

  AppState.realtimeChannel = creditNotesApi.subscribeToChanges(() => {
    fetchAndRenderCreditNotes();
  });
}
window.loadCreditNotesPage = loadCreditNotesPage;

// ================================================================
// FETCH & RENDER TABLE
// ================================================================
async function fetchAndRenderCreditNotes() {
  const tbody = document.getElementById('cn-table-body');
  tbody.innerHTML = loadingHTML();

  const filters = getCNFilters();
  const { data, count, error } = await creditNotesApi.list({
    ...filters,
    page:     CNState.page,
    pageSize: CNState.pageSize,
  });

  CNState.totalCount = count || 0;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="inline-error">Error: ${error.message}</div></td></tr>`;
    return;
  }

  if (!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="12">
      <div class="empty-state">
        <div class="empty-state-icon">📄</div>
        <div class="empty-state-title">No credit notes found</div>
        <div class="empty-state-sub">Try adjusting your filters or create a new credit note</div>
      </div>
    </td></tr>`;
  } else {
    tbody.innerHTML = data.map(r => renderCNRow(r)).join('');
  }

  renderPagination('cn-pagination', CNState.page, CNState.totalCount, CNState.pageSize, 'cnGoToPage');
}

function getCNFilters() {
  return {
    status:    document.getElementById('cn-filter-status')?.value || '',
    country:   document.getElementById('cn-filter-country')?.value || AppState.selectedCountry || '',
    slaStatus: document.getElementById('cn-filter-sla')?.value    || '',
    dateFrom:  document.getElementById('cn-filter-from')?.value   || '',
    dateTo:    document.getElementById('cn-filter-to')?.value     || '',
    search:    document.getElementById('cn-search')?.value.trim() || '',
  };
}

function renderCNRow(r) {
  const canUpdateStatus = ['ols','supervisor','admin'].includes(AppState.currentRole);
  const noteAmt    = r.note_amount    != null ? fmtAmount(r.note_amount,    r.currency || 'USD') : '—';
  const approvedAmt = r.approved_amount != null ? fmtAmount(r.approved_amount, r.currency || 'USD') : '—';
  return `
    <tr class="${r.sla_status === 'C_red' ? 'row-red' : ''}">
      <td class="muted" style="font-size:11px;">${r.country || '—'}</td>
      <td class="muted">${fmtDate(r.note_date || r.created_at)}</td>
      <td class="mono">${r.case_number || '—'}</td>
      <td class="mono">${r.sap_doc_number || '—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.customer_name || ''}">${r.customer_name || '—'}</td>
      <td class="amount">${noteAmt}</td>
      <td class="amount positive">${approvedAmt}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.credit_reason || r.reason || '—'}</td>
      <td style="font-size:12px;">${r.agent_name || r.agent_id || '—'}</td>
      <td>${slaBadge(r.sla_status, r.aging_days)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-xs btn-ghost" onclick="openCNDetail('${r.id}')" title="View details">👁</button>
          ${canUpdateStatus ? `<button class="btn btn-xs btn-ghost" onclick="openCNStatusModal('${r.id}','${r.status}')" title="Update status">✎</button>` : ''}
          <button class="btn btn-xs btn-ghost" onclick="openCNCommentModal('${r.id}')" title="Add BO comment">💬</button>
        </div>
      </td>
    </tr>
  `;
}

// ================================================================
// PAGINATION
// ================================================================
function cnGoToPage(pg) {
  const pages = Math.ceil(CNState.totalCount / CNState.pageSize);
  CNState.page = Math.max(0, Math.min(pg, pages - 1));
  fetchAndRenderCreditNotes();
}
window.cnGoToPage = cnGoToPage;

// ================================================================
// SEARCH & FILTER
// ================================================================
function cnSearch() {
  clearTimeout(CNState.searchTimeout);
  CNState.searchTimeout = setTimeout(() => { CNState.page = 0; fetchAndRenderCreditNotes(); }, 300);
}
window.cnSearch = cnSearch;

function cnFilter() {
  CNState.page = 0;
  fetchAndRenderCreditNotes();
}
window.cnFilter = cnFilter;

// ================================================================
// NEW CREDIT NOTE MODAL
// ================================================================
function openCNNewModal() {
  CNState.editingId = null;
  document.getElementById('cn-modal-title').textContent = 'New SAP Credit Note';
  document.getElementById('cn-form').reset();
  document.getElementById('cn-form-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('cn-form-error').style.display = 'none';
  document.getElementById('cn-modal').classList.add('open');
}
window.openCNNewModal = openCNNewModal;

async function submitCNForm() {
  const errEl = document.getElementById('cn-form-error');
  errEl.style.display = 'none';

  const payload = {
    country:          document.getElementById('cn-form-country').value,
    note_date:        document.getElementById('cn-form-date').value,
    case_number:      document.getElementById('cn-form-case').value.trim(),
    sap_doc_number:   document.getElementById('cn-form-sap').value.trim(),
    customer_name:    document.getElementById('cn-form-customer').value.trim(),
    note_amount:      parseFloat(document.getElementById('cn-form-amount').value) || null,
    approved_amount:  parseFloat(document.getElementById('cn-form-approved').value) || null,
    currency:         document.getElementById('cn-form-currency').value || 'USD',
    credit_reason:    document.getElementById('cn-form-reason').value.trim(),
    status:           document.getElementById('cn-form-status').value,
    bo_comment:       document.getElementById('cn-form-comment').value.trim() || null,
  };

  const required = ['country','note_date','case_number'];
  for (const f of required) {
    if (!payload[f]) {
      errEl.textContent = `Field "${f.replace(/_/g,' ')}" is required.`;
      errEl.style.display = 'block';
      return;
    }
  }

  const btn = document.getElementById('cn-form-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  let error;
  if (CNState.editingId) {
    ({ error } = await creditNotesApi.update(CNState.editingId, payload));
  } else {
    ({ error } = await creditNotesApi.create(payload));
  }

  btn.disabled = false;
  btn.textContent = 'Save Credit Note';

  if (error) {
    errEl.textContent = `Error: ${error.message}`;
    errEl.style.display = 'block';
    return;
  }

  showToast(CNState.editingId ? 'Credit note updated' : 'Credit note created', 'success');
  closeModal('cn-modal');
  CNState.page = 0;
  await fetchAndRenderCreditNotes();
}
window.submitCNForm = submitCNForm;

// ================================================================
// VIEW DETAIL MODAL
// ================================================================
async function openCNDetail(id) {
  const { data, error } = await creditNotesApi.get(id);
  if (error || !data) { showToast('Failed to load credit note', 'error'); return; }

  document.getElementById('cn-detail-title').textContent = `Credit Note ${data.sap_doc_number || data.case_number || id}`;
  document.getElementById('cn-detail-body').innerHTML = `
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val">${statusBadge(data.status)}</div></div>
    <div class="detail-row"><div class="detail-label">SLA</div><div class="detail-val">${slaBadge(data.sla_status, data.aging_days)}</div></div>
    <div class="detail-row"><div class="detail-label">Country</div><div class="detail-val">${data.country || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Note Date</div><div class="detail-val">${fmtDate(data.note_date)}</div></div>
    <div class="detail-row"><div class="detail-label">Case Number</div><div class="detail-val mono">${data.case_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">SAP Doc Number</div><div class="detail-val mono">${data.sap_doc_number || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Customer</div><div class="detail-val">${data.customer_name || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Note Amount</div><div class="detail-val amount">${fmtAmount(data.note_amount, data.currency)}</div></div>
    <div class="detail-row"><div class="detail-label">Approved Amount</div><div class="detail-val amount positive">${fmtAmount(data.approved_amount, data.currency)}</div></div>
    <div class="detail-row"><div class="detail-label">Currency</div><div class="detail-val">${data.currency || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Credit Reason</div><div class="detail-val">${data.credit_reason || data.reason || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Agent</div><div class="detail-val">${data.agent_name || data.agent_id || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Aging Days</div><div class="detail-val">${data.aging_days ?? '—'}</div></div>
    <div class="detail-row"><div class="detail-label">BO Comment</div><div class="detail-val">${data.bo_comment || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">Created</div><div class="detail-val muted">${fmtDate(data.created_at)}</div></div>
  `;
  document.getElementById('cn-detail-modal').classList.add('open');
}
window.openCNDetail = openCNDetail;

// ================================================================
// STATUS UPDATE MODAL
// ================================================================
function openCNStatusModal(id, currentStatus) {
  document.getElementById('cn-status-id').value     = id;
  document.getElementById('cn-status-select').value = currentStatus;
  document.getElementById('cn-status-comment').value = '';
  document.getElementById('cn-status-modal').classList.add('open');
}
window.openCNStatusModal = openCNStatusModal;

async function submitCNStatus() {
  const id      = document.getElementById('cn-status-id').value;
  const status  = document.getElementById('cn-status-select').value;
  const comment = document.getElementById('cn-status-comment').value.trim();

  const btn = document.getElementById('cn-status-submit');
  btn.disabled = true;
  const { error } = await creditNotesApi.updateStatus(id, status, comment || null);
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Status updated', 'success');
  closeModal('cn-status-modal');
  await fetchAndRenderCreditNotes();
}
window.submitCNStatus = submitCNStatus;

// ================================================================
// BO COMMENT MODAL
// ================================================================
function openCNCommentModal(id) {
  document.getElementById('cn-comment-id').value = id;
  document.getElementById('cn-comment-text').value = '';
  document.getElementById('cn-comment-modal').classList.add('open');
}
window.openCNCommentModal = openCNCommentModal;

async function submitCNComment() {
  const id      = document.getElementById('cn-comment-id').value;
  const comment = document.getElementById('cn-comment-text').value.trim();
  if (!comment) { showToast('Comment cannot be empty', 'warning'); return; }

  const btn = document.getElementById('cn-comment-submit');
  btn.disabled = true;
  const { error } = await creditNotesApi.update(id, { bo_comment: comment });
  btn.disabled = false;

  if (error) { showToast(`Error: ${error.message}`, 'error'); return; }
  showToast('Comment saved', 'success');
  closeModal('cn-comment-modal');
  await fetchAndRenderCreditNotes();
}
window.submitCNComment = submitCNComment;
