-- ============================================================
-- Seed BO: Datos de prueba para el sistema Back Office
-- Ejecutar DESPUÉS de crear usuarios reales en auth.users
-- ============================================================

-- ============================================================
-- Motivos de cancelación de RMA (específicos del módulo)
-- ============================================================
insert into public.return_reasons (code, description, category, active) values
  ('RMA-01', 'RMA incorrecto creado',             'RMA',     true),
  ('RMA-02', 'Duplicado de RMA existente',         'RMA',     true),
  ('RMA-03', 'Cliente canceló la devolución',      'RMA',     true),
  ('RMA-04', 'Producto fue entregado correctamente','RMA',    true),
  ('REF-01', 'Reembolso ya procesado por otra vía','Reembolso',true),
  ('REF-02', 'Monto incorrecto en la solicitud',   'Reembolso',true),
  ('REF-03', 'Orden cancelada antes de envío',     'Reembolso',true),
  ('CR-01',  'Nota de crédito manual requerida',   'Crédito', true),
  ('CR-02',  'Ajuste de precio post-venta',         'Crédito', true),
  ('CR-03',  'Compensación por error operativo',    'Crédito', true)
on conflict (code) do nothing;

-- ============================================================
-- NOTA: Los usuarios de prueba se crean desde seed_users.sql
-- Los datos de prueba para los módulos BO (rma_cancellations,
-- credit_notes, refund_requests, payment_reserves) deben
-- insertarse con UUIDs reales de auth.users.
--
-- Ejemplo para insertar después de tener usuarios:
--
-- insert into public.rma_cancellations (
--   country, date_logged, case_number, order_number, rma_number,
--   products, quantity, reason, comments, agent_id, status, in_time
-- ) values
--   ('PA', current_date - 3, '60-0039596510', '44114906142', '203803686',
--    'SCY906/04', 1, 'RMA incorrecto creado', 'Please delete RMA',
--    '<agent_user_uuid>', 'open', null);
-- ============================================================
