-- ============================================================
-- Seed: Catálogo de motivos de devolución
-- ============================================================

insert into public.return_reasons (code, description, category, active) values
  -- Calidad del producto
  ('CAL-01', 'Producto defectuoso de fábrica',          'Calidad',    true),
  ('CAL-02', 'Producto dañado en tránsito',              'Calidad',    true),
  ('CAL-03', 'Producto no cumple especificaciones',      'Calidad',    true),
  ('CAL-04', 'Producto con fecha de caducidad vencida',  'Calidad',    true),

  -- Error de pedido
  ('PED-01', 'Código incorrecto enviado',                'Pedido',     true),
  ('PED-02', 'Cantidad incorrecta enviada',              'Pedido',     true),
  ('PED-03', 'Pedido duplicado',                         'Pedido',     true),
  ('PED-04', 'Precio incorrecto en factura',             'Pedido',     true),

  -- Logística
  ('LOG-01', 'Error en dirección de entrega',            'Logística',  true),
  ('LOG-02', 'Entrega fuera de tiempo acordado',         'Logística',  true),
  ('LOG-03', 'Embalaje inadecuado',                      'Logística',  true),

  -- Cliente
  ('CLI-01', 'Cambio de decisión del cliente',           'Cliente',    true),
  ('CLI-02', 'Producto no requerido',                    'Cliente',    true),
  ('CLI-03', 'Fin de contrato / proyecto cancelado',     'Cliente',    true),

  -- Otros
  ('OTR-01', 'Garantía / reclamación de garantía',       'Garantía',   true),
  ('OTR-02', 'Rechazo en aduana',                        'Aduanas',    true),
  ('OTR-99', 'Otro motivo',                              'Otro',       true)
on conflict (code) do nothing;
