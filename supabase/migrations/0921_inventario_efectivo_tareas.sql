-- Portal AF4 360°: inventario valorizado, efectivo de repartidores desde las órdenes y tareas programadas diarias.
--
-- 1. Inventario valorizado (/rentabilidad/inventario). `fin_inventario_valorizado`: el stock físico del WMS (0069, por
--    producto y bodega; un producto con vencimiento, por lote: 0073) por su costo unitario. El costo de un lote es el del
--    lote de Costos de mercancía ligado a él (`fin_costos_lotes.wms_lote_id`, nuevo) y, si no hay, el costo vigente del
--    producto (`fin_costo_vigente` por `sku_maestro_id`, 0121). Sin costo: `sin_costo` y valor 0. También trae la última
--    salida de esa bodega (`wms_movimientos`) para el lento movimiento.
--    `fin_inventario_vendido(dias)`: unidades y costo de lo vendido en los últimos N días por producto (órdenes entregadas
--    de las tiendas, 0122, y pedidos entregados de Dropi), para la rotación y el DIO por producto.
--    `fin_capital_trabajo_al` (0128) pasa a valorizar el inventario con la vista (el DIO de Capital de trabajo) y a contar
--    como efectivo de repartidores sin rendir solo lo que el banco todavía no muestra (ver 2).
-- 2. Efectivo de repartidores desde las órdenes. El Excel de deliverys no trae lo cobrado contra entrega: sale de las
--    órdenes ENTREGADAS de Ventas por tienda pagadas en efectivo, por el transportista de la orden. `del_transportistas`
--    une cada transportista (tal como viene en la orden) con su repartidor; la llena la tarea diaria (por nombre y alias,
--    `src/lib/deliverys/efectivo.ts`) y se puede corregir a mano (`a_mano`). `del_efectivo_ordenes` = esas órdenes con su
--    semana (jueves a miércoles, por la fecha de envío). `del_semanas` y `conc_delivery_tiendas` (0124, 0129) toman ese
--    efectivo, SALVO que la semana tenga lo cobrado cargado a mano en sus entregas (`del_entregas.cobrado`): entonces manda
--    lo de las entregas, como antes. Una semana cerrada guarda lo que quedó (0124), así que no cambia.
-- 3. Tareas programadas. `fin_tareas_ejecuciones`: cada ejecución (tarea, inicio, fin, ok, resumen, error, cursor para
--    seguir donde quedó). `fin_alertas`: lo que la tarea de alertas encontró (una por `clave`: volver a correr no duplica;
--    lo que deja de pasar queda `resuelta_en`). `fin_config` suma `inventario_tasa_mantener` (0.20) y `caja_minima` (0).
--
-- RLS activado y sin políticas en lo nuevo (SEGURIDAD.md, migración 0063); vistas con `security_invoker = true`; las
-- funciones solo las llama el servidor. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Inventario valorizado
-- ---------------------------------------------------------------------------------------------
alter table fin_costos_lotes add column if not exists wms_lote_id uuid references wms_lotes(id) on delete set null;
create index if not exists fin_costos_lotes_wms_lote on fin_costos_lotes (wms_lote_id) where wms_lote_id is not null;
create index if not exists fin_costos_lotes_sku on fin_costos_lotes (sku_maestro_id) where sku_maestro_id is not null;
create index if not exists wms_movimientos_salidas on wms_movimientos (sku_maestro_id, bodega_id, creado_en desc) where tipo = 'salida';

insert into fin_config (clave, valor) values
  ('inventario_tasa_mantener', '0.20'::jsonb),
  ('caja_minima', '0'::jsonb)
on conflict (clave) do nothing;

create or replace view fin_inventario_valorizado
with (security_invoker = true) as
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
por_lote as (
  select sl.bodega_id, l.sku_maestro_id, sl.lote_id, l.codigo as lote, l.fecha_vencimiento, sl.cantidad::numeric as unidades
  from wms_stock_lote sl
  join wms_lotes l on l.id = sl.lote_id
  where sl.cantidad <> 0
),
lotes_bodega as (
  select bodega_id, sku_maestro_id, sum(unidades) as unidades
  from por_lote
  group by 1, 2
),
-- Lo que no está en ningún lote (los productos sin vencimiento, o lo que quedó suelto).
suelto as (
  select s.bodega_id, s.sku_maestro_id, null::uuid as lote_id, null::text as lote, null::date as fecha_vencimiento,
    (s.fisico - coalesce(lb.unidades, 0))::numeric as unidades
  from wms_stock s
  left join lotes_bodega lb on lb.bodega_id = s.bodega_id and lb.sku_maestro_id = s.sku_maestro_id
  where s.fisico - coalesce(lb.unidades, 0) <> 0
),
filas as (
  select * from por_lote
  union all
  select * from suelto
)
select
  b.pais_id,
  p.codigo as pais,
  f.bodega_id,
  b.nombre as bodega,
  b.tipo as bodega_tipo,
  f.sku_maestro_id,
  m.codigo,
  m.nombre as producto,
  f.lote_id,
  f.lote,
  f.fecha_vencimiento,
  f.unidades,
  coalesce(cl.costo_total, cs.costo_vigente)::numeric(14, 6) as costo_unitario,
  case when cl.costo_total is not null then 'lote' when cs.costo_vigente is not null then 'vigente' end as costo_fuente,
  round(greatest(f.unidades, 0) * coalesce(cl.costo_total, cs.costo_vigente, 0), 2) as valor,
  (coalesce(cl.costo_total, cs.costo_vigente) is null) as sin_costo,
  us.ultima_salida
from filas f
join wms_bodegas b on b.id = f.bodega_id
left join paises p on p.id = b.pais_id
join skus_maestros m on m.id = f.sku_maestro_id
left join costo_lote cl on cl.wms_lote_id = f.lote_id
left join costo_sku cs on cs.sku_maestro_id = f.sku_maestro_id
left join lateral (
  select (max(w.creado_en) at time zone 'America/Panama')::date as ultima_salida
  from wms_movimientos w
  where w.sku_maestro_id = f.sku_maestro_id and w.bodega_id = f.bodega_id and w.tipo = 'salida'
) us on true;

comment on view fin_inventario_valorizado is 'Portal AF4 360°: stock físico del WMS por producto, bodega y lote, valorizado al costo del lote o al costo vigente.';

-- Lo vendido en los últimos `p_dias` días por producto (Panamá): órdenes entregadas de las tiendas (por su fecha de envío)
-- y pedidos entregados de Dropi. Unidades y costo al costo vigente (sin costo vigente, el de la Matriz en las tiendas).
create or replace function fin_inventario_vendido(p_dias integer default 90, p_pais text default 'PA')
returns table (sku_maestro_id uuid, unidades numeric, costo numeric, sin_costo boolean)
language sql stable
set search_path = public
as $$
  with hoy as (select (now() at time zone 'America/Panama')::date as d),
  costo_sku as (
    select distinct on (v.sku_maestro_id) v.sku_maestro_id, v.costo_vigente
    from fin_costo_vigente v
    where v.sku_maestro_id is not null
    order by v.sku_maestro_id, v.fecha_llegada desc nulls last
  ),
  tiendas as (
    select
      coalesce(l.sku_maestro_id, cm.sku_maestro_id, cd.sku_maestro_id) as sku,
      l.cantidad,
      l.costo_excel
    from ven_orden_lineas l
    join ven_ordenes o on o.id = l.orden_id
    left join ven_productos_mapeo mp on mp.producto_clave = l.producto_clave
    left join fin_costo_vigente cm on cm.producto_clave = mp.costo_clave
    left join fin_costo_vigente cd on cd.producto_clave = l.producto_clave
    where o.estado_entrega = 'entregada'
      and not l.es_servicio
      and coalesce(o.fecha_envio, o.fecha) > (select d from hoy) - p_dias
      and coalesce(o.fecha_envio, o.fecha) <= (select d from hoy)
  ),
  dropi as (
    select pr.sku_maestro_id as sku, o.cantidad::numeric as cantidad, null::numeric as costo_excel
    from ordenes o
    join productos pr on pr.id = o.producto_id
    join paises pa on pa.id = o.pais_id
    where pa.codigo = p_pais
      and upper(o.estado) like 'ENTREGAD%'
      and o.fecha > (select d from hoy) - p_dias
      and o.fecha <= (select d from hoy)
      and pr.sku_maestro_id is not null
  ),
  todo as (
    select * from tiendas where sku is not null
    union all
    select * from dropi
  )
  select
    t.sku,
    sum(t.cantidad),
    round(sum(coalesce(c.costo_vigente * t.cantidad, t.costo_excel, 0)), 2),
    bool_or(c.costo_vigente is null and t.costo_excel is null)
  from todo t
  left join costo_sku c on c.sku_maestro_id = t.sku
  group by t.sku
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Efectivo de repartidores desde las órdenes
-- ---------------------------------------------------------------------------------------------
create table if not exists del_transportistas (
  -- Tal como viene en `ven_ordenes.transportista`.
  transportista text primary key check (length(btrim(transportista)) > 0),
  -- null = no es un repartidor propio (Servientrega, la oficina) o no se reconoció.
  repartidor_id uuid references del_repartidores(id) on delete set null,
  -- Lo puso una persona: la tarea diaria no lo cambia.
  a_mano boolean not null default false,
  actualizado_en timestamptz not null default now()
);
alter table del_transportistas enable row level security;

alter table del_cierres add column if not exists efectivo_origen text check (efectivo_origen is null or efectivo_origen in ('ordenes', 'manual', 'ninguno'));
-- Las órdenes que sumaron el efectivo al cerrar: [{orden, tienda, fecha, monto}].
alter table del_cierres add column if not exists efectivo_ordenes jsonb;

create index if not exists ven_ordenes_transportista on ven_ordenes (transportista) where estado_entrega = 'entregada';

-- Los transportistas de las órdenes entregadas, con cuántas llevaron y cuánto cobraron en efectivo (para unirlos con su
-- repartidor y ver lo que queda sin unir).
create or replace view del_transportistas_vistos
with (security_invoker = true) as
select
  o.transportista,
  count(*)::integer as ordenes,
  count(*) filter (where o.metodo_pago = 'efectivo')::integer as ordenes_efectivo,
  coalesce(sum(o.total) filter (where o.metodo_pago = 'efectivo'), 0)::numeric(14, 2) as efectivo,
  max(coalesce(o.fecha_envio, o.fecha)) as ultima,
  t.repartidor_id,
  coalesce(t.a_mano, false) as a_mano
from ven_ordenes o
left join del_transportistas t on t.transportista = o.transportista
where o.estado_entrega = 'entregada' and o.transportista is not null and length(btrim(o.transportista)) > 0
group by o.transportista, t.repartidor_id, t.a_mano;

-- Órdenes que cobró un repartidor: entregadas, en efectivo, por un transportista que es un repartidor. La semana es la de
-- la fecha de envío (el día en que cobra).
create or replace view del_efectivo_ordenes
with (security_invoker = true) as
select
  o.id as orden_id,
  t.repartidor_id,
  f.fecha,
  (f.fecha - ((extract(isodow from f.fecha)::integer + 3) % 7)) as semana,
  o.unidad_id,
  o.numero,
  o.total::numeric(12, 2) as monto,
  o.transportista
from ven_ordenes o
cross join lateral (select coalesce(o.fecha_envio, o.fecha) as fecha) f
join del_transportistas t on t.transportista = o.transportista and t.repartidor_id is not null
where o.estado_entrega = 'entregada'
  and o.metodo_pago = 'efectivo'
  and o.total > 0;

comment on view del_efectivo_ordenes is 'Portal AF4 360°: órdenes entregadas cobradas en efectivo por un repartidor, con su semana de cierre.';

-- Semanas con lo cobrado cargado a mano en sus entregas: ahí manda lo de las entregas.
create or replace view del_semanas
with (security_invoker = true) as
with ent as (
  select
    e.repartidor_id,
    e.semana,
    coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina'), 0)::integer as en_ruta,
    coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'entregado'), 0)::integer as entregas,
    coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'fallido'), 0)::integer as fallidas,
    coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'devuelto'), 0)::integer as devueltas,
    coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'reprogramado'), 0)::integer as reprogramadas,
    coalesce(sum(e.monto) filter (where e.categoria is distinct from 'propina' and not coalesce(t.pago_aparte, false)), 0)::numeric(12, 2) as tarifas,
    coalesce(sum(e.monto) filter (where e.categoria = 'propina' and not coalesce(t.pago_aparte, false)), 0)::numeric(12, 2) as propinas,
    coalesce(sum(e.monto) filter (where coalesce(t.pago_aparte, false)), 0)::numeric(12, 2) as aparte,
    coalesce(sum(e.cobrado) filter (where e.metodo_cobro = 'efectivo'), 0)::numeric(12, 2) as cobrado_manual,
    bool_or(e.cobrado is not null) as manual,
    count(*)::integer as lineas
  from del_entregas e
  left join del_tiendas t on t.unidad_id = e.unidad_id
  group by e.repartidor_id, e.semana
),
ord as (
  select repartidor_id, semana, sum(monto)::numeric(12, 2) as efectivo, count(*)::integer as ordenes
  from del_efectivo_ordenes
  group by 1, 2
)
select
  repartidor_id,
  semana,
  coalesce(e.en_ruta, 0)::integer as en_ruta,
  coalesce(e.entregas, 0)::integer as entregas,
  coalesce(e.fallidas, 0)::integer as fallidas,
  coalesce(e.devueltas, 0)::integer as devueltas,
  coalesce(e.reprogramadas, 0)::integer as reprogramadas,
  coalesce(e.tarifas, 0)::numeric(12, 2) as tarifas,
  coalesce(e.propinas, 0)::numeric(12, 2) as propinas,
  coalesce(e.aparte, 0)::numeric(12, 2) as aparte,
  (case when coalesce(e.manual, false) then e.cobrado_manual else coalesce(o.efectivo, 0) end)::numeric(12, 2) as cobrado_efectivo,
  coalesce(e.lineas, 0)::integer as lineas,
  (case when coalesce(e.manual, false) then 'manual' when o.efectivo is not null then 'ordenes' else 'ninguno' end) as efectivo_origen,
  coalesce(o.efectivo, 0)::numeric(12, 2) as efectivo_ordenes,
  coalesce(o.ordenes, 0)::integer as ordenes_efectivo
from ent e
full join ord o using (repartidor_id, semana);

comment on view del_semanas is 'Portal AF4 360°: totales de cada repartidor por semana de cierre; el efectivo, de sus órdenes salvo que se haya cargado a mano.';

create or replace view conc_delivery_tiendas
with (security_invoker = true) as
with manual as (
  select repartidor_id, semana from del_entregas where cobrado is not null group by 1, 2
),
ent as (
  select
    e.repartidor_id,
    e.semana,
    e.unidad_id,
    coalesce(sum(e.monto), 0)::numeric(12, 2) as monto,
    coalesce(sum(e.cobrado) filter (where e.metodo_cobro = 'efectivo'), 0)::numeric(12, 2) as cobrado
  from del_entregas e
  group by 1, 2, 3
),
ord as (
  select o.repartidor_id, o.semana, o.unidad_id, sum(o.monto)::numeric(12, 2) as efectivo
  from del_efectivo_ordenes o
  where not exists (select 1 from manual m where m.repartidor_id = o.repartidor_id and m.semana = o.semana)
  group by 1, 2, 3
),
juntos as (
  select repartidor_id, semana, unidad_id, coalesce(e.monto, 0) as monto, coalesce(e.cobrado, 0) + coalesce(o.efectivo, 0) as cobrado
  from ent e
  full join ord o using (repartidor_id, semana, unidad_id)
)
select
  j.repartidor_id,
  j.semana,
  j.unidad_id,
  coalesce(t.pago_aparte, false) as pago_aparte,
  j.monto::numeric(12, 2) as monto,
  j.cobrado::numeric(12, 2) as cobrado_efectivo
from juntos j
left join del_tiendas t on t.unidad_id = j.unidad_id;

-- ---------------------------------------------------------------------------------------------
-- Capital de trabajo: inventario de la vista y efectivo que el banco todavía no muestra
-- ---------------------------------------------------------------------------------------------
-- Efectivo de repartidores sin rendir (últimos 60 días, semanas sin cierre pagado):
--  · semanas con el efectivo de sus órdenes: las órdenes que ninguna línea del banco tiene confirmadas (ni la orden, ni
--    la semana del repartidor);
--  · semanas cargadas a mano: lo cobrado de sus entregas, como antes.
create or replace function fin_capital_trabajo_al(p_corte date default null)
returns table (
  corte date,
  cxc_cartera numeric,
  cxp_cartera numeric,
  cobros_por_depositar numeric,
  cobros_pendientes bigint,
  efectivo_repartidores numeric,
  compras_abiertas numeric,
  inventario_valor numeric,
  inventario_unidades numeric,
  skus_con_stock bigint,
  skus_sin_costo bigint
)
language sql stable
set search_path = public
as $$
  with c as (select coalesce(p_corte, fin_cartera_hoy()) as dia),
  cartera as (
    select
      coalesce(sum(t.saldo) filter (where t.clase = 'cobrar'), 0) as cxc,
      coalesce(sum(t.saldo) filter (where t.clase = 'pagar'), 0) as cxp
    from fin_cartera_al((select dia from c)) t
  ),
  cobros as (
    select coalesce(sum(f.neto), 0) as monto, count(*) as n
    from conc_fuentes_cobro f
    where not f.anulada
      and f.fecha <= (select dia from c)
      and f.fecha > (select dia from c) - 60
      and not exists (select 1 from conc_pares p where p.cobro_id = f.id and p.estado = 'confirmado')
  ),
  semanas as (
    select s.repartidor_id, s.semana, s.efectivo_origen, s.cobrado_efectivo
    from del_semanas s
    where s.semana <= (select dia from c)
      and s.semana > (select dia from c) - 60
      and not exists (
        select 1 from del_cierres k where k.repartidor_id = s.repartidor_id and k.semana = s.semana and k.estado = 'pagado'
      )
  ),
  efectivo as (
    select
      coalesce((select sum(s.cobrado_efectivo) from semanas s where s.efectivo_origen = 'manual'), 0)
      + coalesce((
        select sum(o.monto)
        from del_efectivo_ordenes o
        join semanas s on s.repartidor_id = o.repartidor_id and s.semana = o.semana and s.efectivo_origen = 'ordenes'
        where o.fecha <= (select dia from c)
          and not exists (
            select 1 from conc_pares p
            where p.estado = 'confirmado' and p.clase = 'orden' and p.orden_fuente = 'ven_ordenes' and p.orden_id = o.orden_id
          )
          and not exists (
            select 1 from conc_pares p
            where p.estado = 'confirmado' and p.clase = 'delivery' and p.del_repartidor_id = o.repartidor_id and p.del_semana = o.semana
          )
      ), 0) as monto
  ),
  compras as (
    select coalesce(sum(greatest(
      coalesce(w.monto_total, 0) - coalesce(w.pagado_a_proveedor, coalesce(w.primer_pago, 0) + coalesce(w.segundo_pago, 0)),
      0
    )), 0) as monto
    from wms_compras w
    join paises p on p.id = w.pais_id
    where p.codigo = 'PA' and w.anulada_en is null and w.etapa <> 'descartado' and w.estado <> 'completado'
  ),
  stock as (
    select v.sku_maestro_id, sum(greatest(v.unidades, 0)) as unidades, sum(v.valor) as valor, bool_or(v.sin_costo and v.unidades > 0) as sin_costo
    from fin_inventario_valorizado v
    where v.pais = 'PA'
    group by v.sku_maestro_id
    having sum(greatest(v.unidades, 0)) > 0
  ),
  inventario as (
    select
      coalesce(sum(st.valor), 0) as valor,
      coalesce(sum(st.unidades), 0) as unidades,
      count(*) as skus,
      count(*) filter (where st.sin_costo) as sin_costo
    from stock st
  )
  select
    (select dia from c),
    round((select cxc from cartera), 2),
    round((select cxp from cartera), 2),
    round((select monto from cobros), 2),
    (select n from cobros),
    round((select monto from efectivo), 2),
    round((select monto from compras), 2),
    round((select valor from inventario), 2),
    (select unidades from inventario),
    (select skus from inventario),
    (select sin_costo from inventario)
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Tareas programadas y alertas
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_tareas_ejecuciones (
  id uuid primary key default gen_random_uuid(),
  tarea text not null check (tarea ~ '^[a-z0-9-]{1,40}$'),
  inicio timestamptz not null default now(),
  fin timestamptz,
  ok boolean,
  -- Lo que hizo, para mostrar (≤ 1000 caracteres).
  resumen text check (resumen is null or length(resumen) <= 1000),
  error text check (error is null or length(error) <= 1000),
  -- cron | manual
  disparo text not null default 'cron' check (disparo in ('cron', 'manual')),
  usuario_id uuid references auth.users(id),
  -- Lo que quedó por hacer cuando se acabó el tiempo (la próxima ejecución sigue de ahí); null = terminó.
  pendiente jsonb
);
create index if not exists fin_tareas_ejecuciones_tarea on fin_tareas_ejecuciones (tarea, inicio desc);
alter table fin_tareas_ejecuciones enable row level security;

create table if not exists fin_alertas (
  id uuid primary key default gen_random_uuid(),
  -- Identifica la situación (`cxp-vence:<documento>`, `cierre:<mes>`…): la misma situación es la misma alerta.
  clave text not null unique check (length(clave) between 1 and 200),
  tipo text not null check (tipo in ('caja_minima', 'cxp_vence', 'cxc_vencido', 'cierre_pendiente', 'costo_ventas', 'inventario_sin_costo')),
  severidad text not null default 'aviso' check (severidad in ('info', 'aviso', 'critica')),
  mensaje text not null check (length(mensaje) between 1 and 500),
  enlace text check (enlace is null or enlace ~ '^/[A-Za-z0-9/_?=&.%-]*$'),
  -- El módulo que hay que poder abrir para verla.
  modulo text not null,
  monto numeric(14, 2),
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  -- Ya no pasa (la tarea dejó de verla).
  resuelta_en timestamptz,
  -- Alguien la dio por vista: deja de mostrarse.
  vista_por uuid references auth.users(id),
  vista_en timestamptz
);
create index if not exists fin_alertas_activas on fin_alertas (creada desc) where resuelta_en is null and vista_en is null;
alter table fin_alertas enable row level security;

comment on table fin_tareas_ejecuciones is 'Portal AF4 360°: registro de cada ejecución de las tareas programadas (/panel-financiero/tareas).';
comment on table fin_alertas is 'Portal AF4 360°: alertas financieras que genera la tarea diaria; se muestran en «Necesita tu atención» del Panel.';

revoke all on function fin_inventario_vendido(integer, text) from public;
revoke all on function fin_capital_trabajo_al(date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_inventario_vendido(integer, text) from anon, authenticated';
    execute 'revoke all on function fin_capital_trabajo_al(date) from anon, authenticated';
  end if;
end $$;
