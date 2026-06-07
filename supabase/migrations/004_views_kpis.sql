-- ============================================================
-- MIGRACIÓN 004 — Vistas y KPIs del sistema BO
-- ============================================================

-- ============================================================
-- 1. VISTA UNIFICADA — todos los módulos en una sola vista
-- Útil para el dashboard del supervisor y reportes globales
-- ============================================================
create or replace view public.bo_unified_dashboard as

  -- RMA Cancellations
  select
    'cancellation'                      as module,
    c.id,
    c.country,
    c.date_logged,
    c.case_number,
    c.order_number,
    c.rma_number                        as reference_number,
    null::numeric                       as amount,
    c.reason,
    c.status,
    c.sla_status,
    c.aging_days,
    c.in_time,
    c.agent_id,
    u.full_name                         as agent_name,
    c.ols_id,
    ols.full_name                       as ols_name,
    c.date_ols_actioned,
    c.month,
    c.created_at,
    c.updated_at
  from public.rma_cancellations c
  left join public.users u   on u.id = c.agent_id
  left join public.users ols on ols.id = c.ols_id

  union all

  -- Credit Notes
  select
    'credit_note'                       as module,
    cn.id,
    cn.country,
    cn.date_logged,
    cn.case_number,
    cn.order_number,
    cn.cr_number                        as reference_number,
    cn.amount_to_refund                 as amount,
    cn.reason,
    cn.status,
    cn.sla_status,
    cn.aging_days,
    cn.in_time,
    cn.agent_id,
    u.full_name                         as agent_name,
    cn.ols_id,
    ols.full_name                       as ols_name,
    cn.date_ols_actioned,
    cn.month,
    cn.created_at,
    cn.updated_at
  from public.credit_notes cn
  left join public.users u   on u.id = cn.agent_id
  left join public.users ols on ols.id = cn.ols_id

  union all

  -- Refund Requests
  select
    'refund'                            as module,
    r.id,
    r.country,
    r.date_logged,
    r.case_number,
    r.order_number,
    r.rma_number                        as reference_number,
    r.amount_to_refund                  as amount,
    r.reason,
    r.status,
    r.sla_status,
    r.aging_days,
    r.in_time,
    r.agent_id,
    u.full_name                         as agent_name,
    r.ols_id,
    ols.full_name                       as ols_name,
    r.date_ols_actioned,
    r.month,
    r.created_at,
    r.updated_at
  from public.refund_requests r
  left join public.users u   on u.id = r.agent_id
  left join public.users ols on ols.id = r.ols_id;

-- ============================================================
-- 2. FUNCIÓN: KPIs por módulo y período
-- Retorna métricas clave para el dashboard
-- ============================================================
create or replace function public.get_bo_kpis(
  p_month     date    default date_trunc('month', current_date),
  p_country   text    default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  select jsonb_build_object(

    -- ---- RMA Cancellations ----
    'cancellations', jsonb_build_object(
      'total',      (select count(*) from rma_cancellations
                     where (p_country is null or country = p_country)
                       and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'open',       (select count(*) from rma_cancellations
                     where status = 'open'
                       and (p_country is null or country = p_country)),
      'completed',  (select count(*) from rma_cancellations
                     where status = 'completed'
                       and (p_country is null or country = p_country)
                       and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'in_time_pct',(select round(
                       100.0 * count(*) filter (where in_time = true)
                       / nullif(count(*) filter (where in_time is not null), 0), 1
                     ) from rma_cancellations
                     where (p_country is null or country = p_country)
                       and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'avg_aging',  (select round(avg(aging_days)::numeric, 1) from rma_cancellations
                     where (p_country is null or country = p_country)
                       and status = 'open'),
      'red_cases',  (select count(*) from rma_cancellations
                     where sla_status = 'C_red' and status = 'open'
                       and (p_country is null or country = p_country))
    ),

    -- ---- Credit Notes ----
    'credit_notes', jsonb_build_object(
      'total',      (select count(*) from credit_notes
                     where (p_country is null or country = p_country)
                       and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'pending',    (select count(*) from credit_notes
                     where status = 'pending'
                       and (p_country is null or country = p_country)),
      'total_amount',(select coalesce(sum(amount_to_refund), 0) from credit_notes
                     where (p_country is null or country = p_country)
                       and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'in_time_pct',(select round(
                       100.0 * count(*) filter (where in_time = true)
                       / nullif(count(*) filter (where in_time is not null), 0), 1
                     ) from credit_notes
                     where (p_country is null or country = p_country)
                       and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'avg_aging',  (select round(avg(aging_days)::numeric, 1) from credit_notes
                     where status = 'pending'
                       and (p_country is null or country = p_country))
    ),

    -- ---- Refunds ----
    'refunds', jsonb_build_object(
      'total',        (select count(*) from refund_requests
                       where (p_country is null or country = p_country)
                         and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'waiting',      (select count(*) from refund_requests
                       where status = 'waiting'
                         and (p_country is null or country = p_country)),
      'total_amount', (select coalesce(sum(amount_to_refund), 0) from refund_requests
                       where (p_country is null or country = p_country)
                         and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'in_time_pct',  (select round(
                         100.0 * count(*) filter (where in_time = true)
                         / nullif(count(*) filter (where in_time is not null), 0), 1
                       ) from refund_requests
                       where (p_country is null or country = p_country)
                         and (p_month  is null or date_trunc('month', date_logged) = p_month)),
      'avg_aging',    (select round(avg(aging_days)::numeric, 1) from refund_requests
                       where status = 'waiting'
                         and (p_country is null or country = p_country)),
      'red_cases',    (select count(*) from refund_requests
                       where sla_status = 'C_red' and status != 'refunded'
                         and (p_country is null or country = p_country))
    ),

    -- ---- Meta SLA global (80% adherencia) ----
    'sla_global', jsonb_build_object(
      'target_pct', 80,
      'achieved_pct', (
        select round(
          100.0 * sum(it_count) / nullif(sum(total_count), 0), 1
        )
        from (
          select
            count(*) filter (where in_time = true) as it_count,
            count(*) filter (where in_time is not null) as total_count
          from rma_cancellations
          where (p_country is null or country = p_country)
            and (p_month is null or date_trunc('month', date_logged) = p_month)
          union all
          select
            count(*) filter (where in_time = true),
            count(*) filter (where in_time is not null)
          from credit_notes
          where (p_country is null or country = p_country)
            and (p_month is null or date_trunc('month', date_logged) = p_month)
          union all
          select
            count(*) filter (where in_time = true),
            count(*) filter (where in_time is not null)
          from refund_requests
          where (p_country is null or country = p_country)
            and (p_month is null or date_trunc('month', date_logged) = p_month)
        ) sub
      )
    )

  ) into result;

  return result;
end;
$$;

-- ============================================================
-- 3. FUNCIÓN: Performance por agente
-- ============================================================
create or replace function public.get_agent_performance(
  p_month   date default date_trunc('month', current_date),
  p_country text default null
)
returns table (
  agent_id        uuid,
  agent_name      text,
  total_cases     bigint,
  completed_cases bigint,
  in_time_cases   bigint,
  in_time_pct     numeric,
  avg_aging       numeric,
  red_cases       bigint
)
language sql security definer stable set search_path = public as $$
  select
    u.id                                              as agent_id,
    u.full_name                                       as agent_name,
    count(*)                                          as total_cases,
    count(*) filter (where d.status in ('completed','refunded','closed')) as completed_cases,
    count(*) filter (where d.in_time = true)          as in_time_cases,
    round(
      100.0 * count(*) filter (where d.in_time = true)
      / nullif(count(*) filter (where d.in_time is not null), 0), 1
    )                                                 as in_time_pct,
    round(avg(d.aging_days)::numeric, 1)              as avg_aging,
    count(*) filter (where d.sla_status = 'C_red')   as red_cases
  from public.bo_unified_dashboard d
  join public.users u on u.id = d.agent_id
  where (p_country is null or d.country = p_country)
    and (p_month   is null or date_trunc('month', d.date_logged) = p_month)
  group by u.id, u.full_name
  order by in_time_pct desc nulls last;
$$;

-- ============================================================
-- 4. FUNCIÓN: Casos críticos (SLA rojo, sin acción OLS)
-- Usada para alertas automáticas en n8n
-- ============================================================
create or replace function public.get_critical_cases()
returns table (
  module          text,
  id              uuid,
  country         text,
  case_number     text,
  agent_name      text,
  aging_days      int,
  date_logged     date,
  status          text
)
language sql security definer stable set search_path = public as $$
  select module, id, country, case_number, agent_name, aging_days, date_logged, status
  from public.bo_unified_dashboard
  where sla_status = 'C_red'
    and status not in ('completed', 'refunded', 'cancelled', 'closed')
  order by aging_days desc;
$$;

-- ============================================================
-- 5. FUNCIÓN: Actualización diaria de aging (para cron/n8n)
-- Llamar cada día hábil vía n8n workflow
-- ============================================================
create or replace function public.refresh_aging_daily()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- RMA Cancellations abiertas
  update public.rma_cancellations
  set aging_days = (current_date - date_logged)::integer
  where status = 'open' and date_ols_actioned is null;

  -- Credit Notes pendientes
  update public.credit_notes
  set aging_days = (current_date - date_logged)::integer
  where status in ('pending', 'in_sap') and date_ols_actioned is null;

  -- Refunds en espera
  update public.refund_requests
  set aging_days = (current_date - date_logged)::integer
  where status in ('waiting', 'in_process') and date_ols_actioned is null;
end;
$$;
