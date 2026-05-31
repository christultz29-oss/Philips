// api/rma.js — Vercel Serverless Function (Node.js)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_WAREHOUSES   = ['MAIN', 'RFR', 'RFRB', 'SCRP'];
const VALID_RETURN_TYPES = ['devolucion', 'rechazo'];
const VALID_SCOPES       = ['parcial', 'completo'];
const VALID_STATUSES     = ['pending_om', 'in_process', 'closed', 'cancelled'];

function validateRmaPayload(body) {
  const errors = [];
  if (!body.client_id)    errors.push('client_id requerido');
  if (!body.product_code) errors.push('product_code requerido');
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

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { method } = req;
  // Extraer :id si existe — /api/rma/[id].js lo maneja Vercel automáticamente
  // Aquí lo leemos desde query params
  const id = req.query.id || null;

  try {
    // GET /api/rma
    if (method === 'GET' && !id) {
      const { status, client_id, warehouse, search, page = 0, page_size = 50 } = req.query;
      const pageNum  = parseInt(page);
      const pageSize = Math.min(parseInt(page_size), 100);

      let q = supabase.from('rma_dashboard').select('*', { count: 'exact' })
        .order('request_date', { ascending: false })
        .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1);

      if (status)    q = q.eq('status', status);
      if (client_id) q = q.eq('client_id', client_id);
      if (warehouse) q = q.eq('warehouse', warehouse);
      if (search)    q = q.ilike('product_code', `%${search}%`);

      const { data, error, count } = await q;
      if (error) throw error;
      return res.status(200).json({ data, count, page: pageNum, pageSize });
    }

    // GET /api/rma?id=:id
    if (method === 'GET' && id) {
      const { data, error } = await supabase
        .from('rma_dashboard').select('*').eq('id', id).single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    // POST /api/rma
    if (method === 'POST') {
      const body = req.body;
      const errors = validateRmaPayload(body);
      if (errors.length) return res.status(400).json({ error: errors.join('; ') });

      const { data, error } = await supabase
        .from('rma_requests')
        .insert({ ...body, requester_id: user.id, status: 'pending_om' })
        .select().single();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    // PATCH /api/rma?id=:id
    if (method === 'PATCH' && id) {
      const body = req.body;
      if (body.status && !VALID_STATUSES.includes(body.status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      const { data, error } = await supabase
        .from('rma_requests').update(body).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    return res.status(404).json({ error: 'Ruta no encontrada' });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
