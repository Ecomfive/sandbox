-- 0275 · Quién vende cada producto en Dropi: pedidos ENTREGADOS por dropshipper (12 nov 2026, pedido de Alcides).
--
-- La ficha de una publicación de Gestión de IDs Dropi muestra, dentro de «Ventas del producto en Dropi», cómo se reparten las ventas
-- concretadas entre los usuarios de Dropi: solo los pedidos con estado ENTREGADO (no los que solo salieron ni los que van en camino).
-- Suma todos los IDs de Dropi que se le pasan (los del producto: activos, archivados, privados, de la B280…). Un pedido cuenta una vez
-- aunque traiga dos líneas del producto. El usuario de Dropi se junta con su dropshipper del CRM (`dropshipper_cuentas`); si no está
-- vinculado, sale solo con su usuario y su tienda (`dropshipper_id` null).
--
-- La fecha es la del pedido (en hora de Panamá, como la guarda `crm_sincronizar_ordenes`). Solo lee; se puede correr dos veces.
-- Reversa: supabase/rollbacks/0275_rollback.sql.

create index if not exists crm_ordenes_items_producto on crm_ordenes_items (producto_id);

drop function if exists crm_entregas_por_producto(uuid, bigint[], date);
create function crm_entregas_por_producto(p_pais uuid, p_ids bigint[], p_hoy date)
returns table (
  dropshipper_id uuid,
  dropshipper_nombre text,
  usuario_externo text,
  tienda_nombre text,
  entregados_30 bigint,
  entregados_90 bigint,
  entregados_total bigint,
  ultimo_entregado date
)
language sql stable as $$
  with entregados as (
    select distinct o.id, o.plataforma_id, o.usuario_externo, o.tienda_nombre, o.fecha::date as dia
    from crm_ordenes o
    join crm_ordenes_items i on i.orden_id = o.id
    where o.pais_id = p_pais
      and i.producto_id = any (p_ids)
      and crm_estado_grupo(o.estado) = 'entregado'
  ),
  con_dueno as (
    select e.*, c.dropshipper_id, d.nombre as dropshipper_nombre
    from entregados e
    left join dropshipper_cuentas c on c.plataforma_id = e.plataforma_id and c.pais_id = p_pais and c.id_externo = e.usuario_externo
    left join dropshippers d on d.id = c.dropshipper_id
  )
  select
    dropshipper_id,
    max(dropshipper_nombre),
    -- Sin dropshipper se agrupa por usuario; con dropshipper, sus usuarios van juntos y se muestra el más reciente.
    (array_agg(usuario_externo order by dia desc))[1],
    (array_agg(tienda_nombre order by dia desc) filter (where tienda_nombre is not null))[1],
    count(*) filter (where dia > p_hoy - 30),
    count(*) filter (where dia > p_hoy - 90),
    count(*),
    max(dia)
  from con_dueno
  group by dropshipper_id, case when dropshipper_id is null then usuario_externo end
  order by count(*) desc, max(dia) desc
$$;
