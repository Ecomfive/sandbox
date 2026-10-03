-- CRM de dropshippers: cuentas de plataforma vinculadas y pedidos por dropshipper.
--
-- Cada pedido de Dropi trae el usuario que lo vendió (`user_id`) y su tienda (`shop`). Desde la ficha se vincula, a mano,
-- el dropshipper con su usuario de Dropi (más adelante Boxful o EFI); así se sabe cuántas guías salieron de cada uno,
-- cuántas se entregaron y qué productos vendió, en el período que se elija.
--
-- * dropshipper_cuentas: el vínculo (dropshipper ↔ usuario de una plataforma en un país). Un usuario pertenece a un solo
--   dropshipper; un dropshipper puede tener varios usuarios.
-- * crm_ordenes / crm_ordenes_items: los pedidos de la plataforma, normalizados desde `staging_ordenes_dropi`
--   (`crm_sincronizar_ordenes()` los actualiza; se puede correr las veces que haga falta).
-- * crm_desempeno / crm_productos_vendidos / crm_usuarios_plataforma: lo que lee la ficha.
-- * La vista `crm_dropshippers_resumen` suma además los pedidos de la plataforma vinculados.
--
-- Despachado = el pedido ya salió de la bodega (en reparto, en tránsito, novedad, entregado, devolución…).
-- Tasa de entrega = entregados ÷ despachados.
--
-- Las tablas nuevas llevan RLS y ninguna política: solo el servidor las toca (ver migración 0063 y SEGURIDAD.md).
-- Las funciones son `security invoker`: sin política, quien no sea el servidor no obtiene filas.

create table if not exists dropshipper_cuentas (
  id uuid primary key default gen_random_uuid(),
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  plataforma_id uuid not null references plataformas(id),
  pais_id uuid not null references paises(id),
  id_externo text not null,
  tienda_nombre text,
  creado_en timestamptz not null default now(),
  -- Un usuario de la plataforma pertenece a un solo dropshipper.
  unique (plataforma_id, pais_id, id_externo)
);
create index if not exists dropshipper_cuentas_ds on dropshipper_cuentas (dropshipper_id);

create table if not exists crm_ordenes (
  id uuid primary key default gen_random_uuid(),
  plataforma_id uuid not null references plataformas(id),
  pais_id uuid not null references paises(id),
  orden_externa bigint not null,
  usuario_externo text,
  tienda_externa text,
  tienda_nombre text,
  estado text not null,
  fecha timestamp not null,
  total numeric(14, 2) not null default 0,
  transportadora text,
  actualizado_en timestamptz not null default now(),
  unique (plataforma_id, pais_id, orden_externa)
);
create index if not exists crm_ordenes_usuario on crm_ordenes (plataforma_id, pais_id, usuario_externo, fecha desc);

create table if not exists crm_ordenes_items (
  orden_id uuid not null references crm_ordenes(id) on delete cascade,
  linea integer not null,
  producto text,
  sku text,
  precio numeric(14, 2),
  primary key (orden_id, linea)
);

alter table dropshipper_cuentas enable row level security;
alter table crm_ordenes enable row level security;
alter table crm_ordenes_items enable row level security;

-- Grupo de un estado de Dropi: cancelado, devuelto, entregado, despachado (salió de bodega sin entregarse ni
-- devolverse) o pendiente (todavía en la bodega o sin guía). Un estado nuevo que no se reconoce cuenta como pendiente.
create or replace function crm_estado_grupo(p_estado text) returns text
language sql immutable as $$
  select case
    when upper(coalesce(p_estado, '')) like 'CANCELADO%' then 'cancelado'
    when upper(coalesce(p_estado, '')) like '%DEVOLUCION%' then 'devuelto'
    when upper(coalesce(p_estado, '')) = 'ENTREGADO' then 'entregado'
    when upper(coalesce(p_estado, '')) in ('EN REPARTO', 'EN TRANSITO', 'BODEGA DESTINO', 'NOVEDAD', 'NOVEDAD SOLUCIONADA') then 'despachado'
    else 'pendiente'
  end
$$;

-- Pasa los pedidos de Dropi guardados en bruto a `crm_ordenes` y `crm_ordenes_items`. De cada pedido queda la versión
-- más reciente. Devuelve cuántos pedidos tocó.
create or replace function crm_sincronizar_ordenes() returns integer
language plpgsql as $$
declare
  tocados integer;
begin
  create temp table crm_tmp_ult on commit drop as
  select distinct on (c.pais_id, (s.payload ->> 'id')::bigint)
    c.pais_id, c.plataforma_id, (s.payload ->> 'id')::bigint as orden_externa, s.payload
  from staging_ordenes_dropi s
  join cuentas_extraccion c on c.id = s.cuenta_extraccion_id
  where s.payload ->> 'id' ~ '^\d+$' and c.pais_id is not null
  order by c.pais_id, (s.payload ->> 'id')::bigint, s.creado_en desc;

  insert into crm_ordenes (plataforma_id, pais_id, orden_externa, usuario_externo, tienda_externa, tienda_nombre, estado, fecha, total, transportadora)
  select plataforma_id, pais_id, orden_externa,
    payload ->> 'user_id', payload ->> 'shop_id', payload -> 'shop' ->> 'name',
    coalesce(payload ->> 'status', ''), (payload ->> 'created_at')::timestamp,
    coalesce((payload ->> 'total_order')::numeric, 0), payload ->> 'shipping_company'
  from crm_tmp_ult
  where payload ->> 'created_at' is not null
  on conflict (plataforma_id, pais_id, orden_externa) do update set
    usuario_externo = excluded.usuario_externo, tienda_externa = excluded.tienda_externa,
    tienda_nombre = excluded.tienda_nombre, estado = excluded.estado, fecha = excluded.fecha,
    total = excluded.total, transportadora = excluded.transportadora, actualizado_en = now();
  get diagnostics tocados = row_count;

  insert into crm_ordenes_items (orden_id, linea, producto, sku, precio)
  select o.id, d.linea::integer, d.item -> 'product' ->> 'name', d.item -> 'product' ->> 'sku',
    (d.item -> 'product' ->> 'sale_price')::numeric
  from crm_tmp_ult u
  join crm_ordenes o on o.plataforma_id = u.plataforma_id and o.pais_id = u.pais_id and o.orden_externa = u.orden_externa
  cross join lateral jsonb_array_elements(coalesce(u.payload -> 'orderdetails', '[]'::jsonb)) with ordinality as d(item, linea)
  on conflict (orden_id, linea) do update set producto = excluded.producto, sku = excluded.sku, precio = excluded.precio;

  return tocados;
end;
$$;

-- Desempeño de un dropshipper en un período, por país (cada país tiene su moneda, no se suman).
create or replace function crm_desempeno(p_dropshipper uuid, p_desde date, p_hasta date)
returns table (pais_id uuid, pedidos bigint, despachados bigint, entregados bigint, devueltos bigint, cancelados bigint, con_novedad bigint, ventas numeric)
language sql stable as $$
  select o.pais_id,
    count(*),
    count(*) filter (where crm_estado_grupo(o.estado) in ('despachado', 'entregado', 'devuelto')),
    count(*) filter (where crm_estado_grupo(o.estado) = 'entregado'),
    count(*) filter (where crm_estado_grupo(o.estado) = 'devuelto'),
    count(*) filter (where crm_estado_grupo(o.estado) = 'cancelado'),
    count(*) filter (where upper(o.estado) = 'NOVEDAD'),
    coalesce(sum(o.total) filter (where crm_estado_grupo(o.estado) = 'entregado'), 0)
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  where c.dropshipper_id = p_dropshipper and o.fecha::date between p_desde and p_hasta
  group by o.pais_id
$$;

-- Productos que vendió un dropshipper en un período (cada línea del pedido cuenta como una unidad).
create or replace function crm_productos_vendidos(p_dropshipper uuid, p_desde date, p_hasta date)
returns table (producto text, sku text, unidades bigint, entregadas bigint)
language sql stable as $$
  select coalesce(i.producto, '(sin nombre)'), max(i.sku), count(*),
    count(*) filter (where crm_estado_grupo(o.estado) = 'entregado')
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  join crm_ordenes_items i on i.orden_id = o.id
  where c.dropshipper_id = p_dropshipper and o.fecha::date between p_desde and p_hasta
    and crm_estado_grupo(o.estado) <> 'cancelado'
  group by coalesce(i.producto, '(sin nombre)')
  order by count(*) desc
  limit 20
$$;

-- Usuarios de una plataforma con pedidos, para elegir a cuál vincular un dropshipper. Muestra de quién es cada uno.
create or replace function crm_usuarios_plataforma(p_plataforma uuid, p_pais uuid)
returns table (id_externo text, tienda_nombre text, pedidos bigint, ultimo_pedido date, dropshipper_id uuid, dropshipper_nombre text)
language sql stable as $$
  select o.usuario_externo,
    (array_agg(o.tienda_nombre order by o.fecha desc) filter (where o.tienda_nombre is not null))[1],
    count(*), max(o.fecha)::date, c.dropshipper_id, d.nombre
  from crm_ordenes o
  left join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  left join dropshippers d on d.id = c.dropshipper_id
  where o.plataforma_id = p_plataforma and o.pais_id = p_pais and o.usuario_externo is not null
  group by o.usuario_externo, c.dropshipper_id, d.nombre
  order by count(*) desc
$$;

-- El resumen del directorio suma, además de los pedidos cargados a mano, los de la plataforma vinculados.
create or replace view crm_dropshippers_resumen
with (security_invoker = true) as
select
  dp.dropshipper_id as id,
  dp.pais_id,
  coalesce(p.pedidos_mes, 0) + coalesce(x.pedidos_mes, 0) as pedidos_mes,
  coalesce(p.ventas_mes, 0) + coalesce(x.ventas_mes, 0) as ventas_mes,
  greatest(p.ultimo_pedido, x.ultimo_pedido) as ultimo_pedido,
  coalesce(c.casos_abiertos, 0) as casos_abiertos
from dropshipper_paises dp
left join (
  select
    dropshipper_id,
    pais_id,
    count(*) filter (where fecha >= date_trunc('month', current_date) and estado <> 'cancelado') as pedidos_mes,
    coalesce(sum(monto) filter (where fecha >= date_trunc('month', current_date) and estado not in ('cancelado', 'devuelto')), 0) as ventas_mes,
    max(fecha) filter (where estado <> 'cancelado') as ultimo_pedido
  from pedidos_dropshipper
  group by dropshipper_id, pais_id
) p on p.dropshipper_id = dp.dropshipper_id and p.pais_id = dp.pais_id
left join (
  select
    c.dropshipper_id,
    o.pais_id,
    count(*) filter (where o.fecha >= date_trunc('month', current_date) and crm_estado_grupo(o.estado) <> 'cancelado') as pedidos_mes,
    coalesce(sum(o.total) filter (where o.fecha >= date_trunc('month', current_date) and crm_estado_grupo(o.estado) in ('despachado', 'entregado')), 0) as ventas_mes,
    (max(o.fecha) filter (where crm_estado_grupo(o.estado) <> 'cancelado'))::date as ultimo_pedido
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  group by c.dropshipper_id, o.pais_id
) x on x.dropshipper_id = dp.dropshipper_id and x.pais_id = dp.pais_id
left join (
  select dropshipper_id, pais_id, count(*) as casos_abiertos
  from casos_dropshipper
  where estado <> 'resuelto'
  group by dropshipper_id, pais_id
) c on c.dropshipper_id = dp.dropshipper_id and c.pais_id = dp.pais_id;

-- Carga inicial con lo que ya se extrajo.
select crm_sincronizar_ordenes();
