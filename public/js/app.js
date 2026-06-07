// public/js/app.js — Main application controller

// ================================================================
// GLOBAL STATE
// ================================================================
window.AppState = {
  currentUser: null,
  currentProfile: null,
  currentRole: null,
  selectedCountry: '',
  selectedMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  currentPage: null,
  realtimeChannel: null,
};

// ================================================================
// SUPABASE CLIENT INIT
// ================================================================
(function initSupabase() {
  const url = window.__ENV?.SUPABASE_URL || '';
  const key = window.__ENV?.SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    // Use hardcoded credentials from existing project for development
    const fallbackUrl = 'https://bwluicrpesohyrriygpd.supabase.co';
    const fallbackKey = 'sb_publishable_By4xhHDAxmFWFdHRPoGq7w_qPF-tKAc';
    window.db = window.supabase.createClient(fallbackUrl, fallbackKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    console.warn('[BO WMS] Using fallback Supabase credentials. Set window.__ENV for production.');
  } else {
    window.db = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
})();

// ================================================================
// NAVIGATION CONFIG (role-based)
// ================================================================
const NAV_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',         icon: '▦',  roles: ['agent','ols','supervisor','admin'], hash: '#dashboard' },
  { id: 'cancellations', label: 'RMA Cancellations',  icon: '↩',  roles: ['agent','ols','supervisor','admin'], hash: '#cancellations' },
  { id: 'credit-notes',  label: 'Credit Notes',       icon: '📄', roles: ['agent','ols','supervisor','admin'], hash: '#credit-notes' },
  { id: 'refunds',       label: 'Refunds',             icon: '↑$', roles: ['agent','ols','supervisor','admin'], hash: '#refunds' },
  { id: 'reserves',      label: 'Payment Reserves',   icon: '⊠',  roles: ['agent','ols','supervisor','admin'], hash: '#reserves' },
  { id: 'users',         label: 'Users',              icon: '👥', roles: ['supervisor','admin'],              hash: '#users' },
];

const COUNTRIES = ['', 'MX', 'CO', 'AR', 'CL', 'PE', 'BR', 'EC', 'VE', 'US'];
const COUNTRY_LABELS = { '': 'All Countries', MX:'Mexico', CO:'Colombia', AR:'Argentina', CL:'Chile', PE:'Peru', BR:'Brazil', EC:'Ecuador', VE:'Venezuela', US:'United States' };

// ================================================================
// AUTH
// ================================================================
async function appInit() {
  const { data: { session } } = await window.db.auth.getSession();
  if (session?.user) {
    await onLogin(session.user);
  }

  window.db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) await onLogin(session.user);
    if (event === 'SIGNED_OUT') onLogout();
  });
}

async function onLogin(user) {
  AppState.currentUser = user;

  // Load user profile
  const { data: profile } = await window.db
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  AppState.currentProfile = profile;
  AppState.currentRole = profile?.role || 'agent';
  if (profile?.country) AppState.selectedCountry = profile.country;

  renderApp();
  showApp();

  // Route to hash or default
  const hash = window.location.hash || '#dashboard';
  routeTo(hash.slice(1));
}

function onLogout() {
  AppState.currentUser = null;
  AppState.currentProfile = null;
  AppState.currentRole = null;
  AppState.currentPage = null;
  if (AppState.realtimeChannel) {
    window.db.removeChannel(AppState.realtimeChannel);
    AppState.realtimeChannel = null;
  }
  showLogin();
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.className = 'login-error';
  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.className = 'login-error visible';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const { error } = await window.db.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (error) {
    errEl.textContent = error.message;
    errEl.className = 'login-error visible';
  }
}

async function doSignout() {
  await window.db.auth.signOut();
}

// ================================================================
// UI SHOW/HIDE
// ================================================================
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
}

// ================================================================
// RENDER APP SHELL
// ================================================================
function renderApp() {
  const profile = AppState.currentProfile;
  const role    = AppState.currentRole;
  const initials = (profile?.full_name || AppState.currentUser?.email || '?')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // Topbar user info
  document.getElementById('topbar-avatar').textContent = initials;
  document.getElementById('topbar-name').textContent   = profile?.full_name || AppState.currentUser?.email || '';
  document.getElementById('topbar-role-badge').textContent  = role;
  document.getElementById('topbar-role-badge').className    = `badge badge-${role}`;

  // Country selector
  const countrySel = document.getElementById('country-select');
  countrySel.innerHTML = COUNTRIES.map(c =>
    `<option value="${c}" ${c === AppState.selectedCountry ? 'selected' : ''}>${COUNTRY_LABELS[c] || c}</option>`
  ).join('');
  countrySel.addEventListener('change', () => {
    AppState.selectedCountry = countrySel.value;
    // Refresh current page
    if (AppState.currentPage) routeTo(AppState.currentPage);
  });

  // Month selector in topbar
  const monthInput = document.getElementById('topbar-month');
  if (monthInput) {
    monthInput.value = AppState.selectedMonth;
    monthInput.addEventListener('change', () => {
      AppState.selectedMonth = monthInput.value;
      if (AppState.currentPage === 'dashboard') loadDashboardPage();
    });
  }

  // Render sidebar nav
  renderNav(role);
}

function renderNav(role) {
  const sidebar = document.getElementById('sidebar-nav');
  const allowed = NAV_ITEMS.filter(item => item.roles.includes(role));

  sidebar.innerHTML = allowed.map(item => `
    <button class="nav-item" data-page="${item.id}" onclick="routeTo('${item.id}')" title="${item.label}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </button>
  `).join('');
}

// ================================================================
// ROUTER (hash-based)
// ================================================================
function routeTo(pageId) {
  // Normalize hash prefix
  if (pageId.startsWith('#')) pageId = pageId.slice(1);

  // Check role access
  const navItem = NAV_ITEMS.find(n => n.id === pageId);
  if (navItem && !navItem.roles.includes(AppState.currentRole)) {
    pageId = 'dashboard';
  }

  AppState.currentPage = pageId;
  window.location.hash = '#' + pageId;

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show & load target page
  const pageEl = document.getElementById(`page-${pageId}`);
  if (pageEl) {
    pageEl.classList.add('active');
    loadPage(pageId);
  }
}

function loadPage(pageId) {
  // Unsubscribe previous realtime channel
  if (AppState.realtimeChannel) {
    window.db.removeChannel(AppState.realtimeChannel);
    AppState.realtimeChannel = null;
  }

  switch (pageId) {
    case 'dashboard':     loadDashboardPage();     break;
    case 'cancellations': loadCancellationsPage();  break;
    case 'credit-notes':  loadCreditNotesPage();    break;
    case 'refunds':       loadRefundsPage();         break;
    case 'reserves':      loadReservesPage();        break;
    case 'users':         loadUsersPage();           break;
  }
}

// ================================================================
// HASH CHANGE LISTENER
// ================================================================
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1) || 'dashboard';
  if (hash !== AppState.currentPage) routeTo(hash);
});

// ================================================================
// UTILITY: TOAST
// ================================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}
window.showToast = showToast;

// ================================================================
// UTILITY: SLA BADGE
// ================================================================
function slaBadge(slaStatus, agingDays) {
  const map = {
    A_green:  { cls: 'sla-green',  label: 'On Time' },
    B_yellow: { cls: 'sla-yellow', label: 'At Risk' },
    C_red:    { cls: 'sla-red',    label: 'Overdue' },
  };
  const { cls, label } = map[slaStatus] || { cls: '', label: slaStatus || '—' };
  const days = agingDays != null ? ` · ${agingDays}d` : '';
  return `<span class="badge ${cls}">${label}${days}</span>`;
}
window.slaBadge = slaBadge;

// ================================================================
// UTILITY: STATUS BADGE
// ================================================================
function statusBadge(status) {
  const map = {
    open:        'badge-open',
    pending:     'badge-pending',
    in_progress: 'badge-in-progress',
    closed:      'badge-closed',
    cancelled:   'badge-cancelled',
    rejected:    'badge-rejected',
    approved:    'badge-approved',
    review:      'badge-review',
  };
  const label = status ? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';
  return `<span class="badge ${map[status] || ''}">${label}</span>`;
}
window.statusBadge = statusBadge;

// ================================================================
// UTILITY: ROLE BADGE
// ================================================================
function roleBadge(role) {
  return `<span class="badge badge-${role}">${role}</span>`;
}
window.roleBadge = roleBadge;

// ================================================================
// UTILITY: FORMAT DATE
// ================================================================
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
window.fmtDate = fmtDate;

// ================================================================
// UTILITY: FORMAT CURRENCY
// ================================================================
function fmtAmount(n, currency = 'USD') {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}
window.fmtAmount = fmtAmount;

// ================================================================
// UTILITY: LOADING HTML
// ================================================================
function loadingHTML(msg = 'Loading...') {
  return `<div class="loading-spinner"><div class="spinner"></div>${msg}</div>`;
}
window.loadingHTML = loadingHTML;

// ================================================================
// UTILITY: PAGINATION RENDERER
// ================================================================
function renderPagination(containerId, currentPage, totalCount, pageSize, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const pages = Math.ceil(totalCount / pageSize);
  const from = currentPage * pageSize + 1;
  const to   = Math.min((currentPage + 1) * pageSize, totalCount);

  el.innerHTML = `
    <button class="btn btn-sm" onclick="${onPageChange}(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>← Prev</button>
    <span>Page ${currentPage + 1} of ${pages || 1}</span>
    <button class="btn btn-sm" onclick="${onPageChange}(${currentPage + 1})" ${currentPage >= pages - 1 ? 'disabled' : ''}>Next →</button>
    <div class="pagination-spacer"></div>
    <span class="pagination-info">${totalCount > 0 ? `${from}–${to} of ${totalCount}` : '0 records'}</span>
  `;
}
window.renderPagination = renderPagination;

// ================================================================
// UTILITY: CLOSE MODAL
// ================================================================
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}
window.closeModal = closeModal;

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  }
});

// ================================================================
// MOBILE SIDEBAR TOGGLE
// ================================================================
function toggleMobileSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}
window.toggleMobileSidebar = toggleMobileSidebar;

// ================================================================
// BOOTSTRAP
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  appInit();
});
