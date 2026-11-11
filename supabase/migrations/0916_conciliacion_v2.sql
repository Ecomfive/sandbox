-- Portal AF4 360°: Conciliación bancaria v2 (sobre la 0123; lee Ventas por tienda 0122 y Deliverys 0124).
--
-- 1. Órdenes reales. `conc_ordenes_fuente` deja de ser solo los cruces que se marcaron a mano en el Excel de conciliación
--    («Orden Detectada»): es la unión de las órdenes ENTREGADAS de `ven_ordenes` (fuente 'ven_ordenes') y de
--    `conc_ordenes` (fuente 'libro_conciliacion'). Mismas columnas y tipos que en la 0123:
--      · fecha = la de envío (es el día en que el repartidor cobra y rinde; sin ella, la de la orden);
--      · metodo_pago, al dominio de la conciliación: «previo pago» → transferencia; lo cobrado por Clicksi y «otro» no
--        llegan al banco de la empresa y quedan fuera;
--      · repartidor = el transportista de la orden.
--    Si la misma orden (tienda + número, sin «#») está en las dos fuentes, manda `ven_ordenes`: la del Excel se oculta.
--    `conc_ordenes_libres` = las de la vista que ninguna línea tiene confirmadas (el emparejador lee solo esas).
--
-- 2. Deliverys. Una pareja de clase 'delivery' cubre una línea del banco con lo que dice la liquidación semanal de un
--    repartidor: (repartidor, semana de jueves a miércoles, tienda o null = toda la semana). Un débito «TRANSFERENCIA A
--    <repartidor>» = lo que se le paga (por tienda o el neto del cierre); un crédito de él = lo que debe rendir (neto
--    negativo del cierre). `conc_delivery_tiendas` suma la semana por tienda (aunque el cierre siga abierto). Siempre es
--    una sugerencia: nunca se confirma sola.
--
-- 3. Ingresos por cuenta. El libro trae los ingresos por tienda y mes SIN forma de pago (cuenta vacía, FLUJO = SI), así
--    que el saldo del banco según el libro nunca cuadra con el extracto. Diseño elegido — un traspaso, no un ingreso
--    nuevo: al registrar un cobro conciliado (línea de crédito cubierta por cobros, órdenes o deliverys) como ingreso de
--    <tienda> en <cuenta>, se crean DOS movimientos del tipo «Ingresos», los dos con EERR = NO y FLUJO = SI:
--      · +monto con la cuenta del banco (entra al banco), y
--      · −monto sin cuenta (un reverso: sale de «Sin forma de pago», es decir, de los cobros por depositar).
--    El EERR no cambia (EERR = NO) y la caja total tampoco (+X −X): solo pasa el cobro de «sin cuenta» al banco. Se
--    descartó anotar `cuenta_id` en el ingreso existente porque es un total mensual por tienda (habría que partirlo y
--    marcarlo editado a mano, y reimportar el libro ya no lo actualizaría). Llevan origen 'conciliacion' y la clave
--    `conc-ing:<línea>:<tienda>[:rev]` (idempotentes); «Volver a pendiente» los borra. `conc_lineas.ingreso_en` marca la
--    línea ya registrada.
--
-- RLS activado y sin políticas en lo nuevo; las vistas llevan `security_invoker = true`. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Órdenes reales
-- ---------------------------------------------------------------------------------------------
-- La fecha con que se buscan las órdenes entregadas (envío, o la de la orden).
create index if not exists ven_ordenes_fecha_cobro on ven_ordenes ((coalesce(fecha_envio, fecha))) where estado_entrega = 'entregada';
create index if not exists ven_ordenes_numero_clave on ven_ordenes ((upper(ltrim(numero, '#'))));

create or replace view conc_ordenes_fuente
with (security_invoker = true) as
with ven as (
  select
    o.id,
    u.nombre as tienda,
    o.numero,
    coalesce(o.fecha_envio, o.fecha) as fecha,
    o.total::numeric(14, 2) as monto,
    case o.metodo_pago when 'previo_pago' then 'transferencia' else o.metodo_pago end as metodo_pago,
    o.transportista as repartidor,
    upper(ltrim(o.numero, '#')) as clave,
    coalesce(t.etiqueta, upper(u.nombre)) as etiqueta
  from ven_ordenes o
  join fin_unidades u on u.id = o.unidad_id
  left join del_tiendas t on t.unidad_id = o.unidad_id
  where o.estado_entrega = 'entregada'
    and o.total > 0
    and o.metodo_pago in ('efectivo', 'yappy', 'transferencia', 'tarjeta', 'servientrega', 'previo_pago')
)
select v.id, v.tienda, v.numero, v.fecha, v.monto, v.metodo_pago, v.repartidor, 'ven_ordenes'::text as fuente
from ven v
union all
select c.id, c.tienda, c.numero, c.fecha, c.monto, c.metodo_pago, c.repartidor, c.fuente
from conc_ordenes c
where not exists (
  select 1
  from ven v
  where v.clave = upper(ltrim(c.numero, '#'))
    and (
      c.tienda is null
      or upper(c.tienda) = upper(v.tienda)
      or v.etiqueta = any (string_to_array(upper(replace(c.tienda, ' ', '')), '/'))
    )
);

create or replace view conc_ordenes_libres
with (security_invoker = true) as
select f.*
from conc_ordenes_fuente f
where not exists (
  select 1 from conc_pares p
  where p.estado = 'confirmado' and p.clase = 'orden' and p.orden_id = f.id and p.orden_fuente = f.fuente
);

-- ---------------------------------------------------------------------------------------------
-- 2. Deliverys
-- ---------------------------------------------------------------------------------------------
alter table conc_pares add column if not exists del_repartidor_id uuid references del_repartidores(id) on delete cascade;
alter table conc_pares add column if not exists del_semana date;
-- null = la semana completa (el neto del cierre); con valor, lo de esa tienda.
alter table conc_pares add column if not exists del_unidad_id uuid references fin_unidades(id);

-- La 0123 creó estos checks sin nombre (Postgres los llamó conc_pares_clase_check y conc_pares_check).
alter table conc_pares drop constraint if exists conc_pares_clase_check;
alter table conc_pares drop constraint if exists conc_pares_check;
alter table conc_pares drop constraint if exists conc_pares_partes_check;
alter table conc_pares add constraint conc_pares_clase_check check (clase in ('movimiento', 'cobro', 'orden', 'delivery'));
alter table conc_pares add constraint conc_pares_partes_check check (
  (clase = 'movimiento' and movimiento_id is not null and cobro_id is null and orden_id is null and del_repartidor_id is null)
  or (clase = 'cobro' and cobro_id is not null and movimiento_id is null and orden_id is null and del_repartidor_id is null)
  or (clase = 'orden' and orden_id is not null and movimiento_id is null and cobro_id is null and del_repartidor_id is null)
  or (clase = 'delivery' and del_repartidor_id is not null and del_semana is not null and movimiento_id is null and cobro_id is null and orden_id is null)
);

-- La misma parte no se propone dos veces para la misma línea (ahora también la de un repartidor).
drop index if exists conc_pares_sin_repetir;
create unique index if not exists conc_pares_sin_repetir on conc_pares (
  linea_id,
  coalesce(movimiento_id::text, cobro_id::text, orden_id::text, del_repartidor_id::text || '|' || (del_semana - date '2000-01-01')::text || '|' || coalesce(del_unidad_id::text, ''))
) where estado <> 'descartado';

-- Lo de un repartidor en una semana (o en una tienda de esa semana) se concilia una sola vez.
create unique index if not exists conc_pares_delivery_unico
  on conc_pares (del_repartidor_id, del_semana, coalesce(del_unidad_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where estado = 'confirmado' and clase = 'delivery';

-- Lo de cada repartidor por semana y tienda (la suma la hace Postgres). `monto` = tarifas + propinas (lo que se le paga
-- por esa tienda); `cobrado_efectivo` = lo que cobró contra entrega y debe rendir.
create or replace view conc_delivery_tiendas
with (security_invoker = true) as
select
  e.repartidor_id,
  e.semana,
  e.unidad_id,
  coalesce(t.pago_aparte, false) as pago_aparte,
  coalesce(sum(e.monto), 0)::numeric(12, 2) as monto,
  coalesce(sum(e.cobrado) filter (where e.metodo_cobro = 'efectivo'), 0)::numeric(12, 2) as cobrado_efectivo
from del_entregas e
left join del_tiendas t on t.unidad_id = e.unidad_id
group by e.repartidor_id, e.semana, e.unidad_id, t.pago_aparte;

-- ---------------------------------------------------------------------------------------------
-- 3. Ingresos por cuenta
-- ---------------------------------------------------------------------------------------------
alter table conc_lineas add column if not exists ingreso_en timestamptz;
alter table conc_lineas add column if not exists ingreso_por uuid references auth.users(id);

create index if not exists fin_movimientos_conc_ing on fin_movimientos (origen_clave text_pattern_ops) where origen = 'conciliacion';

comment on view conc_ordenes_fuente is 'Portal AF4 360°: órdenes para conciliar: ven_ordenes entregadas (manda) + las del Excel de conciliación que no están ahí.';
comment on view conc_ordenes_libres is 'Portal AF4 360°: órdenes de conc_ordenes_fuente que ninguna línea del banco tiene confirmadas.';
comment on view conc_delivery_tiendas is 'Portal AF4 360°: lo de cada repartidor por semana y tienda, para cruzar sus pagos y depósitos con el banco.';
comment on column conc_lineas.ingreso_en is 'Cuándo se registró el cobro de esta línea como ingreso en su cuenta (traspaso desde «sin forma de pago»).';
