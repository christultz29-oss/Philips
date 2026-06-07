// public/js/users.js — Users Management (supervisor/admin only)

// ================================================================
// STATE
// ================================================================
const UsersState = {
  searchTimeout: null,
  allUsers: [],
};

// ================================================================
// ENTRY POINT
// ================================================================
async function loadUsersPage() {
  // Guard: only supervisor/admin
  if (!['supervisor','admin'].includes(AppState.currentRole)) {
    document.getElementById('users-table-body').innerHTML = `
      <tr><td colspan="7"><div class="inline-error">Access denied. Supervisor or Admin role required.</div></td></tr>`;
    return;
  }
  await fetchAndRenderUsers();
}
window.loadUsersPage = loadUsersPage;

// ================================================================
// FETCH & RENDER
// ================================================================
async function fetchAndRenderUsers() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = loadingHTML();

  const search = document.getElementById('users-search')?.value.trim().toLowerCase() || '';

  const { data, error } = await usersApi.list();
  if (error) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="inline-error">Error: ${error.message}</div></td></tr>`;
    return;
  }

  UsersState.allUsers = data || [];
  const filtered = search
    ? UsersState.allUsers.filter(u =>
        (u.full_name || '').toLowerCase().includes(search) ||
        (u.email || '').toLowerCase().includes(search) ||
        (u.role || '').toLowerCase().includes(search))
    : UsersState.allUsers;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">No users found</div>
        <div class="empty-state-sub">Try a different search term</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => renderUserRow(u)).join('');
}

function renderUserRow(u) {
  const initials = (u.full_name || u.email || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  const isCurrentUser = u.id === AppState.currentUser?.id;
  const canEdit = AppState.currentRole === 'admin' || (AppState.currentRole === 'supervisor' && u.role !== 'admin');

  return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="user-avatar-sm">${initials}</div>
          <div>
            <div style="font-weight:500;">${u.full_name || '—'}${isCurrentUser ? ' <span style="font-size:10px;color:var(--accent);">(you)</span>' : ''}</div>
            <div style="font-size:11px;color:var(--text-muted);">${u.email || '—'}</div>
          </div>
        </div>
      </td>
      <td>${roleBadge(u.role || 'agent')}</td>
      <td class="muted">${u.country || '—'}</td>
      <td class="muted">${u.team || '—'}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${u.active !== false ? 'var(--sla-green)' : 'var(--text-hint)'}"></span>
          ${u.active !== false ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="muted">${fmtDate(u.last_sign_in_at || u.created_at)}</td>
      <td>
        ${canEdit ? `<button class="btn btn-xs btn-ghost" onclick="openUserEditModal('${u.id}')">Edit</button>` : '<span class="muted" style="font-size:11px;">—</span>'}
      </td>
    </tr>
  `;
}

// ================================================================
// SEARCH
// ================================================================
function usersSearch() {
  clearTimeout(UsersState.searchTimeout);
  UsersState.searchTimeout = setTimeout(() => fetchAndRenderUsers(), 250);
}
window.usersSearch = usersSearch;

// ================================================================
// EDIT USER MODAL
// ================================================================
async function openUserEditModal(userId) {
  const user = UsersState.allUsers.find(u => u.id === userId);
  if (!user) { showToast('User not found', 'error'); return; }

  document.getElementById('user-edit-id').value      = userId;
  document.getElementById('user-edit-name').value    = user.full_name || '';
  document.getElementById('user-edit-role').value    = user.role || 'agent';
  document.getElementById('user-edit-country').value = user.country || '';
  document.getElementById('user-edit-team').value    = user.team || '';
  document.getElementById('user-edit-active').checked = user.active !== false;
  document.getElementById('user-edit-error').style.display = 'none';
  document.getElementById('user-edit-title').textContent = `Edit User: ${user.full_name || user.email}`;

  // Restrict role options for supervisors (can't assign admin)
  const roleSelect = document.getElementById('user-edit-role');
  if (AppState.currentRole === 'supervisor') {
    // Remove admin option if present
    Array.from(roleSelect.options).forEach(opt => {
      opt.hidden = (opt.value === 'admin');
    });
  } else {
    Array.from(roleSelect.options).forEach(opt => { opt.hidden = false; });
  }

  document.getElementById('user-edit-modal').classList.add('open');
}
window.openUserEditModal = openUserEditModal;

async function submitUserEdit() {
  const id      = document.getElementById('user-edit-id').value;
  const errEl   = document.getElementById('user-edit-error');
  errEl.style.display = 'none';

  const payload = {
    full_name: document.getElementById('user-edit-name').value.trim(),
    role:      document.getElementById('user-edit-role').value,
    country:   document.getElementById('user-edit-country').value || null,
    team:      document.getElementById('user-edit-team').value.trim() || null,
    active:    document.getElementById('user-edit-active').checked,
  };

  if (!payload.full_name) {
    errEl.textContent = 'Name is required.';
    errEl.style.display = 'block';
    return;
  }

  // Prevent supervisor from assigning admin role
  if (AppState.currentRole === 'supervisor' && payload.role === 'admin') {
    errEl.textContent = 'Supervisors cannot assign Admin role.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('user-edit-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const { error } = await usersApi.update(id, payload);
  btn.disabled = false;
  btn.textContent = 'Save Changes';

  if (error) {
    errEl.textContent = `Error: ${error.message}`;
    errEl.style.display = 'block';
    return;
  }

  showToast('User updated', 'success');
  closeModal('user-edit-modal');
  await fetchAndRenderUsers();
}
window.submitUserEdit = submitUserEdit;
