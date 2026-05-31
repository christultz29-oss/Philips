// api/rma.js — Vercel Edge Function
// Valida inputs en servidor antes de llegar a Supabase
// Supabase ya tiene RLS, esta capa previene payloads malformados

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role para server-side
);

// ============================================================
// Validación de esquema (sin dependencias externas)
// ============================================================
const VALID_WAREHOUSES = ['MAIN', 'RFR', 'RFRB', 'SCRP'];
const VALID_RETURN_TYPES = ['devolucion', 'rechazo'];
const VALID_SCOPES = ['parcial', 'completo'];
const VALID_STATUSES = ['pending_om', 'in_process', 'closed', 'cancelled'];

function validateRmaPayload(body) {
  const errors = [];

  if (!body.client_id)      errors.push('client_id requerido');
  if (!body.product_code)   errors.push('product_code requerido');
  if (!body.warehouse || !VALID_WAREHOUSES.includes(body.warehouse))
    errors.push(`warehouse debe ser: ${VALID_WAREHOUSES.join(', ')}`);
  if (!body.return_type || !VALID_RETURN_TYPES.includes(body.return_type))
    errors.push(`return_type debe ser: ${VALID_RETURN_TYPES.join(', ')}`);
  if (!body.return_scope || !VALID_SCOPES.includes(body.return_scope))
    errors.push(`return_scope debe ser: ${VALID_SCOPES.join(', ')}`);
  if (!body.quantity || body.quantity < 1 || !Number.isInteger(Number(body.quantity)))
    errors.push('quantity debe ser entero mayor a 0');

  return errors;
}

// ============================================================
// Handler principal
// ============================================================
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const method = req.method;

  // CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers });

  // Extraer JWT del usuario para validar identidad
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers });
  }

  try {
    // GET /api/rma — listar
    if (method === 'GET' && !url.pathname.includes('/api/rma/')) {
      const params = Object.fromEntries(url.searchParams);
      let q = supabase.from('rma_dashboard').select('*', { count: 'exact' })
        .order('request_date', { ascending: false });

      if (params.status)    q = q.eq('status', params.status);
      if (params.client_id) q = q.eq('client_id', params.client_id);
      if (params.warehouse) q = q.eq('warehouse', params.warehouse);
      if (params.search)    q = q.ilike('product_code', `%${params.search}%`);

      const page = parseInt(params.page || '0');
      const pageSize = Math.min(parseInt(params.page_size || '50'), 100);
      q = q.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      return new Response(JSON.stringify({ data, count, page, pageSize }), { status: 200, headers });
    }

    // GET /api/rma/:id — detalle
    const idMatch = url.pathname.match(/\/api\/rma\/([^/]+)$/);
    if (method === 'GET' && idMatch) {
      const { data, error } = await supabase
        .from('rma_dashboard').select('*').eq('id', idMatch[1]).single();
      if (error) throw error;
      return new Response(JSON.stringify({ data }), { status: 200, headers });
    }

    // POST /api/rma — crear
    if (method === 'POST') {
      const body = await req.json();
      const errors = validateRmaPayload(body);
      if (errors.length) {
        return new Response(JSON.stringify({ error: errors.join('; ') }), { status: 400, headers });
      }

      const payload = {
        ...body,
        requester_id: user.id,
        status: 'pending_om',
      };
      const { data, error } = await supabase.from('rma_requests').insert(payload).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ data }), { status: 201, headers });
    }

    // PATCH /api/rma/:id — actualizar
    const patchMatch = url.pathname.match(/\/api\/rma\/([^/]+)$/);
    if (method === 'PATCH' && patchMatch) {
      const body = await req.json();
      // Validar status si viene
      if (body.status && !VALID_STATUSES.includes(body.status)) {
        return new Response(JSON.stringify({ error: 'Status inválido' }), { status: 400, headers });
      }
      const { data, error } = await supabase
        .from('rma_requests').update(body).eq('id', patchMatch[1]).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ data }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Ruta no encontrada' }), { status: 404, headers });

  } catch (err) {
    console.error('API Error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Error interno del servidor' }),
      { status: 500, headers }
    );
  }
}
