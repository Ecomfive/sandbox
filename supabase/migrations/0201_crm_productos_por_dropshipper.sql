-- CRM › Dirección, fase 3 (30 oct 2026, pedido de Hernán: vender más). Qué productos vende cada dropshipper.
-- **Va después de la 0198** (PR #440, pedido de Alcides): esa guarda el ID de Dropi de cada línea del pedido (`crm_ordenes_items.producto_id`),
-- hace que `crm_sincronizar_ordenes` lo llene y lo completa en los pedidos que ya estaban. Esta solo agrega:
--  * un índice por `producto_id`;
--  * `crm_productos_por_dropshipper(p_pais, p_dias)`: por dropshipper y producto, los pedidos de los últimos `p_dias` días (sin cancelados).
-- Con eso el panel cruza el stock y lo que viene en camino de cada producto (Compras) con quién lo vende. RLS sin cambios (migración 0063).
-- Reversa: supabase/rollbacks/0201_rollback.sql

-- Por si se corre antes que la 0198: la columna queda vacía hasta que la 0198 cambie la sincronización.
alter table crm_ordenes_items add column if not exists producto_id bigint;
create index if not exists crm_ordenes_items_producto on crm_ordenes_items (producto_id);

create or replace function crm_productos_por_dropshipper(p_pais uuid, p_dias integer default 30)
returns table (dropshipper_id uuid, producto_id bigint, producto text, pedidos integer)
language sql stable as $$
  select c.dropshipper_id, i.producto_id, max(i.producto), count(distinct o.id)::integer
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  join crm_ordenes_items i on i.orden_id = o.id
  where o.pais_id = p_pais
    and i.producto_id is not null
    and crm_estado_grupo(o.estado) <> 'cancelado'
    and o.fecha >= (now() at time zone 'America/Panama') - greatest(1, least(p_dias, 180)) * interval '1 day'
  group by c.dropshipper_id, i.producto_id
$$;
