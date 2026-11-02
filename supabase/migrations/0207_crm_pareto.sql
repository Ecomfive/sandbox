-- CRM › Dirección › Pareto (31 oct 2026, pedido de Hernán): el principio 80/20 aplicado a los dropshippers (qué pocos hacen la mayoría de las guías) y a lo que
-- vende cada uno, con el historial de los últimos 12 meses. Dos consultas, solo lectura (sin tablas nuevas; RLS sin cambios, migración 0063):
--  * `crm_pedidos_mensuales(p_pais, p_meses)`: por dropshipper y mes (la fecha del pedido ya está en hora de Panamá), sus guías = pedidos de Dropi de sus cuentas vinculadas, sin cancelados.
--    De ahí salen el análisis ABC de la cartera, su posición, su curva y la gráfica mes a mes (src/lib/crm/pareto.ts).
--  * `crm_productos_de_dropshipper(p_pais, p_dropshipper, p_meses)`: los productos que pidió ese dropshipper en esos meses (pedidos por producto), para su
--    Pareto de productos. Un pedido con dos productos cuenta una vez en cada uno.
-- Los meses incluyen el actual (en curso). Se limitan a 24. Reversa: supabase/rollbacks/0207_rollback.sql

create or replace function crm_pedidos_mensuales(p_pais uuid, p_meses integer default 12)
returns table (dropshipper_id uuid, mes date, pedidos integer)
language sql stable as $$
  select c.dropshipper_id,
    date_trunc('month', o.fecha)::date,
    count(*)::integer
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  where o.pais_id = p_pais
    and crm_estado_grupo(o.estado) <> 'cancelado'
    and o.fecha >= date_trunc('month', now() at time zone 'America/Panama') - (greatest(1, least(p_meses, 24)) - 1) * interval '1 month'
  group by 1, 2
$$;

create or replace function crm_productos_de_dropshipper(p_pais uuid, p_dropshipper uuid, p_meses integer default 12)
returns table (producto_id bigint, producto text, pedidos integer)
language sql stable as $$
  select i.producto_id, max(i.producto), count(distinct o.id)::integer
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  join crm_ordenes_items i on i.orden_id = o.id
  where o.pais_id = p_pais
    and c.dropshipper_id = p_dropshipper
    and i.producto_id is not null
    and crm_estado_grupo(o.estado) <> 'cancelado'
    and o.fecha >= date_trunc('month', now() at time zone 'America/Panama') - (greatest(1, least(p_meses, 24)) - 1) * interval '1 month'
  group by i.producto_id
$$;
