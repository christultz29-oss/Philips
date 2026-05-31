-- ============================================================
-- Seed: Usuarios iniciales del sistema
-- Crea usuarios en auth.users y asigna roles en public.users
--
-- IMPORTANTE: Cambia los emails y contraseñas antes de ejecutar.
-- Los usuarios deberán cambiar su contraseña en el primer login.
-- ============================================================

-- Habilitar extensión para encriptar contraseñas
create extension if not exists pgcrypto;

-- ============================================================
-- Crear usuarios en auth.users
-- ============================================================
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data
) values
  -- Admin
  (
    '00000000-0000-0000-0000-000000000000',
    uuid_generate_v4(),
    'authenticated',
    'authenticated',
    'admin@empresa.com',
    crypt('Admin123!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Administrador"}'::jsonb
  ),
  -- Supply
  (
    '00000000-0000-0000-0000-000000000000',
    uuid_generate_v4(),
    'authenticated',
    'authenticated',
    'supply@empresa.com',
    crypt('Supply123!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Equipo Supply"}'::jsonb
  ),
  -- Specialist
  (
    '00000000-0000-0000-0000-000000000000',
    uuid_generate_v4(),
    'authenticated',
    'authenticated',
    'specialist@empresa.com',
    crypt('Specialist123!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Order Specialist"}'::jsonb
  )
on conflict (email) do nothing;

-- ============================================================
-- Asignar roles en public.users
-- (el trigger handle_new_user ya los creó como 'viewer',
--  aquí actualizamos al rol correcto)
-- ============================================================
update public.users set role = 'admin'
  where id = (select id from auth.users where email = 'admin@empresa.com');

update public.users set role = 'supply'
  where id = (select id from auth.users where email = 'supply@empresa.com');

update public.users set role = 'specialist'
  where id = (select id from auth.users where email = 'specialist@empresa.com');

-- ============================================================
-- Verificar resultado
-- ============================================================
select
  u.email,
  p.full_name,
  p.role,
  p.active
from auth.users u
join public.users p on p.id = u.id
order by p.role;
