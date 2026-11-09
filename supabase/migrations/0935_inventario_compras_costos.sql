-- Portal AF4 360°: inventario y compras desde el lado financiero (Rentabilidad › Inventario, Reorden y Compras y costos).
--
-- 1. Ajustes (`fin_config`): días de inventario a partir de los cuales un producto está en sobrestock
--    (`inventario_sobrestock_dias`, 120), alza de costo entre compras que levanta una alerta
--    (`inventario_alerta_costo`, 0.10 = 10 %) y el punto de reorden (`inventario_reorden`: días de seguridad y de
--    cobertura de cada compra).
-- 2. `fin_compras_gastos`: los gastos de importación de una compra de Compras (flete, aduana, agente, seguro,
--    almacenaje, otros), con su fecha y si ya se pagaron. Con el monto de la compra (FOB) dan el costo puesto en bodega
--    real. Los que no se pagaron salen como egreso en la Proyección de caja en su fecha. No toca `wms_compras`.
-- 3. `fin_compras_presupuesto`: el presupuesto de compras de mercancía de cada mes (Panamá). Lo que queda sin
--    comprometer sale como egreso en la Proyección de caja.
-- 4. Tipo del libro «Merma y faltantes de inventario» (costo de ventas): el ajuste del mes que deja el conteo físico se
--    lleva al libro con ese tipo (un movimiento por mes, `origen_clave = 'merma-inventario:AAAA-MM'`), así entra al EERR
--    sin cambiar sus vistas. El bloqueo de los meses cerrados (0127) sigue mandando.
-- 5. Funciones de solo lectura (las llama el servidor):
--    · `fin_inventario_precio_referencia(pais, dias)`: el precio de venta promedio de cada producto (órdenes entregadas
--      de las tiendas con precio por línea y pedidos entregados de Dropi; sin ventas, el precio de lista de Dropi), para
--      proponer el descuento de liquidación del inventario muerto.
--    · `fin_merma_conteo(desde, pais)`: faltantes y sobrantes de los conteos físicos (ajustes del WMS con origen
--      «conteo») por mes y producto, valorizados al costo del lote o al vigente.
--    · `fin_anticipos_proveedores_al(corte)`: lo pagado a proveedores (y los gastos de importación pagados) de las
--      compras cuya mercancía todavía no llegó a esa fecha: un activo (anticipo) para el balance general.
--
-- RLS activado y sin políticas en lo nuevo (SEGURIDAD.md, migración 0063). Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Ajustes
-- ---------------------------------------------------------------------------------------------
insert into fin_config (clave, valor) values
  ('inventario_sobrestock_dias', '120'::jsonb),
  ('inventario_alerta_costo', '0.10'::jsonb),
  ('inventario_reorden', '{"seguridad": 14, "cobertura": 60}'::jsonb)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2. Gastos de importación de una compra
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_compras_gastos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references wms_compras(id) on delete cascade,
  concepto text not null check (concepto in ('flete', 'aduana', 'agente', 'seguro', 'almacenaje', 'otros')),
  monto numeric(14, 2) not null check (monto > 0 and monto < 10000000),
  -- Cuándo se pagó o se espera pagar.
  fecha date,
  pagado boolean not null default false,
  nota text check (nota is null or length(nota) <= 300),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists fin_compras_gastos_compra on fin_compras_gastos (compra_id);
create index if not exists fin_compras_gastos_pendientes on fin_compras_gastos (fecha) where not pagado;
alter table fin_compras_gastos enable row level security;

comment on table fin_compras_gastos is 'Portal AF4 360°: gastos de importación de una compra (flete, aduana, agente…) para su costo puesto en bodega.';

-- ---------------------------------------------------------------------------------------------
-- 3. Presupuesto de compras por mes
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_compras_presupuesto (
  mes date primary key check (extract(day from mes) = 1),
  monto numeric(14, 2) not null check (monto >= 0 and monto < 100000000),
  nota text check (nota is null or length(nota) <= 300),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table fin_compras_presupuesto enable row level security;

comment on table fin_compras_presupuesto is 'Portal AF4 360°: presupuesto de compras de mercancía por mes (Panamá); lo no comprometido entra a la proyección de caja.';

-- ---------------------------------------------------------------------------------------------
-- 4. Tipo del libro para la merma del conteo
-- ---------------------------------------------------------------------------------------------
insert into fin_tipos (nombre, seccion, signo, orden) values
  ('Merma y faltantes de inventario', 'costo_ventas', -1, 121)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 5. Funciones
-- ---------------------------------------------------------------------------------------------
create or replace function fin_inventario_precio_referencia(p_pais text default 'PA', p_dias integer default 365)
returns table (sku_maestro_id uuid, precio numeric, unidades numeric, fuente text)
language sql stable
set search_path = public
as $$
  with hoy as (select (now() at time zone 'America/Panama')::date as d),
  tiendas as (
    select coalesce(l.sku_maestro_id, cm.sku_maestro_id, cd.sku_maestro_id) as sku, l.cantidad, l.precio * l.cantidad as valor
    from ven_orden_lineas l
    join ven_ordenes o on o.id = l.orden_id
    left join ven_productos_mapeo mp on mp.producto_clave = l.producto_clave
    left join fin_costo_vigente cm on cm.producto_clave = mp.costo_clave
    left join fin_costo_vigente cd on cd.producto_clave = l.producto_clave
    where o.estado_entrega = 'entregada'
      and not l.es_servicio
      and l.precio is not null and l.precio > 0
      and coalesce(o.fecha_envio, o.fecha) > (select d from hoy) - p_dias
  ),
  dropi as (
    select pr.sku_maestro_id as sku, o.cantidad::numeric as cantidad, o.monto::numeric as valor
    from ordenes o
    join productos pr on pr.id = o.producto_id
    join paises pa on pa.id = o.pais_id
    where pa.codigo = p_pais
      and upper(o.estado) like 'ENTREGAD%'
      and o.cantidad > 0 and o.monto > 0
      and o.fecha > (select d from hoy) - p_dias
      and pr.sku_maestro_id is not null
  ),
  ventas as (
    select sku, sum(cantidad) as unidades, sum(valor) as valor
    from (select * from tiendas where sku is not null union all select * from dropi) t
    group by sku
  ),
  lista as (
    select pr.sku_maestro_id as sku, avg(pr.precio_actual) as precio
    from productos pr
    join paises pa on pa.id = pr.pais_id
    where pa.codigo = p_pais and pr.sku_maestro_id is not null and pr.precio_actual > 0
    group by pr.sku_maestro_id
  )
  select coalesce(v.sku, l.sku),
    round(coalesce(v.valor / nullif(v.unidades, 0), l.precio), 2),
    coalesce(v.unidades, 0),
    case when v.sku is not null then 'ventas' else 'lista' end
  from ventas v
  full join lista l on l.sku = v.sku
$$;

create or replace function fin_merma_conteo(p_desde date, p_pais text default 'PA')
returns table (
  mes date,
  sku_maestro_id uuid,
  codigo text,
  producto text,
  faltante numeric,
  sobrante numeric,
  valor_faltante numeric,
  valor_sobrante numeric,
  sin_costo boolean
)
language sql stable
set search_path = public
as $$
  with costo_sku as (
    select distinct on (v.sku_maestro_id) v.sku_maestro_id, v.costo_vigente
    from fin_costo_vigente v
    where v.sku_maestro_id is not null
    order by v.sku_maestro_id, v.fecha_llegada desc nulls last
  ),
  costo_lote as (
    select distinct on (l.wms_lote_id) l.wms_lote_id, l.costo_total
    from fin_costos_lotes l
    where l.wms_lote_id is not null
    order by l.wms_lote_id, l.fecha_llegada desc nulls last, l.creado_en desc
  ),
  movs as (
    select
      date_trunc('month', (w.creado_en at time zone 'America/Panama'))::date as mes,
      w.sku_maestro_id,
      w.lote_id,
      coalesce((w.cambios ->> 'fisico')::numeric, 0) as delta
    from wms_movimientos w
    join wms_bodegas b on b.id = w.bodega_id
    join paises p on p.id = b.pais_id
    where w.origen = 'conteo'
      and w.tipo = 'ajuste'
      and p.codigo = p_pais
      and (w.creado_en at time zone 'America/Panama')::date >= p_desde
  )
  select
    m.mes,
    m.sku_maestro_id,
    s.codigo,
    s.nombre,
    sum(greatest(-m.delta, 0)),
    sum(greatest(m.delta, 0)),
    round(sum(greatest(-m.delta, 0) * coalesce(cl.costo_total, cs.costo_vigente, 0)), 2),
    round(sum(greatest(m.delta, 0) * coalesce(cl.costo_total, cs.costo_vigente, 0)), 2),
    bool_or(coalesce(cl.costo_total, cs.costo_vigente) is null)
  from movs m
  join skus_maestros s on s.id = m.sku_maestro_id
  left join costo_lote cl on cl.wms_lote_id = m.lote_id
  left join costo_sku cs on cs.sku_maestro_id = m.sku_maestro_id
  group by m.mes, m.sku_maestro_id, s.codigo, s.nombre
$$;

-- Anticipos a proveedores a una fecha: compras de Panamá (no anuladas ni descartadas) cuya mercancía no había llegado
-- (sin fecha de llegada o posterior al corte; una compra completada sin fecha de llegada se da por llegada el día que se
-- cerró). El anticipo es lo pagado hasta el corte (cada pago cuenta si su fecha es anterior o no la tiene; sin pagos
-- parciales, lo pagado al proveedor) más los gastos de importación pagados hasta el corte.
create or replace function fin_anticipos_proveedores_al(p_corte date default null)
returns table (
  compra_id uuid,
  codigo text,
  nombre text,
  proveedor text,
  etapa text,
  monto_total numeric,
  pagado numeric,
  gastos_pagados numeric,
  anticipo numeric,
  fecha_envio date,
  fecha_llegada date
)
language sql stable
set search_path = public
as $$
  with c as (select coalesce(p_corte, (now() at time zone 'America/Panama')::date) as dia),
  compras as (
    select w.*,
      case
        when w.primer_pago is null and w.segundo_pago is null then coalesce(w.pagado_a_proveedor, 0)
        else
          (case when w.fecha_pago_1 is null or w.fecha_pago_1 <= (select dia from c) then coalesce(w.primer_pago, 0) else 0 end)
          + (case when w.fecha_pago_2 is null or w.fecha_pago_2 <= (select dia from c) then coalesce(w.segundo_pago, 0) else 0 end)
      end as pagos
    from wms_compras w
    join paises p on p.id = w.pais_id
    where p.codigo = 'PA'
      and w.tipo = 'pais'
      and w.anulada_en is null
      and w.etapa <> 'descartado'
      and (w.creado_en at time zone 'America/Panama')::date <= (select dia from c)
      and (w.fecha_llegada is null or w.fecha_llegada > (select dia from c))
      and not (
        w.fecha_llegada is null and w.etapa = 'completado'
        and coalesce((w.cerrado_en at time zone 'America/Panama')::date, (select dia from c)) <= (select dia from c)
      )
  ),
  gastos as (
    select g.compra_id, sum(g.monto) as monto
    from fin_compras_gastos g
    where g.pagado and (g.fecha is null or g.fecha <= (select dia from c))
    group by g.compra_id
  )
  select
    k.id,
    k.codigo,
    k.nombre,
    k.proveedor,
    k.etapa,
    k.monto_total,
    round(k.pagos, 2),
    round(coalesce(g.monto, 0), 2),
    round(k.pagos + coalesce(g.monto, 0), 2),
    k.fecha_envio,
    k.fecha_llegada
  from compras k
  left join gastos g on g.compra_id = k.id
  where k.pagos + coalesce(g.monto, 0) > 0
$$;

comment on function fin_anticipos_proveedores_al(date) is 'Portal AF4 360°: anticipos a proveedores (compras pagadas cuya mercancía no llegó) a una fecha, para el balance general.';
comment on function fin_merma_conteo(date, text) is 'Portal AF4 360°: faltantes y sobrantes de los conteos físicos por mes y producto, valorizados.';
comment on function fin_inventario_precio_referencia(text, integer) is 'Portal AF4 360°: precio de venta promedio por producto (ventas entregadas; sin ventas, precio de lista).';

revoke all on function fin_inventario_precio_referencia(text, integer) from public;
revoke all on function fin_merma_conteo(date, text) from public;
revoke all on function fin_anticipos_proveedores_al(date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_inventario_precio_referencia(text, integer) from anon, authenticated';
    execute 'revoke all on function fin_merma_conteo(date, text) from anon, authenticated';
    execute 'revoke all on function fin_anticipos_proveedores_al(date) from anon, authenticated';
  end if;
end $$;
