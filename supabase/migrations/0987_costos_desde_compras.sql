-- 0987 · Costos y cierre (lista de 100 mejoras, 19 nov 2026). Reversa: supabase/rollbacks/0987_rollback.sql.
--
-- 1. Método del costo vigente (mejora 32): `fin_config.costo_metodo` = 'ultimo' (el lote más reciente, lo de siempre) o
--    'promedio' (promedio ponderado por unidades de los lotes de los 12 meses anteriores al más reciente). La vista
--    `fin_costo_vigente` conserva sus columnas (todo lo que la usa sigue igual) y suma al final `costo_ultimo`,
--    `costo_promedio_12m` y `metodo`. Los lotes que trae Compras (origen 'compras', mejora 31) entran como uno más.
-- 2. Alerta diaria `costo_sube` (mejora 35).
-- Se puede correr dos veces.

insert into fin_config (clave, valor) values ('costo_metodo', '"ultimo"'::jsonb) on conflict (clave) do nothing;

create or replace view fin_costo_vigente
with (security_invoker = true) as
with metodo as (
  select coalesce((select valor #>> '{}' from fin_config where clave = 'costo_metodo'), 'ultimo') as m
),
ordenados as (
  select l.*,
    row_number() over (
      partition by l.producto_clave
      order by l.fecha_llegada desc nulls last, l.fila desc, l.creado_en desc
    ) as n
  from fin_costos_lotes l
),
ultimo as (
  select * from ordenados where n = 1
),
agregados as (
  select producto_clave,
    count(*) as lotes,
    sum(cantidad) as unidades,
    sum(cantidad * costo_total) / nullif(sum(cantidad), 0) as costo_promedio,
    min(costo_total) as costo_minimo,
    max(costo_total) as costo_maximo
  from fin_costos_lotes
  group by producto_clave
),
doce as (
  select l.producto_clave,
    sum(l.cantidad * l.costo_total) / nullif(sum(l.cantidad), 0) as costo_promedio_12m
  from fin_costos_lotes l
  join ultimo u on u.producto_clave = l.producto_clave
  where u.fecha_llegada is null or l.fecha_llegada is null or l.fecha_llegada > u.fecha_llegada - interval '12 months'
  group by l.producto_clave
)
select o.producto_clave, o.producto, o.linea, o.codigo, o.sku_maestro_id, o.fecha_llegada, o.mes_texto, o.proveedor,
  (case when (select m from metodo) = 'promedio' and d.costo_promedio_12m is not null
    then round(d.costo_promedio_12m, 6) else o.costo_total end)::numeric(14, 6) as costo_vigente,
  o.estatus,
  a.lotes, a.unidades, round(a.costo_promedio, 6) as costo_promedio, a.costo_minimo, a.costo_maximo,
  o.costo_total as costo_ultimo,
  round(d.costo_promedio_12m, 6) as costo_promedio_12m,
  (select m from metodo) as metodo
from ultimo o
join agregados a on a.producto_clave = o.producto_clave
left join doce d on d.producto_clave = o.producto_clave;

do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_alertas'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table fin_alertas drop constraint %I', r.conname);
  end loop;
  alter table fin_alertas add constraint fin_alertas_tipo_check check (tipo in (
    'caja_minima', 'cxp_vence', 'cxc_vencido', 'cierre_pendiente', 'costo_ventas', 'inventario_sin_costo',
    'cierre_tarea_atrasada', 'fiscal_vence',
    'tesoreria_dropi', 'tesoreria_efectivo', 'tesoreria_depositos', 'tesoreria_linea_vencida', 'tesoreria_linea_renovar',
    'tesoreria_linea_uso', 'tesoreria_saldos', 'tesoreria_pagos',
    'pauta_techo',
    'tesoreria_covenant',
    'riesgo_sube',
    'presupuesto_desvio',
    'gasto_anomalo',
    'prestamo_grupo_vence',
    'conciliacion_atrasada',
    'costo_sube'
  )) not valid;
end $$;
