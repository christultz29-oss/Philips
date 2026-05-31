-- ============================================================
-- RMA Returns Management Schema
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- CLIENTS
-- ============================================================
create table if not exists public.clients (
  id         uuid        primary key default uuid_generate_v4(),
  name       text        not null unique,
  country    text        not null default 'MX',
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RETURN REASONS
-- ============================================================
create table if not exists public.return_reasons (
  id          uuid        primary key default uuid_generate_v4(),
  code        text        not null unique,
  description text        not null,
  category    text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- USERS  (espejo de auth.users)
-- ============================================================
create table if not exists public.users (
  id         uuid    primary key references auth.users(id) on delete cascade,
  full_name  text    not null,
  role       text    not null default 'viewer',   -- admin | supply | specialist | viewer
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.users (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RMA REQUESTS
-- ============================================================
create table if not exists public.rma_requests (
  id                  uuid        primary key default uuid_generate_v4(),
  request_date        date        not null default current_date,
  requester_id        uuid        references auth.users(id),
  client_id           uuid        not null references public.clients(id),
  po_number           text,
  warehouse           text        not null
                        check (warehouse in ('MAIN','RFR','RFRB','SCRP')),
  product_code        text        not null,
  nc_code             text,
  quantity            integer     not null check (quantity > 0),
  invoice_number      text,
  return_type         text        not null
                        check (return_type in ('devolucion','rechazo')),
  return_scope        text        not null
                        check (return_scope in ('parcial','completo')),
  return_reason_id    uuid        references public.return_reasons(id),
  supply_comments     text,
  specialist_comments text,
  rma_number          text,
  returned_amount     numeric(12,2),
  realization_date    date,
  arrears             integer,
  aging_days          integer,            -- calculado por trigger; cron lo refresca diariamente
  status              text        not null default 'pending_om'
                        check (status in ('pending_om','in_process','closed','cancelled')),
  assigned_to_id      uuid        references public.users(id),
  detail_notes        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---- Triggers de RMA REQUESTS ----

-- updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rma_requests_updated_at
  before update on public.rma_requests
  for each row execute function public.set_updated_at();

-- aging_days: se recalcula en cada insert/update de fechas
-- Para mantenerlo fresco en registros abiertos, ejecutar diariamente:
--   update rma_requests set aging_days = (current_date - request_date)::integer
--   where status not in ('closed','cancelled') and realization_date is null;
create or replace function public.compute_aging_days()
returns trigger language plpgsql as $$
begin
  new.aging_days := case
    when new.realization_date is not null
      then (new.realization_date - new.request_date)::integer
    else
      (current_date - new.request_date)::integer
  end;
  return new;
end;
$$;

create trigger rma_compute_aging
  before insert or update of request_date, realization_date, status
  on public.rma_requests
  for each row execute function public.compute_aging_days();

-- ============================================================
-- RMA STATUS LOG
-- ============================================================
create table if not exists public.rma_status_log (
  id             uuid        primary key default uuid_generate_v4(),
  rma_request_id uuid        not null references public.rma_requests(id) on delete cascade,
  from_status    text,
  to_status      text        not null,
  changed_by     uuid        references auth.users(id),
  changed_at     timestamptz not null default now()
);

create or replace function public.log_rma_status_change()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (old.status is distinct from new.status) then
    insert into public.rma_status_log (rma_request_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger rma_status_change_log
  after update on public.rma_requests
  for each row execute function public.log_rma_status_change();

-- ============================================================
-- RMA IMAGES
-- ============================================================
create table if not exists public.rma_images (
  id             uuid        primary key default uuid_generate_v4(),
  rma_request_id uuid        not null references public.rma_requests(id) on delete cascade,
  image_type     text        not null default 'other'
                   check (image_type in ('po','return_type','scope','product','other')),
  storage_path   text        not null,
  uploaded_by    uuid        references auth.users(id),
  uploaded_at    timestamptz not null default now()
);

-- ============================================================
-- DASHBOARD VIEW
-- ============================================================
create or replace view public.rma_dashboard as
  select
    r.id,
    r.request_date,
    r.po_number,
    r.warehouse,
    r.product_code,
    r.nc_code,
    r.quantity,
    r.invoice_number,
    r.return_type,
    r.return_scope,
    r.supply_comments,
    r.specialist_comments,
    r.rma_number,
    r.returned_amount,
    r.realization_date,
    r.arrears,
    -- aging siempre fresco desde la vista
    case
      when r.realization_date is not null
        then (r.realization_date - r.request_date)::integer
      else
        (current_date - r.request_date)::integer
    end as aging_days,
    r.status,
    r.detail_notes,
    r.created_at,
    r.updated_at,
    -- FKs expuestos para edición
    r.client_id,
    r.return_reason_id,
    r.requester_id,
    r.assigned_to_id,
    -- Joins
    c.name                 as client_name,
    rr.code                as reason_code,
    rr.description         as reason_description,
    u.full_name            as assigned_to_name,
    (select count(*)::integer
       from public.rma_images i
      where i.rma_request_id = r.id) as image_count
  from public.rma_requests r
  left join public.clients        c  on c.id  = r.client_id
  left join public.return_reasons rr on rr.id = r.return_reason_id
  left join public.users          u  on u.id  = r.assigned_to_id;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_rma_status      on public.rma_requests(status);
create index if not exists idx_rma_client      on public.rma_requests(client_id);
create index if not exists idx_rma_warehouse   on public.rma_requests(warehouse);
create index if not exists idx_rma_date        on public.rma_requests(request_date desc);
create index if not exists idx_rma_product     on public.rma_requests(product_code);
create index if not exists idx_rma_images_rma  on public.rma_images(rma_request_id);
create index if not exists idx_status_log_rma  on public.rma_status_log(rma_request_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.clients        enable row level security;
alter table public.return_reasons enable row level security;
alter table public.users          enable row level security;
alter table public.rma_requests   enable row level security;
alter table public.rma_images     enable row level security;
alter table public.rma_status_log enable row level security;

-- Lectura: cualquier usuario autenticado
create policy "rls_read_clients"     on public.clients        for select to authenticated using (true);
create policy "rls_read_reasons"     on public.return_reasons for select to authenticated using (true);
create policy "rls_read_users"       on public.users          for select to authenticated using (true);
create policy "rls_read_rma"         on public.rma_requests   for select to authenticated using (true);
create policy "rls_read_images"      on public.rma_images     for select to authenticated using (true);
create policy "rls_read_status_log"  on public.rma_status_log for select to authenticated using (true);

-- Escritura: cualquier usuario autenticado puede insertar/actualizar
create policy "rls_insert_clients"   on public.clients        for insert to authenticated with check (true);
create policy "rls_insert_rma"       on public.rma_requests   for insert to authenticated with check (true);
create policy "rls_update_rma"       on public.rma_requests   for update to authenticated using (true);
create policy "rls_insert_images"    on public.rma_images     for insert to authenticated with check (true);
create policy "rls_delete_images"    on public.rma_images     for delete to authenticated using (true);
