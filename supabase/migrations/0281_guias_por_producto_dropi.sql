-- Gestión de IDs Dropi › tarjeta «Pareto de publicaciones» (12 nov 2026, pedido de Hernán: el 20 % de las publicaciones que trae el 80 % de las guías).
-- Una consulta, solo lectura (sin tablas nuevas; RLS sin cambios):
--  * `dropi_guias_por_producto(p_pais, p_meses)`: por ID de producto de Dropi y mes, sus guías = pedidos de Dropi sin cancelados que lo traen (un pedido con
--    dos productos cuenta una vez en cada uno), y aparte las de los últimos 30 días (por día, hora de Panamá). Cuenta **todos** los pedidos, no solo los de
--    dropshippers vinculados en el CRM (a diferencia de `crm_pedidos_mensuales`, 0207). La app suma los IDs de cada publicación.
-- Los meses incluyen el actual (en curso). Se limitan a 24. Reversa: supabase/rollbacks/0281_rollback.sql

create or replace function dropi_guias_por_producto(p_pais uuid, p_meses integer default 12)
returns table (producto_id bigint, mes date, pedidos integer, pedidos_30 integer)
language sql stable as $$
  select i.producto_id,
    date_trunc('month', o.fecha)::date,
    count(distinct o.id)::integer,
    (count(distinct o.id) filter (where o.fecha::date > (now() at time zone 'America/Panama')::date - 30))::integer
  from crm_ordenes o
  join crm_ordenes_items i on i.orden_id = o.id
  where o.pais_id = p_pais
    and i.producto_id is not null
    and crm_estado_grupo(o.estado) <> 'cancelado'
    and o.fecha >= least(
      date_trunc('month', now() at time zone 'America/Panama') - (greatest(1, least(p_meses, 24)) - 1) * interval '1 month',
      (now() at time zone 'America/Panama')::date - 30
    )
  group by 1, 2
$$;
