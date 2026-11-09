-- Portal AF4 360°: Rentabilidad por tienda y capital de trabajo (/rentabilidad). No guarda datos propios: junta lo que
-- ya calculan el libro (0114), Ventas por tienda (0122), las carteras (0118), Costos de mercancía (0121), Conciliación
-- bancaria (0123), Deliverys (0124), el inventario del WMS (0069) y las compras (af4_capital_trabajo, 0113).
--
--  * `fin_rentabilidad_libro`: el EERR de cada tienda y mes en los escalones de la cascada de margen (ingresos,
--    devoluciones, mercancía, envío, otros costos de venta, marketing y administración, todo en positivo). La regla que
--    parte el costo de ventas vive también en `rubroCostoVentas` (src/lib/finanzas/rentabilidad.ts): si cambias una,
--    cambia la otra.
--  * `fin_capital_trabajo_al(corte)`: los saldos del capital de trabajo de Panamá a una fecha (por cobrar y por pagar
--    de las carteras, cobros contra entrega sin depósito confirmado, efectivo de repartidores sin rendir, compras
--    abiertas e inventario valorizado al costo vigente). Las compras y el inventario son una foto de hoy.
--  * `fin_cartera_mensual(desde, hasta)`: por cobrar y por pagar al cierre de cada mes, para la evolución de DSO y DPO.
--
-- Las vistas llevan `security_invoker = true` y las funciones solo las llama el servidor (clave de servicio).
-- Se puede correr dos veces.

create or replace view fin_rentabilidad_libro
with (security_invoker = true) as
with lineas as (
  select
    e.periodo,
    e.unidad_id,
    e.seccion,
    e.signo,
    e.monto,
    case
      when e.seccion <> 'costo_ventas' then null
      when t.nombre ilike 'shipping%' then 'envio'
      when t.nombre ilike '%mercanc%' or t.nombre ilike 'costo de ventas' or t.nombre ilike 'importaci%'
        or t.nombre ilike 'otros gastos de importaci%' then 'mercancia'
      else 'otros_variables'
    end as rubro
  from fin_eerr_mensual e
  join fin_tipos t on t.id = e.tipo_id
)
select
  periodo,
  unidad_id,
  round(coalesce(sum(monto) filter (where seccion = 'ingresos' and signo > 0), 0), 2) as ingresos,
  round(coalesce(sum(monto) filter (where seccion = 'ingresos' and signo < 0), 0), 2) as devoluciones,
  round(coalesce(-sum(monto * signo) filter (where rubro = 'mercancia'), 0), 2) as mercancia,
  round(coalesce(-sum(monto * signo) filter (where rubro = 'envio'), 0), 2) as envio,
  round(coalesce(-sum(monto * signo) filter (where rubro = 'otros_variables'), 0), 2) as otros_variables,
  round(coalesce(-sum(monto * signo) filter (where seccion = 'marketing'), 0), 2) as marketing,
  round(coalesce(-sum(monto * signo) filter (where seccion = 'administracion'), 0), 2) as administracion
from lineas
group by periodo, unidad_id;

comment on view fin_rentabilidad_libro is 'Portal AF4 360°: EERR por tienda y mes en los escalones de la cascada de margen (A DISTRIBUIR ya repartido).';

-- ---------------------------------------------------------------------------------------------
-- Saldos del capital de trabajo a una fecha (Panamá, USD)
-- ---------------------------------------------------------------------------------------------
-- Cobros por depositar: cobros de Yappy, MiPOS y Servientrega de los últimos 60 días sin pareja confirmada con el banco.
-- Efectivo de repartidores: lo cobrado en efectivo en semanas de los últimos 60 días cuyo cierre no está pagado.
-- Inventario: stock físico de las bodegas de Panamá × costo vigente del producto (por `sku_maestro_id`).
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
  efectivo as (
    select coalesce(sum(s.cobrado_efectivo), 0) as monto
    from del_semanas s
    where s.semana <= (select dia from c)
      and s.semana > (select dia from c) - 60
      and not exists (
        select 1 from del_cierres k where k.repartidor_id = s.repartidor_id and k.semana = s.semana and k.estado = 'pagado'
      )
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
  costo as (
    select distinct on (v.sku_maestro_id) v.sku_maestro_id, v.costo_vigente
    from fin_costo_vigente v
    where v.sku_maestro_id is not null
    order by v.sku_maestro_id, v.fecha_llegada desc nulls last
  ),
  stock as (
    select s.sku_maestro_id, sum(greatest(s.fisico, 0)) as unidades
    from wms_stock s
    join wms_bodegas b on b.id = s.bodega_id
    join paises p on p.id = b.pais_id
    where p.codigo = 'PA'
    group by s.sku_maestro_id
    having sum(greatest(s.fisico, 0)) > 0
  ),
  inventario as (
    select
      coalesce(sum(st.unidades * co.costo_vigente), 0) as valor,
      coalesce(sum(st.unidades), 0) as unidades,
      count(*) as skus,
      count(*) filter (where co.costo_vigente is null) as sin_costo
    from stock st
    left join costo co on co.sku_maestro_id = st.sku_maestro_id
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

-- Por cobrar y por pagar al cierre de cada mes (desde y hasta: primeros días de mes).
create or replace function fin_cartera_mensual(p_desde date, p_hasta date)
returns table (periodo date, cxc numeric, cxp numeric)
language sql stable
set search_path = public
as $$
  select
    m.mes::date,
    round(coalesce(sum(t.saldo) filter (where t.clase = 'cobrar'), 0), 2),
    round(coalesce(sum(t.saldo) filter (where t.clase = 'pagar'), 0), 2)
  from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') as m(mes)
  left join lateral fin_cartera_al((m.mes + interval '1 month' - interval '1 day')::date) t on true
  group by m.mes
  order by m.mes
$$;

revoke all on function fin_capital_trabajo_al(date) from public;
revoke all on function fin_cartera_mensual(date, date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_capital_trabajo_al(date) from anon, authenticated';
    execute 'revoke all on function fin_cartera_mensual(date, date) from anon, authenticated';
  end if;
end $$;

comment on function fin_capital_trabajo_al(date) is 'Portal AF4 360°: saldos del capital de trabajo de Panamá a una fecha (carteras, cobros por depositar, compras abiertas, inventario valorizado).';
comment on function fin_cartera_mensual(date, date) is 'Portal AF4 360°: por cobrar y por pagar al cierre de cada mes.';

-- ---------------------------------------------------------------------------------------------
-- Permiso: lo recibe quien ya tiene «Estado de resultados», con su mismo solo lectura.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'rentabilidad', solo_lectura
from permisos_rol
where modulo = 'estado-resultados'
on conflict (rol_id, modulo) do nothing;
