-- Portal AF4 360°: mejoras del Libro de movimientos que pidió María José (Oceans Ecommerce, 19 nov 2026).
--
-- 1. REPARTO ELEGIDO (`fin_movimiento_reparto`): un gasto puede repartirse solo entre las tiendas que lo asumen, con el
--    porcentaje de cada una (por defecto, partes iguales). Antes, todo lo de A DISTRIBUIR se repartía entre todas las tiendas
--    por la base del mes y había que corregirlo a mano. `fin_eerr_movimientos` parte el movimiento en una fila por tienda
--    elegida (con su clase, entidad y país): así lo ven igual `fin_eerr_mensual`, `fin_eerr_partes` y el reparto que arma
--    el portal con otra base. Un movimiento sin tiendas elegidas sigue como siempre. Las tiendas elegidas son de la misma
--    entidad que la tienda del movimiento (lo comprueba la acción del servidor).
-- 2. LO PAGÓ OTRA EMPRESA: `fin_grupo_movimientos.movimiento_id` liga el movimiento del libro con la deuda que genera en
--    Tesorería › Préstamos del grupo (la empresa que pagó presta; la dueña del gasto debe). Origen 'libro'.
-- 3. BIEN DE USO: `fin_bienes_uso.movimiento_id` liga la compra del libro con su ficha en Bienes de uso.
--
-- RLS activado y sin políticas (SEGURIDAD.md). Se puede correr dos veces. Reversa: supabase/rollbacks/0984_rollback.sql.

-- ---------------------------------------------------------------------------------------------
-- 1. Reparto elegido
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_movimiento_reparto (
  movimiento_id uuid not null references fin_movimientos(id) on delete cascade,
  unidad_id uuid not null references fin_unidades(id),
  -- Porcentaje de esta tienda; la vista lo usa sobre la suma del movimiento (si no suma 100, se normaliza).
  porcentaje numeric(7, 4) not null check (porcentaje > 0 and porcentaje <= 100),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  primary key (movimiento_id, unidad_id)
);
create index if not exists fin_movimiento_reparto_unidad on fin_movimiento_reparto (unidad_id);
alter table fin_movimiento_reparto enable row level security;

comment on table fin_movimiento_reparto is 'Portal AF4 360°: tiendas que asumen un movimiento del libro y su porcentaje (reparto elegido en vez de la base del mes).';

-- Mismas columnas que la 0923. Cambia solo que un movimiento con tiendas elegidas sale partido entre ellas.
create or replace view fin_eerr_movimientos
with (security_invoker = true) as
with cfg as (
  select exists (select 1 from fin_config where clave = 'depreciacion_en_eerr' and valor = 'true'::jsonb) as dep
),
rango as (
  select min(periodo) as desde, max(periodo) as hasta from fin_movimientos
),
-- Cada tienda toma de `desde` a `hasta` (acumulado del movimiento, de 0 a 1): redondear los extremos y restar hace que las
-- partes sumen exacto el monto (tres tiendas de 100 dan 33,33 + 33,33 + 33,34, sin perder el centavo).
partes as (
  select r.movimiento_id, r.unidad_id,
    coalesce(sum(r.porcentaje) over w_antes, 0) / sum(r.porcentaje) over w_todo as desde,
    sum(r.porcentaje) over w_hasta / sum(r.porcentaje) over w_todo as hasta
  from fin_movimiento_reparto r
  window
    w_todo as (partition by r.movimiento_id),
    w_antes as (partition by r.movimiento_id order by r.unidad_id rows between unbounded preceding and 1 preceding),
    w_hasta as (partition by r.movimiento_id order by r.unidad_id rows between unbounded preceding and current row)
)
select m.periodo,
  coalesce(p.unidad_id, m.unidad_id) as unidad_id,
  coalesce(up.clase, u.clase) as clase,
  m.tipo_id,
  (case when p.movimiento_id is null then m.monto else round(m.monto * p.hasta, 2) - round(m.monto * p.desde, 2) end)::numeric(14, 2) as monto,
  1::bigint as movimientos,
  'libro'::text as fuente,
  coalesce(up.entidad_id, u.entidad_id) as entidad_id,
  coalesce(up.pais_id, u.pais_id) as pais_id,
  (case when m.moneda = e.moneda then coalesce(m.monto_original, m.monto) else round(m.monto * fin_tasa(e.moneda, m.periodo), 2) end) * coalesce(p.hasta - p.desde, 1) as monto_local
from fin_movimientos m
join fin_unidades u on u.id = m.unidad_id
join fin_tipos t on t.id = m.tipo_id
join fin_entidades e on e.id = u.entidad_id
left join partes p on p.movimiento_id = m.id
left join fin_unidades up on up.id = p.unidad_id
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

comment on view fin_eerr_movimientos is 'Portal AF4 360°: lo que entra al EERR (libro con EERR = SI y, si fin_config lo pide, la depreciación), con la entidad y el monto en su moneda; un movimiento con tiendas elegidas (fin_movimiento_reparto) sale partido entre ellas.';

-- ---------------------------------------------------------------------------------------------
-- 2. Lo pagó otra empresa
-- ---------------------------------------------------------------------------------------------
alter table fin_grupo_movimientos add column if not exists movimiento_id uuid references fin_movimientos(id) on delete cascade;
create unique index if not exists fin_grupo_mov_movimiento on fin_grupo_movimientos (movimiento_id) where movimiento_id is not null;

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
  alter table fin_grupo_movimientos add constraint fin_grupo_movimientos_origen_check check (origen in ('manual', 'clickup', 'libro'));
end $$;

comment on column fin_grupo_movimientos.movimiento_id is 'Portal AF4 360°: el movimiento del libro que generó esta deuda (una empresa pagó un gasto de otra).';

-- ---------------------------------------------------------------------------------------------
-- 3. Bien de uso desde el movimiento
-- ---------------------------------------------------------------------------------------------
alter table fin_bienes_uso add column if not exists movimiento_id uuid references fin_movimientos(id) on delete set null;
create unique index if not exists fin_bienes_uso_movimiento on fin_bienes_uso (movimiento_id) where movimiento_id is not null;

comment on column fin_bienes_uso.movimiento_id is 'Portal AF4 360°: la compra del libro de movimientos que dio de alta este bien.';
