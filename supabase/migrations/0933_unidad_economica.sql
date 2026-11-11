-- Portal AF4 360°: Rentabilidad › unidad económica (margen real por producto, pedido, zona, repartidor y campaña).
--
--  * `fin_config.unidad_economica`: los supuestos que faltan en los datos y se cambian desde el portal — envío de una
--    orden enviada sin costo cargado, vuelta de una devolución (fracción del envío de ida), producto dañado o perdido en
--    una devolución (% del costo), comisión de cobro por método de pago (%), margen objetivo (%) y los fijos por mes de
--    cada tienda (vacío = la administración del libro).
--  * `mkt_meta_campanas`: el gasto y las compras de Meta Ads por día, campaña y conjunto, importados del CSV de
--    exportación del Ads Manager (una fila por día + campaña + conjunto: volver a importar no duplica).
--  * `mkt_meta_reglas`: «si el nombre de la campaña o del conjunto contiene X, es de la tienda T (y del producto P)».
--    `mkt_meta_aplicar_reglas()` asigna las campañas que no se asignaron a mano.
--
-- RLS activado y sin políticas (SEGURIDAD.md, migración 0063): solo el servidor, con la clave de servicio. Se puede
-- correr dos veces.

insert into fin_config (clave, valor) values (
  'unidad_economica',
  jsonb_build_object(
    'envio_por_orden', 3.65,
    'envio_vuelta_factor', 1,
    'perdida_devolucion_pct', 10,
    'margen_objetivo_pct', 15,
    'comision_pct', jsonb_build_object(
      'efectivo', 0, 'yappy', 2, 'transferencia', 0, 'tarjeta', 3.5, 'servientrega', 3, 'clicksi', 0, 'previo_pago', 0, 'otro', 0
    ),
    'fijos_por_tienda', '{}'::jsonb
  )
)
on conflict (clave) do nothing;

create table if not exists mkt_meta_reglas (
  id uuid primary key default gen_random_uuid(),
  -- Se busca sin mayúsculas dentro de «campaña conjunto» (texto, no un patrón: % y _ no son comodines).
  patron text not null check (length(btrim(patron)) between 2 and 120),
  unidad_id uuid not null references fin_unidades(id),
  -- Producto de costo (`fin_costo_vigente.producto_clave` o el nombre normalizado de la línea); vacío = toda la tienda.
  producto_clave text check (producto_clave is null or length(producto_clave) between 1 and 200),
  -- Menor gana; a igual prioridad, la de un producto y luego el patrón más largo.
  prioridad integer not null default 100 check (prioridad between 0 and 1000),
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create unique index if not exists mkt_meta_reglas_unica on mkt_meta_reglas (lower(btrim(patron)), unidad_id, coalesce(producto_clave, ''));

create table if not exists mkt_meta_campanas (
  id uuid primary key default gen_random_uuid(),
  -- El día de la fila (o el inicio del informe si la exportación no viene por día).
  fecha date not null,
  fecha_fin date,
  campana text not null check (length(campana) between 1 and 300),
  conjunto text not null default '' check (length(conjunto) <= 300),
  gasto numeric(14, 2) not null default 0 check (gasto >= 0),
  compras numeric(12, 2) not null default 0 check (compras >= 0),
  moneda text not null default 'USD' check (moneda = 'USD'),
  unidad_id uuid references fin_unidades(id),
  producto_clave text,
  asignacion text not null default 'sin_asignar' check (asignacion in ('regla', 'manual', 'sin_asignar')),
  regla_id uuid references mkt_meta_reglas(id) on delete set null,
  archivo text,
  lote uuid,
  -- fecha|campaña|conjunto normalizados (resumen sha-256): la misma fila de otra exportación la actualiza.
  origen_clave text not null unique,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists mkt_meta_campanas_fecha on mkt_meta_campanas (fecha, unidad_id);

alter table mkt_meta_reglas enable row level security;
alter table mkt_meta_campanas enable row level security;

-- Asigna tienda y producto a las campañas que no se asignaron a mano, con la primera regla activa que calce.
create or replace function mkt_meta_aplicar_reglas()
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  with mejor as (
    select distinct on (c.id) c.id, r.id as regla_id, r.unidad_id, r.producto_clave
    from mkt_meta_campanas c
    join mkt_meta_reglas r
      on r.activo and strpos(lower(c.campana || ' ' || c.conjunto), lower(btrim(r.patron))) > 0
    where c.asignacion <> 'manual'
    order by c.id, r.prioridad, (r.producto_clave is null), length(btrim(r.patron)) desc, r.creado_en
  )
  update mkt_meta_campanas c
  set unidad_id = m.unidad_id,
      producto_clave = m.producto_clave,
      regla_id = m.regla_id,
      asignacion = case when m.regla_id is null then 'sin_asignar' else 'regla' end,
      actualizado_en = now()
  from (
    select c2.id, m2.regla_id, m2.unidad_id, m2.producto_clave
    from mkt_meta_campanas c2
    left join mejor m2 on m2.id = c2.id
    where c2.asignacion <> 'manual'
  ) m
  where c.id = m.id
    and (c.unidad_id is distinct from m.unidad_id or c.producto_clave is distinct from m.producto_clave
      or c.regla_id is distinct from m.regla_id
      or c.asignacion is distinct from (case when m.regla_id is null then 'sin_asignar' else 'regla' end));
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on table mkt_meta_campanas is 'Portal AF4 360°: gasto y compras de Meta Ads por día, campaña y conjunto (CSV del Ads Manager).';
comment on table mkt_meta_reglas is 'Portal AF4 360°: reglas por nombre que asignan una campaña de Meta a una tienda y un producto.';

revoke all on function mkt_meta_aplicar_reglas() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function mkt_meta_aplicar_reglas() from anon, authenticated';
  end if;
end $$;
