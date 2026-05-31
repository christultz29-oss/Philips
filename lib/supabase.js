// lib/supabase.js — cliente singleton con helpers tipados
// Importar desde CDN en index.html:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>

const SUPABASE_URL = window.__ENV?.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.__ENV?.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ============================================================
// AUTH
// ============================================================
export const auth = {
  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  signOut: () => supabase.auth.signOut(),

  getSession: () => supabase.auth.getSession(),

  onAuthChange: (cb) => supabase.auth.onAuthStateChange(cb),
};

// ============================================================
// RMA REQUESTS
// ============================================================
export const rmaApi = {
  // Listar con filtros opcionales
  list: async ({ status, clientId, warehouseType, search, page = 0, pageSize = 50 } = {}) => {
    let q = supabase
      .from('rma_dashboard')
      .select('*', { count: 'exact' })
      .order('request_date', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (status)        q = q.eq('status', status);
    if (clientId)      q = q.eq('client_id', clientId);
    if (warehouseType) q = q.eq('warehouse', warehouseType);
    if (search)        q = q.ilike('product_code', `%${search}%`);

    return q;
  },

  // Un RMA por ID
  get: (id) =>
    supabase.from('rma_dashboard').select('*').eq('id', id).single(),

  // Crear
  create: (data) =>
    supabase.from('rma_requests').insert(data).select().single(),

  // Actualizar
  update: (id, data) =>
    supabase.from('rma_requests').update(data).eq('id', id).select().single(),

  // Cambiar status (con log automático vía trigger)
  updateStatus: (id, status, assignedToId) =>
    supabase
      .from('rma_requests')
      .update({ status, assigned_to_id: assignedToId })
      .eq('id', id)
      .select()
      .single(),

  // Historial de status
  getStatusLog: (rmaId) =>
    supabase
      .from('rma_status_log')
      .select('*, changed_by_user:users(full_name)')
      .eq('rma_request_id', rmaId)
      .order('changed_at', { ascending: false }),

  // KPIs para dashboard
  kpis: async () => {
    const { data, error } = await supabase
      .from('rma_requests')
      .select('status, aging_days, returned_amount');

    if (error) return { error };

    const kpis = {
      total: data.length,
      pending: data.filter(r => r.status === 'pending_om').length,
      inProcess: data.filter(r => r.status === 'in_process').length,
      closed: data.filter(r => r.status === 'closed').length,
      avgAging: data.length
        ? Math.round(data.reduce((s, r) => s + (r.aging_days || 0), 0) / data.length)
        : 0,
      totalReturnedAmount: data.reduce((s, r) => s + (r.returned_amount || 0), 0),
    };
    return { data: kpis };
  },
};

// ============================================================
// CLIENTS
// ============================================================
export const clientsApi = {
  list: () =>
    supabase.from('clients').select('*').eq('active', true).order('name'),

  create: (data) =>
    supabase.from('clients').insert(data).select().single(),
};

// ============================================================
// RETURN REASONS
// ============================================================
export const reasonsApi = {
  list: () =>
    supabase
      .from('return_reasons')
      .select('*')
      .eq('active', true)
      .order('code'),
};

// ============================================================
// USERS
// ============================================================
export const usersApi = {
  me: () =>
    supabase.from('users').select('*').eq('id', (await supabase.auth.getUser()).data.user?.id).single(),

  list: () =>
    supabase.from('users').select('id, full_name, role').eq('active', true).order('full_name'),
};

// ============================================================
// IMAGES — Supabase Storage
// ============================================================
export const imagesApi = {
  upload: async (rmaId, file, imageType = 'other') => {
    const ext = file.name.split('.').pop();
    const path = `rma/${rmaId}/${imageType}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('rma-images')
      .upload(path, file, { upsert: false });

    if (uploadError) return { error: uploadError };

    const { data: urlData } = supabase.storage
      .from('rma-images')
      .getPublicUrl(path);

    const { data, error } = await supabase.from('rma_images').insert({
      rma_request_id: rmaId,
      image_type: imageType,
      storage_path: path,
      uploaded_by: (await supabase.auth.getUser()).data.user.id,
    }).select().single();

    return { data: { ...data, publicUrl: urlData.publicUrl }, error };
  },

  list: (rmaId) =>
    supabase.from('rma_images').select('*').eq('rma_request_id', rmaId),

  delete: async (imageId, storagePath) => {
    await supabase.storage.from('rma-images').remove([storagePath]);
    return supabase.from('rma_images').delete().eq('id', imageId);
  },
};

// ============================================================
// REALTIME — escuchar cambios en tiempo real
// ============================================================
export const realtime = {
  subscribeToRma: (cb) =>
    supabase
      .channel('rma_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rma_requests' }, cb)
      .subscribe(),
};
