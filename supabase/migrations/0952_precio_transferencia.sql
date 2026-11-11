-- Portal AF4 360°: precio de transferencia entre la importadora (ECOMFIVE) y las tiendas propias.
--
--  * `fin_config.precio_transferencia`: la política (margen por defecto sobre el costo puesto en bodega, costo vigente o
--    promedio de los lotes, la importadora, las tiendas que le compran y los tipos del libro que son mercancía).
--  * `fin_precio_transferencia_reglas`: márgenes por producto (`fin_costo_vigente.producto_clave`) o por categoría (la
--    línea del lote de costo). Producto gana a categoría y categoría al margen por defecto.
--  * `fin_tp_unidades(desde, hasta)`: lo entregado por tienda, mes y producto, con su costo vigente y promedio (las mismas
--    líneas y el mismo costo de `fin_ue_lineas`, migración 0934).
--
-- El libro no se toca: el EERR con precio de transferencia es una vista que arma el portal
-- (`src/lib/finanzas/precio-transferencia.ts`) y deja el consolidado igual. Módulo `estado-resultados` (sin módulo nuevo).
-- RLS activado y sin políticas. Se puede correr dos veces.

insert into fin_config (clave, valor) values (
  'precio_transferencia',
  jsonb_build_object('margen_pct', 10, 'base', 'vigente', 'unidad_proveedora_id', null, 'tiendas', null, 'tipos_mercancia', null)
)
on conflict (clave) do nothing;

create table if not exists fin_precio_transferencia_reglas (
  id uuid primary key default gen_random_uuid(),
  alcance text not null check (alcance in ('producto', 'categoria')),
  clave text not null check (length(btrim(clave)) between 1 and 200),
  margen_pct numeric(7, 2) not null check (margen_pct between 0 and 300),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists fin_precio_transferencia_reglas_unica on fin_precio_transferencia_reglas (alcance, upper(btrim(clave)));
alter table fin_precio_transferencia_reglas enable row level security;

comment on table fin_precio_transferencia_reglas is 'Portal AF4 360°: margen de transferencia de la importadora a las tiendas por producto o categoría.';

create or replace function fin_tp_unidades(p_desde date, p_hasta date)
returns table (
  periodo date,
  unidad_id uuid,
  producto_clave text,
  linea text,
  unidades numeric,
  costo numeric,
  costo_promedio numeric,
  ventas numeric
)
language sql stable
set search_path = public
as $$
with l as (
  select x.periodo, x.unidad_id, x.producto_clave, x.unidades, x.mercancia, x.ventas
  from fin_ue_lineas(p_desde, p_hasta, null) x
  where x.estado_entrega = 'entregada' and x.unidades > 0
),
cv as materialized (
  select producto_clave, linea, costo_promedio from fin_costo_vigente
)
select
  l.periodo,
  l.unidad_id,
  l.producto_clave,
  max(cv.linea),
  sum(l.unidades),
  round(sum(l.mercancia), 2),
  round(sum(case when cv.costo_promedio is not null and l.mercancia > 0 then l.unidades * cv.costo_promedio else l.mercancia end), 2),
  round(sum(l.ventas), 2)
from l
left join cv on cv.producto_clave = l.producto_clave
group by l.periodo, l.unidad_id, l.producto_clave
$$;

revoke all on function fin_tp_unidades(date, date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_tp_unidades(date, date) from anon, authenticated';
  end if;
end $$;

comment on function fin_tp_unidades(date, date) is 'Portal AF4 360°: unidades entregadas por tienda, mes y producto con su costo vigente y promedio (precio de transferencia).';
