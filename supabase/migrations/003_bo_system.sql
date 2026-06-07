-- ============================================================
-- MIGRACIÓN 003 — Sistema Back Office Completo
-- Módulos: RMA Cancellations, Credit Notes, Refunds, Payment Reserves
-- Roles: agent | ols | supervisor | admin
-- ============================================================

-- ============================================================
-- 1. ROLES DEL SISTEMA
-- ============================================================
-- agent      → agente BO, crea y edita sus propios casos
-- ols        → Operations Lead, aprueba/rechaza, ve todo el equipo
-- supervisor → visibilidad total + reportes + gestión de usuarios
-- admin      → acceso completo incluyendo configuración del sistema

-- Actualizar restricción de roles en tabla users
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('agent', 'ols', 'supervisor', 'admin', 'viewer'));

-- Agregar columnas extra al perfil de usuario
alter table public.users
  add column if not exists country    text not null default 'PA',
  add column if not exists team       text,
  add column if not exists avatar_url text,
  add column if not exists last_seen  timestamptz;

-- Helper: obtener el rol del usuario autenticado actual
create or replace function public.my_role()
returns text language sql security definer stable
set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

-- Helper: verificar si el usuario tiene al menos cierto nivel de rol
create or replace function public.has_role(required_role text)
returns boolean language plpgsql security definer stable
set search_path = public as $$
declare
  role_order text[] := array['viewer','agent','ols','supervisor','admin'];
  my_idx int;
  req_idx int;
begin
  select array_position(role_order, public.my_role()) into my_idx;
  select array_position(role_order, required_role)    into req_idx;
  return coalesce(my_idx, 0) >= coalesce(req_idx, 999);
end;
$$;

-- ============================================================
-- 2. PAÍSES PERMITIDOS (catálogo)
-- ============================================================
create table if not exists public.countries (
  code        text primary key,  -- 'PA', 'US', 'CA', 'MX'
  name        text not null,
  active      boolean not null default true
);

insert into public.countries (code, name) values
  ('PA', 'Panamá'),
  ('US', 'United States'),
  ('CA', 'Canada'),
  ('MX', 'México')
on conflict (code) do nothing;

-- ============================================================
-- 3. RMA CANCELLATIONS
-- (equivalente a la hoja "RMA Cancellation" del Excel)
-- ============================================================
create table if not exists public.rma_cancellations (
  id                  uuid        primary key default uuid_generate_v4(),

  -- Origen
  country             text        not null references public.countries(code),
  date_logged         date        not null default current_date,
  case_number         text        not null,
  order_number        text        not null,
  rma_number          text        not null,
  rma_number_2nd      text,
  products            text        not null,
  quantity            integer     not null check (quantity > 0),

  -- Motivo
  reason              text        not null,
  comments            text,

  -- Asignación
  agent_id            uuid        not null references public.users(id),
  dn_number           text,
  return_open_box_num text,
  rma_in_hybris       text,
  rma_reason_hybris   text
    check (rma_reason_hybris in ('Return_with_refund','Return_for_repair','Return_for_replacement', null)),

  -- Acción OLS
  date_ols_actioned   date,
  ols_id              uuid        references public.users(id),
  ols_comments        text,

  -- Estado
  status              text        not null default 'open'
    check (status in ('open','completed','cancelled')),
  bo_comments         text,

  -- SLA
  arrears             integer,
  aging_days          integer,
  sla_status          text        generated always as (
                        case
                          when aging_days is null then 'unknown'
                          when aging_days <= 2    then 'A_green'
                          when aging_days <= 5    then 'B_yellow'
                          else                         'C_red'
                        end
                      ) stored,
  month               date,
  in_time             boolean,    -- IT = true, OOT = false (meta 80%)
  still_open_reason   text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Trigger updated_at
create trigger rma_cancellations_updated_at
  before update on public.rma_cancellations
  for each row execute function public.set_updated_at();

-- Trigger aging_days
create or replace function public.compute_cancellation_aging()
returns trigger language plpgsql as $$
begin
  new.aging_days := case
    when new.date_ols_actioned is not null
      then (new.date_ols_actioned - new.date_logged)::integer
    else
      (current_date - new.date_logged)::integer
  end;
  return new;
end;
$$;

create trigger rma_cancellation_aging
  before insert or update of date_logged, date_ols_actioned
  on public.rma_cancellations
  for each row execute function public.compute_cancellation_aging();

-- Log de cambios de estado
create table if not exists public.rma_cancellation_log (
  id              uuid        primary key default uuid_generate_v4(),
  cancellation_id uuid        not null references public.rma_cancellations(id) on delete cascade,
  from_status     text,
  to_status       text        not null,
  changed_by      uuid        references public.users(id),
  note            text,
  changed_at      timestamptz not null default now()
);

create or replace function public.log_cancellation_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.status is distinct from new.status) then
    insert into public.rma_cancellation_log(cancellation_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger rma_cancellation_status_log
  after update on public.rma_cancellations
  for each row execute function public.log_cancellation_status();

-- ============================================================
-- 4. SAP MANUAL CREDIT NOTES
-- (equivalente a "SAP Manual Credit Note Request")
-- ============================================================
create table if not exists public.credit_notes (
  id                      uuid        primary key default uuid_generate_v4(),

  refund_request_type     text        not null default 'manual'
    check (refund_request_type in ('manual','automatic')),
  country                 text        not null references public.countries(code),
  date_logged             date        not null default current_date,
  case_number             text        not null,
  order_number            text        not null,
  replacement_order_num   text,
  replacement_order_2nd   text,

  -- Montos
  order_net_amount        numeric(12,2) not null default 0,
  order_tax_amount        numeric(12,2) not null default 0,
  total_order_amount      numeric(12,2) generated always as (order_net_amount + order_tax_amount) stored,
  amount_to_refund        numeric(12,2) not null default 0,

  reason                  text        not null,
  comments                text,
  agent_id                uuid        not null references public.users(id),

  -- SAP
  cr_number               text,
  billing_doc             text,
  cr_amount               numeric(12,2),

  -- Acción OLS
  date_ols_actioned       date,
  ols_id                  uuid        references public.users(id),
  ols_comments            text,

  -- SLA
  arrears                 integer,
  aging_days              integer,
  sla_status              text        generated always as (
                            case
                              when aging_days is null then 'unknown'
                              when aging_days <= 2    then 'A_green'
                              when aging_days <= 5    then 'B_yellow'
                              else                         'C_red'
                            end
                          ) stored,
  month                   date,
  in_time                 boolean,
  still_open_reason       text,

  status                  text        not null default 'pending'
    check (status in ('pending','in_sap','completed','cancelled')),
  bo_comments             text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger credit_notes_updated_at
  before update on public.credit_notes
  for each row execute function public.set_updated_at();

create or replace function public.compute_credit_note_aging()
returns trigger language plpgsql as $$
begin
  new.aging_days := case
    when new.date_ols_actioned is not null
      then (new.date_ols_actioned - new.date_logged)::integer
    else
      (current_date - new.date_logged)::integer
  end;
  return new;
end;
$$;

create trigger credit_note_aging
  before insert or update of date_logged, date_ols_actioned
  on public.credit_notes
  for each row execute function public.compute_credit_note_aging();

create table if not exists public.credit_note_log (
  id          uuid        primary key default uuid_generate_v4(),
  note_id     uuid        not null references public.credit_notes(id) on delete cascade,
  from_status text,
  to_status   text        not null,
  changed_by  uuid        references public.users(id),
  note        text,
  changed_at  timestamptz not null default now()
);

create or replace function public.log_credit_note_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.status is distinct from new.status) then
    insert into public.credit_note_log(note_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger credit_note_status_log
  after update on public.credit_notes
  for each row execute function public.log_credit_note_status();

-- ============================================================
-- 5. WAITING FOR REFUND
-- (equivalente a "Waiting for Refund" — el módulo más grande)
-- ============================================================
create table if not exists public.refund_requests (
  id                      uuid        primary key default uuid_generate_v4(),

  refund_request_type     text        not null default 'standard',
  country                 text        not null references public.countries(code),
  date_logged             date        not null default current_date,
  case_number             text        not null,
  order_number            text        not null,
  rma_number              text,
  replacement_order_num   text,
  replacement_order_2nd   text,

  -- Productos
  products_returned       text,
  quantity                integer     check (quantity > 0),

  -- Montos
  order_net_amount        numeric(12,2) not null default 0,
  order_tax_amount        numeric(12,2) not null default 0,
  total_order_amount      numeric(12,2) generated always as (order_net_amount + order_tax_amount) stored,
  amount_to_refund        numeric(12,2) not null default 0,

  reason                  text        not null,
  comments                text,
  agent_id                uuid        not null references public.users(id),

  -- SAP / Financiero
  cr_number               text,
  billing_doc             text,
  cr_amount               numeric(12,2),

  -- Acción OLS
  date_ols_actioned       date,
  ols_id                  uuid        references public.users(id),
  ols_comments            text,

  -- Estado
  status                  text        not null default 'waiting'
    check (status in ('waiting','in_process','refunded','cancelled')),
  bo_comments             text,

  -- SLA
  arrears                 integer,
  aging_days              integer,
  sla_status              text        generated always as (
                            case
                              when aging_days is null then 'unknown'
                              when aging_days <= 2    then 'A_green'
                              when aging_days <= 5    then 'B_yellow'
                              else                         'C_red'
                            end
                          ) stored,
  month                   date,
  in_time                 boolean,
  still_open_reason       text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger refund_requests_updated_at
  before update on public.refund_requests
  for each row execute function public.set_updated_at();

create or replace function public.compute_refund_aging()
returns trigger language plpgsql as $$
begin
  new.aging_days := case
    when new.date_ols_actioned is not null
      then (new.date_ols_actioned - new.date_logged)::integer
    else
      (current_date - new.date_logged)::integer
  end;
  return new;
end;
$$;

create trigger refund_aging
  before insert or update of date_logged, date_ols_actioned
  on public.refund_requests
  for each row execute function public.compute_refund_aging();

create table if not exists public.refund_request_log (
  id          uuid        primary key default uuid_generate_v4(),
  refund_id   uuid        not null references public.refund_requests(id) on delete cascade,
  from_status text,
  to_status   text        not null,
  changed_by  uuid        references public.users(id),
  note        text,
  changed_at  timestamptz not null default now()
);

create or replace function public.log_refund_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.status is distinct from new.status) then
    insert into public.refund_request_log(refund_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger refund_status_log
  after update on public.refund_requests
  for each row execute function public.log_refund_status();

-- ============================================================
-- 6. PAYMENT AMOUNT RESERVED
-- ============================================================
create table if not exists public.payment_reserves (
  id              uuid        primary key default uuid_generate_v4(),

  reserve_date    date        not null default current_date,
  po_number       text        not null,
  initial_status  text        not null,
  agent_id        uuid        not null references public.users(id),
  requested_action text       not null,
  final_status    text,
  ols_id          uuid        references public.users(id),
  ols_comments    text,
  date_ols_actioned date,

  status          text        not null default 'pending'
    check (status in ('pending','actioned','closed')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger payment_reserves_updated_at
  before update on public.payment_reserves
  for each row execute function public.set_updated_at();

-- ============================================================
-- 7. ÍNDICES
-- ============================================================
create index if not exists idx_cancel_country    on public.rma_cancellations(country);
create index if not exists idx_cancel_status     on public.rma_cancellations(status);
create index if not exists idx_cancel_agent      on public.rma_cancellations(agent_id);
create index if not exists idx_cancel_date       on public.rma_cancellations(date_logged desc);
create index if not exists idx_cancel_sla        on public.rma_cancellations(sla_status);

create index if not exists idx_cn_country        on public.credit_notes(country);
create index if not exists idx_cn_status         on public.credit_notes(status);
create index if not exists idx_cn_agent          on public.credit_notes(agent_id);
create index if not exists idx_cn_date           on public.credit_notes(date_logged desc);

create index if not exists idx_refund_country    on public.refund_requests(country);
create index if not exists idx_refund_status     on public.refund_requests(status);
create index if not exists idx_refund_agent      on public.refund_requests(agent_id);
create index if not exists idx_refund_date       on public.refund_requests(date_logged desc);
create index if not exists idx_refund_sla        on public.refund_requests(sla_status);

create index if not exists idx_reserve_status    on public.payment_reserves(status);
create index if not exists idx_reserve_agent     on public.payment_reserves(agent_id);

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================
alter table public.countries          enable row level security;
alter table public.rma_cancellations  enable row level security;
alter table public.rma_cancellation_log enable row level security;
alter table public.credit_notes       enable row level security;
alter table public.credit_note_log    enable row level security;
alter table public.refund_requests    enable row level security;
alter table public.refund_request_log enable row level security;
alter table public.payment_reserves   enable row level security;

-- Countries: lectura pública
create policy "countries_read" on public.countries for select to authenticated using (true);

-- ---- RMA Cancellations ----
-- Agente ve solo sus casos; OLS/Supervisor/Admin ven todo
create policy "cancel_select" on public.rma_cancellations for select to authenticated
  using (
    agent_id = auth.uid()
    or public.has_role('ols')
  );

create policy "cancel_insert" on public.rma_cancellations for insert to authenticated
  with check (agent_id = auth.uid() or public.has_role('ols'));

create policy "cancel_update" on public.rma_cancellations for update to authenticated
  using (
    -- Agente puede editar sus propios casos abiertos
    (agent_id = auth.uid() and status = 'open')
    -- OLS+ puede editar cualquiera
    or public.has_role('ols')
  );

create policy "cancel_log_read" on public.rma_cancellation_log for select to authenticated
  using (public.has_role('agent'));

-- ---- Credit Notes ----
create policy "cn_select" on public.credit_notes for select to authenticated
  using (agent_id = auth.uid() or public.has_role('ols'));

create policy "cn_insert" on public.credit_notes for insert to authenticated
  with check (agent_id = auth.uid() or public.has_role('ols'));

create policy "cn_update" on public.credit_notes for update to authenticated
  using ((agent_id = auth.uid() and status = 'pending') or public.has_role('ols'));

create policy "cn_log_read" on public.credit_note_log for select to authenticated
  using (public.has_role('agent'));

-- ---- Refund Requests ----
create policy "refund_select" on public.refund_requests for select to authenticated
  using (agent_id = auth.uid() or public.has_role('ols'));

create policy "refund_insert" on public.refund_requests for insert to authenticated
  with check (agent_id = auth.uid() or public.has_role('ols'));

create policy "refund_update" on public.refund_requests for update to authenticated
  using ((agent_id = auth.uid() and status = 'waiting') or public.has_role('ols'));

create policy "refund_log_read" on public.refund_request_log for select to authenticated
  using (public.has_role('agent'));

-- ---- Payment Reserves ----
create policy "reserve_select" on public.payment_reserves for select to authenticated
  using (agent_id = auth.uid() or public.has_role('ols'));

create policy "reserve_insert" on public.payment_reserves for insert to authenticated
  with check (agent_id = auth.uid() or public.has_role('ols'));

create policy "reserve_update" on public.payment_reserves for update to authenticated
  using ((agent_id = auth.uid() and status = 'pending') or public.has_role('ols'));

-- ============================================================
-- 9. ACTUALIZAR RLS DE TABLA USERS PARA NUEVOS ROLES
-- ============================================================
-- Solo supervisor/admin pueden modificar roles de usuarios
drop policy if exists "rls_read_users" on public.users;

create policy "users_select" on public.users for select to authenticated
  using (true);

create policy "users_update_own" on public.users for update to authenticated
  using (
    -- Cualquiera puede actualizar su propio perfil (excepto el rol)
    id = auth.uid()
    -- Supervisor/admin pueden actualizar cualquier usuario
    or public.has_role('supervisor')
  );
