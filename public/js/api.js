// public/js/api.js — All Supabase API calls for BO modules
// Requires window.db to be set (Supabase client)

// ================================================================
// CANCELLATIONS API (rma_cancellations)
// ================================================================
const cancellationsApi = {
  list: async ({ status, country, slaStatus, dateFrom, dateTo, agentId, search, page = 0, pageSize = 50 } = {}) => {
    let q = window.db
      .from('rma_cancellations')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (status)    q = q.eq('status', status);
    if (country)   q = q.eq('country', country);
    if (slaStatus) q = q.eq('sla_status', slaStatus);
    if (agentId)   q = q.eq('agent_id', agentId);
    if (dateFrom)  q = q.gte('case_date', dateFrom);
    if (dateTo)    q = q.lte('case_date', dateTo);
    if (search)    q = q.or(`case_number.ilike.%${search}%,order_number.ilike.%${search}%,rma_number.ilike.%${search}%`);

    return q;
  },

  get: (id) =>
    window.db.from('rma_cancellations').select('*').eq('id', id).single(),

  create: (data) =>
    window.db.from('rma_cancellations').insert(data).select().single(),

  update: (id, data) =>
    window.db.from('rma_cancellations').update(data).eq('id', id).select().single(),

  updateStatus: (id, status, comment) => {
    const payload = { status };
    if (comment) payload.bo_comment = comment;
    return window.db.from('rma_cancellations').update(payload).eq('id', id).select().single();
  },

  subscribeToChanges: (callback) =>
    window.db
      .channel('cancellations_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rma_cancellations' }, callback)
      .subscribe(),
};

// ================================================================
// REFUNDS API (refund_requests)
// ================================================================
const refundsApi = {
  list: async ({ status, country, slaStatus, dateFrom, dateTo, agentId, search, page = 0, pageSize = 50 } = {}) => {
    let q = window.db
      .from('refund_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (status)    q = q.eq('status', status);
    if (country)   q = q.eq('country', country);
    if (slaStatus) q = q.eq('sla_status', slaStatus);
    if (agentId)   q = q.eq('agent_id', agentId);
    if (dateFrom)  q = q.gte('request_date', dateFrom);
    if (dateTo)    q = q.lte('request_date', dateTo);
    if (search)    q = q.or(`case_number.ilike.%${search}%,order_number.ilike.%${search}%`);

    return q;
  },

  get: (id) =>
    window.db.from('refund_requests').select('*').eq('id', id).single(),

  create: (data) =>
    window.db.from('refund_requests').insert(data).select().single(),

  update: (id, data) =>
    window.db.from('refund_requests').update(data).eq('id', id).select().single(),

  updateStatus: (id, status, comment) => {
    const payload = { status };
    if (comment) payload.bo_comment = comment;
    return window.db.from('refund_requests').update(payload).eq('id', id).select().single();
  },

  subscribeToChanges: (callback) =>
    window.db
      .channel('refunds_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refund_requests' }, callback)
      .subscribe(),
};

// ================================================================
// CREDIT NOTES API (credit_notes)
// ================================================================
const creditNotesApi = {
  list: async ({ status, country, slaStatus, dateFrom, dateTo, agentId, search, page = 0, pageSize = 50 } = {}) => {
    let q = window.db
      .from('credit_notes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (status)    q = q.eq('status', status);
    if (country)   q = q.eq('country', country);
    if (slaStatus) q = q.eq('sla_status', slaStatus);
    if (agentId)   q = q.eq('agent_id', agentId);
    if (dateFrom)  q = q.gte('note_date', dateFrom);
    if (dateTo)    q = q.lte('note_date', dateTo);
    if (search)    q = q.or(`case_number.ilike.%${search}%,sap_doc_number.ilike.%${search}%`);

    return q;
  },

  get: (id) =>
    window.db.from('credit_notes').select('*').eq('id', id).single(),

  create: (data) =>
    window.db.from('credit_notes').insert(data).select().single(),

  update: (id, data) =>
    window.db.from('credit_notes').update(data).eq('id', id).select().single(),

  updateStatus: (id, status, comment) => {
    const payload = { status };
    if (comment) payload.bo_comment = comment;
    return window.db.from('credit_notes').update(payload).eq('id', id).select().single();
  },

  subscribeToChanges: (callback) =>
    window.db
      .channel('credit_notes_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_notes' }, callback)
      .subscribe(),
};

// ================================================================
// PAYMENT RESERVES API (payment_reserves)
// ================================================================
const reservesApi = {
  list: async ({ status, country, slaStatus, dateFrom, dateTo, agentId, search, page = 0, pageSize = 50 } = {}) => {
    let q = window.db
      .from('payment_reserves')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (status)    q = q.eq('status', status);
    if (country)   q = q.eq('country', country);
    if (slaStatus) q = q.eq('sla_status', slaStatus);
    if (agentId)   q = q.eq('agent_id', agentId);
    if (dateFrom)  q = q.gte('reserve_date', dateFrom);
    if (dateTo)    q = q.lte('reserve_date', dateTo);
    if (search)    q = q.or(`case_number.ilike.%${search}%,order_number.ilike.%${search}%`);

    return q;
  },

  get: (id) =>
    window.db.from('payment_reserves').select('*').eq('id', id).single(),

  create: (data) =>
    window.db.from('payment_reserves').insert(data).select().single(),

  update: (id, data) =>
    window.db.from('payment_reserves').update(data).eq('id', id).select().single(),

  updateStatus: (id, status, comment) => {
    const payload = { status };
    if (comment) payload.bo_comment = comment;
    return window.db.from('payment_reserves').update(payload).eq('id', id).select().single();
  },

  subscribeToChanges: (callback) =>
    window.db
      .channel('reserves_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_reserves' }, callback)
      .subscribe(),
};

// ================================================================
// KPIs API — RPC functions
// ================================================================
const kpisApi = {
  getKpis: async (month, country) => {
    const params = {};
    if (month)   params.p_month = month;
    if (country) params.p_country = country;
    return window.db.rpc('get_bo_kpis', params);
  },

  getAgentPerformance: async (month, country) => {
    const params = {};
    if (month)   params.p_month = month;
    if (country) params.p_country = country;
    return window.db.rpc('get_agent_performance', params);
  },

  getCriticalCases: async () =>
    window.db.rpc('get_critical_cases'),

  getUnifiedDashboard: async (filters = {}) => {
    let q = window.db
      .from('bo_unified_dashboard')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(50);

    if (filters.country) q = q.eq('country', filters.country);
    return q;
  },
};

// ================================================================
// USERS API
// ================================================================
const usersApi = {
  list: () =>
    window.db.from('users').select('*').order('full_name'),

  get: (id) =>
    window.db.from('users').select('*').eq('id', id).single(),

  update: (id, data) =>
    window.db.from('users').update(data).eq('id', id).select().single(),

  getCurrentProfile: async () => {
    const { data: { user } } = await window.db.auth.getUser();
    if (!user) return { data: null };
    return window.db.from('users').select('*').eq('id', user.id).single();
  },
};

// Expose globally
window.cancellationsApi = cancellationsApi;
window.refundsApi = refundsApi;
window.creditNotesApi = creditNotesApi;
window.reservesApi = reservesApi;
window.kpisApi = kpisApi;
window.usersApi = usersApi;
