-- Portal AF4 360° — capa financiera (fase 1): P&L mensual y capital de trabajo por país.
--
-- Son vistas de solo lectura sobre las tablas que el equipo ya llena (ordenes, productos,
-- gastos, retiros, saldos_wallet, wms_compras). No guardan datos propios.
--
-- Seguridad: `security_invoker = true` para que la vista respete el RLS de las tablas de
-- origen (RLS activado y sin políticas, ver SEGURIDAD.md). Sin esa opción la vista correría
-- con los permisos de su dueño y la clave anon podría leer las cifras por PostgREST.
--
-- Moneda: cada país queda en la moneda en que se cargaron sus montos; no se mezcla CR con PA.
-- La conversión a USD (tipos_cambio) va en la capa de presentación.

-- ---------------------------------------------------------------------------------------------
-- 1. Estado de resultados mensual por país
-- ---------------------------------------------------------------------------------------------
-- Ingreso = pedidos entregados (ENTREGADO / NOVEDAD SOLUCIONADA), en el mes de su fecha.
-- Costo de ventas = cantidad × productos.costo. Los pedidos sin costo cargado se cuentan aparte
-- (`pedidos_sin_costo`) para que el margen no se infle en silencio.
create or replace view af4_pyl_mensual
with (security_invoker = true) as
with ventas as (
  select
    o.pais_id,
    date_trunc('month', o.fecha)::date as periodo,
    sum(o.monto) as ingresos,
    sum(o.cantidad) as unidades,
    count(*) as pedidos,
    sum(o.cantidad * p.costo) filter (where p.costo is not null) as costo_ventas,
    count(*) filter (where p.costo is null) as pedidos_sin_costo
  from ordenes o
  left join productos p on p.id = o.producto_id
  where upper(trim(o.estado)) in ('ENTREGADO', 'NOVEDAD SOLUCIONADA')
  group by 1, 2
),
opex as (
  select
    g.pais_id,
    date_trunc('month', g.fecha)::date as periodo,
    sum(g.monto) filter (where g.categoria = 'nomina') as nomina,
    sum(g.monto) filter (where g.categoria = 'alquiler') as alquiler,
    sum(g.monto) filter (where g.categoria = 'servicios') as servicios,
    sum(g.monto) filter (where g.categoria = 'marketing') as marketing,
    sum(g.monto) filter (where g.categoria = 'logistica') as logistica,
    sum(g.monto) filter (where g.categoria = 'otros') as otros,
    sum(g.monto) as gastos_operativos
  from gastos g
  group by 1, 2
),
base as (
  select
    coalesce(v.pais_id, x.pais_id) as pais_id,
    coalesce(v.periodo, x.periodo) as periodo,
    coalesce(v.ingresos, 0) as ingresos,
    coalesce(v.unidades, 0) as unidades,
    coalesce(v.pedidos, 0) as pedidos,
    coalesce(v.pedidos_sin_costo, 0) as pedidos_sin_costo,
    coalesce(v.costo_ventas, 0) as costo_ventas,
    coalesce(x.nomina, 0) as nomina,
    coalesce(x.alquiler, 0) as alquiler,
    coalesce(x.servicios, 0) as servicios,
    coalesce(x.marketing, 0) as marketing,
    coalesce(x.logistica, 0) as logistica,
    coalesce(x.otros, 0) as otros,
    coalesce(x.gastos_operativos, 0) as gastos_operativos
  from ventas v
  full outer join opex x on x.pais_id = v.pais_id and x.periodo = v.periodo
)
select
  b.*,
  b.ingresos - b.costo_ventas as margen_bruto,
  round((b.ingresos - b.costo_ventas) / nullif(b.ingresos, 0) * 100, 2) as margen_bruto_pct,
  b.ingresos - b.costo_ventas - b.gastos_operativos as ebitda,
  round((b.ingresos - b.costo_ventas - b.gastos_operativos) / nullif(b.ingresos, 0) * 100, 2) as margen_ebitda_pct,
  round(b.ingresos / nullif(b.pedidos, 0), 2) as ticket_promedio
from base b;

-- ---------------------------------------------------------------------------------------------
-- 2. Capital de trabajo por país (foto al día de hoy, sobre los últimos 90 días de actividad)
-- ---------------------------------------------------------------------------------------------
-- Por cobrar (plataformas) = último saldo de wallet + retiros abiertos o en novedad aún no recibidos.
-- Por pagar (proveedores)  = monto_total − lo pagado (pagado_a_proveedor o, si está vacío, primer + segundo pago)
--                            de compras vivas: no anuladas, no descartadas y no cerradas (estado <> completado).
--                            `pago_pendiente` ya no existe (migración 0083).
-- DSO / DPO sobre ventas y costo de ventas diarios promedio de los últimos 90 días.
-- DIO queda para la fase 2 (necesita el inventario valorizado del WMS).
create or replace view af4_capital_trabajo
with (security_invoker = true) as
with wallet as (
  select distinct on (s.pais_id, s.plataforma_id) s.pais_id, s.monto
  from saldos_wallet s
  order by s.pais_id, s.plataforma_id, s.fecha desc
),
wallet_pais as (
  select pais_id, sum(monto) as saldo_wallet from wallet group by 1
),
transito as (
  select r.pais_id, sum(coalesce(r.a_recibir, r.monto_neto)) as retiros_en_transito, count(*) as retiros_abiertos
  from retiros r
  where r.estado in ('abierto', 'novedad')
  group by 1
),
compras as (
  select
    c.pais_id,
    sum(greatest(
      coalesce(c.monto_total, 0)
        - coalesce(c.pagado_a_proveedor, coalesce(c.primer_pago, 0) + coalesce(c.segundo_pago, 0)),
      0
    )) as cxp_proveedores,
    count(*) filter (where c.venta_importacion) as compras_importacion_abiertas
  from wms_compras c
  where c.anulada_en is null and c.etapa <> 'descartado' and c.estado <> 'completado'
  group by 1
),
flujo_90 as (
  select pais_id, sum(ingresos) as ventas_90d, sum(costo_ventas) as costo_ventas_90d
  from af4_pyl_mensual
  where periodo >= date_trunc('month', current_date - 90)
  group by 1
)
select
  p.id as pais_id,
  p.codigo as pais_codigo,
  coalesce(w.saldo_wallet, 0) as saldo_wallet,
  coalesce(t.retiros_en_transito, 0) as retiros_en_transito,
  coalesce(t.retiros_abiertos, 0) as retiros_abiertos,
  coalesce(w.saldo_wallet, 0) + coalesce(t.retiros_en_transito, 0) as cxc_plataformas,
  coalesce(c.cxp_proveedores, 0) as cxp_proveedores,
  round((coalesce(w.saldo_wallet, 0) + coalesce(t.retiros_en_transito, 0)) / nullif(f.ventas_90d / 90.0, 0), 1) as dso_dias,
  round(coalesce(c.cxp_proveedores, 0) / nullif(f.costo_ventas_90d / 90.0, 0), 1) as dpo_dias
from paises p
left join wallet_pais w on w.pais_id = p.id
left join transito t on t.pais_id = p.id
left join compras c on c.pais_id = p.id
left join flujo_90 f on f.pais_id = p.id;

comment on view af4_pyl_mensual is 'Portal AF4 360°: estado de resultados mensual por país (ingresos entregados, costo de ventas, gastos, EBITDA).';
comment on view af4_capital_trabajo is 'Portal AF4 360°: cuentas por cobrar/pagar, DSO y DPO por país. DIO en fase 2.';

-- ---------------------------------------------------------------------------------------------
-- 3. Permiso del módulo «Estado de resultados» (/estado-resultados)
-- ---------------------------------------------------------------------------------------------
-- Quien ya trabaja en Nómina y gastos lo recibe, con su mismo solo lectura. Lo demás se da en Usuarios y roles.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'estado-resultados', solo_lectura
from permisos_rol
where modulo = 'gastos'
on conflict (rol_id, modulo) do nothing;
