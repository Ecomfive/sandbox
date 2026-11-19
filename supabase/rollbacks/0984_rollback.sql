-- Reversa de 0984: vuelve fin_eerr_movimientos a la de 0923, quita el reparto elegido y los vínculos con préstamos y bienes.
create or replace view fin_eerr_movimientos
with (security_invoker = true) as
with cfg as (
  select exists (select 1 from fin_config where clave = 'depreciacion_en_eerr' and valor = 'true'::jsonb) as dep
),
rango as (
  select min(periodo) as desde, max(periodo) as hasta from fin_movimientos
)
select m.periodo, m.unidad_id, u.clase, m.tipo_id, m.monto, 1::bigint as movimientos, 'libro'::text as fuente,
  u.entidad_id,
  u.pais_id,
  case when m.moneda = e.moneda then coalesce(m.monto_original, m.monto) else round(m.monto * fin_tasa(e.moneda, m.periodo), 2) end as monto_local
from fin_movimientos m
join fin_unidades u on u.id = m.unidad_id
join fin_tipos t on t.id = m.tipo_id
join fin_entidades e on e.id = u.entidad_id
cross join cfg
where m.en_eerr
  and t.seccion in ('ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros', 'depreciacion', 'impuesto_ganancias')
  and not (cfg.dep and (m.es_bien_de_uso or t.nombre = 'Alta Bien de Uso' or t.seccion = 'depreciacion'))
  -- Sin la tasa de su mes no entra (su monto en dólares todavía no se sabe).
  and (m.moneda = 'USD' or m.tasa_usd is not null)
union all
select d.periodo, d.unidad_id, u.clase, td.id, d.monto, d.bienes::bigint, 'bienes_uso',
  u.entidad_id,
  u.pais_id,
  round(d.monto * fin_tasa(e.moneda, d.periodo), 2)
from fin_depreciacion_mensual d
join fin_unidades u on u.id = d.unidad_id
join fin_entidades e on e.id = u.entidad_id
join fin_tipos td on td.nombre = 'Depreciación Bienes de uso'
cross join cfg
cross join rango
where cfg.dep and d.periodo between rango.desde and rango.hasta;

drop table if exists fin_movimiento_reparto;
delete from fin_grupo_movimientos where origen = 'libro';
drop index if exists fin_grupo_mov_movimiento;
alter table fin_grupo_movimientos drop column if exists movimiento_id;
do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_grupo_movimientos'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%origen%'
  loop
    execute format('alter table fin_grupo_movimientos drop constraint %I', r.conname);
  end loop;
  alter table fin_grupo_movimientos add constraint fin_grupo_movimientos_origen_check check (origen in ('manual', 'clickup'));
end $$;
drop index if exists fin_bienes_uso_movimiento;
alter table fin_bienes_uso drop column if exists movimiento_id;
