-- Portal AF4 360°: estados financieros ampliados (mejoras 27 a 36 de «Estados financieros»).
--
-- 1. INTERCOMPAÑÍA: `fin_tipos.intercompania` y `fin_movimientos.intercompania`. Un movimiento es intercompañía si lo
--    está él o su tipo. El EERR consolidado (todas las entidades juntas) los deja fuera; el de cada entidad, no.
--    Al crear la columna se marcan los tipos INTERCOMPANY… y los préstamos y compensaciones entre tiendas.
-- 2. CANAL DE VENTA de cada unidad (`fin_unidades.canal`: shopify, dropi, whatsapp, clicksi, otro; vacío = sin canal).
--    Al crear la columna se sugiere: CLICKSI → clicksi, ECOMFIVE → dropi, una tienda con órdenes de Shopify
--    (`ven_ordenes`) → shopify. Se corrige en Estado de resultados › Ajustes.
-- 3. BASE DE REPARTO de A DISTRIBUIR (`fin_config.base_reparto`: envios —la de siempre—, ventas o margen). La vista
--    `fin_eerr_mensual` y `fin_reparto_pendiente` usan la base guardada; el portal deja ver el EERR con otra base sin
--    guardarla. Mismas columnas que la 0136.
-- 4. `fin_eerr_partes`: lo que entra al EERR por mes, unidad (también A DISTRIBUIR, sin repartir) y tipo, con la parte
--    intercompañía aparte. Con ella el portal reparte con cualquier base y arma el consolidado con eliminaciones.
-- 5. NOTAS a los estados financieros por mes (`fin_notas_mes`, texto con el formato simple de los manuales, nunca HTML).
--
-- RLS activado y sin políticas (SEGURIDAD.md). Vistas con `security_invoker = true`. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Intercompañía
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fin_tipos' and column_name = 'intercompania') then
    alter table fin_tipos add column intercompania boolean not null default false;
    update fin_tipos set intercompania = true
    where nombre ilike 'INTERCOMPANY%' or nombre in ('Prestamos Intertiendas', 'Compensación Deuda Intertiendas');
  end if;
end $$;

alter table fin_movimientos add column if not exists intercompania boolean not null default false;
create index if not exists fin_movimientos_intercompania on fin_movimientos (periodo) where intercompania;

comment on column fin_tipos.intercompania is 'Portal AF4 360°: los movimientos de este tipo son entre empresas del grupo y no entran al EERR consolidado.';
comment on column fin_movimientos.intercompania is 'Portal AF4 360°: movimiento entre empresas del grupo (además de los de un tipo intercompañía); fuera del EERR consolidado.';

-- ---------------------------------------------------------------------------------------------
-- 2. Canal de venta
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fin_unidades' and column_name = 'canal') then
    alter table fin_unidades add column canal text;
    alter table fin_unidades add constraint fin_unidades_canal_check
      check (canal is null or canal in ('shopify', 'dropi', 'whatsapp', 'clicksi', 'otro'));
    update fin_unidades set canal = 'clicksi' where clase = 'tienda' and nombre ilike '%CLICKSI%';
    update fin_unidades set canal = 'dropi' where canal is null and clase = 'tienda' and nombre ilike 'ECOMFIVE%';
    if to_regclass('ven_ordenes') is not null then
      execute 'update fin_unidades u set canal = ''shopify'' where canal is null and clase = ''tienda''
               and exists (select 1 from ven_ordenes o where o.unidad_id = u.id)';
    end if;
  end if;
end $$;

comment on column fin_unidades.canal is 'Portal AF4 360°: canal de venta de la tienda (shopify, dropi, whatsapp, clicksi, otro); vacío = sin canal.';

-- ---------------------------------------------------------------------------------------------
-- 3. Base de reparto
-- ---------------------------------------------------------------------------------------------
insert into fin_config (clave, valor) values ('base_reparto', '"envios"'::jsonb)
on conflict (clave) do nothing;

-- Mismas columnas que la 0136. Cambia solo el peso de cada tienda en el reparto: envíos del mes (la base de siempre),
-- ventas netas del mes o margen bruto del mes (los dos, de lo cargado directo a la tienda; solo pesos positivos).
create or replace view fin_eerr_mensual
with (security_invoker = true) as
with cfg as (
  select coalesce((select c.valor #>> '{}' from fin_config c where c.clave = 'base_reparto'), 'envios') as base
),
movs as (
  select e.periodo, e.unidad_id, e.clase, e.tipo_id, e.monto, e.monto_local, e.entidad_id, t.seccion, t.signo
  from fin_eerr_movimientos e
  join fin_tipos t on t.id = e.tipo_id
),
pesos as (
  select b.periodo, b.unidad_id, b.envios::numeric as peso
  from fin_base_distribucion b cross join cfg
  where cfg.base not in ('ventas', 'margen')
  union all
  select m.periodo, m.unidad_id, sum(m.monto * m.signo)
  from movs m cross join cfg
  where cfg.base = 'ventas' and m.clase <> 'reparto' and m.seccion = 'ingresos'
  group by m.periodo, m.unidad_id
  union all
  select m.periodo, m.unidad_id, sum(m.monto * m.signo)
  from movs m cross join cfg
  where cfg.base = 'margen' and m.clase <> 'reparto' and m.seccion in ('ingresos', 'costo_ventas')
  group by m.periodo, m.unidad_id
),
base as (
  select p.periodo, p.unidad_id, u.entidad_id,
         p.peso / nullif(sum(p.peso) over (partition by p.periodo, u.entidad_id), 0) as participacion
  from pesos p
  join fin_unidades u on u.id = p.unidad_id
  where u.recibe_reparto and p.peso > 0
),
directo as (
  select periodo, unidad_id, tipo_id, sum(monto) as monto, sum(monto_local) as monto_local
  from movs where clase <> 'reparto'
  group by 1, 2, 3
),
repartido as (
  select m.periodo, b.unidad_id, m.tipo_id, sum(m.monto * b.participacion) as monto, sum(m.monto_local * b.participacion) as monto_local
  from movs m
  join base b on b.periodo = m.periodo and b.entidad_id = m.entidad_id
  where m.clase = 'reparto'
  group by 1, 2, 3
),
juntos as (
  select periodo, unidad_id, tipo_id, monto as directo, 0::numeric as repartido, monto_local from directo
  union all
  select periodo, unidad_id, tipo_id, 0, monto, monto_local from repartido
)
select
  j.periodo,
  j.unidad_id,
  j.tipo_id,
  t.seccion,
  t.signo,
  round(sum(j.directo), 2) as monto_directo,
  round(sum(j.repartido), 2) as monto_repartido,
  round(sum(j.directo + j.repartido), 2) as monto,
  round(sum(j.directo + j.repartido) * t.signo, 2) as efecto_resultado,
  u.entidad_id,
  u.pais_id,
  round(sum(j.monto_local), 2) as monto_local
from juntos j
join fin_tipos t on t.id = j.tipo_id
join fin_unidades u on u.id = j.unidad_id
group by j.periodo, j.unidad_id, j.tipo_id, t.seccion, t.signo, u.entidad_id, u.pais_id;

comment on view fin_eerr_mensual is 'Portal AF4 360°: EERR por mes, tienda y tipo en USD (monto_local: en la moneda de la entidad); A DISTRIBUIR repartido dentro de cada entidad con la base de fin_config.base_reparto (envíos, ventas o margen bruto).';

-- Lo que quedó en A DISTRIBUIR de una entidad en un mes sin base (con la base guardada) en esa entidad.
create or replace view fin_reparto_pendiente
with (security_invoker = true) as
with cfg as (
  select coalesce((select c.valor #>> '{}' from fin_config c where c.clave = 'base_reparto'), 'envios') as base
),
movs as (
  select e.periodo, e.unidad_id, e.clase, e.monto, t.seccion, t.signo
  from fin_eerr_movimientos e
  join fin_tipos t on t.id = e.tipo_id
),
con_base as (
  select b.periodo, u.entidad_id
  from fin_base_distribucion b
  join fin_unidades u on u.id = b.unidad_id
  cross join cfg
  where cfg.base not in ('ventas', 'margen') and u.recibe_reparto and b.envios > 0
  union
  select m.periodo, u.entidad_id
  from movs m
  join fin_unidades u on u.id = m.unidad_id
  cross join cfg
  where cfg.base in ('ventas', 'margen') and u.recibe_reparto and m.clase <> 'reparto'
    and (m.seccion = 'ingresos' or (cfg.base = 'margen' and m.seccion = 'costo_ventas'))
  group by m.periodo, u.entidad_id, m.unidad_id
  having sum(m.monto * m.signo) > 0
)
select e.periodo, round(sum(e.monto), 2) as monto, sum(e.movimientos)::bigint as movimientos, e.entidad_id
from fin_eerr_movimientos e
where e.clase = 'reparto'
  and not exists (select 1 from con_base c where c.periodo = e.periodo and c.entidad_id = e.entidad_id)
group by e.periodo, e.entidad_id;

-- ---------------------------------------------------------------------------------------------
-- 4. Partes del EERR (sin repartir), con la parte intercompañía
-- ---------------------------------------------------------------------------------------------
create or replace view fin_eerr_partes
with (security_invoker = true) as
with ic as (
  select m.periodo, m.unidad_id, m.tipo_id,
    sum(m.monto) as monto,
    sum(case when m.moneda = e.moneda then coalesce(m.monto_original, m.monto) else round(m.monto * fin_tasa(e.moneda, m.periodo), 2) end) as monto_local
  from fin_movimientos m
  join fin_unidades u on u.id = m.unidad_id
  join fin_tipos t on t.id = m.tipo_id
  join fin_entidades e on e.id = u.entidad_id
  where m.en_eerr
    and (m.intercompania or t.intercompania)
    and t.seccion in ('ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros', 'depreciacion', 'impuesto_ganancias')
    and (m.moneda = 'USD' or m.tasa_usd is not null)
  group by 1, 2, 3
),
todo as (
  select periodo, unidad_id, clase, tipo_id, entidad_id,
    sum(monto) as monto, sum(monto_local) as monto_local, sum(movimientos) as movimientos
  from fin_eerr_movimientos
  group by 1, 2, 3, 4, 5
)
select
  t.periodo,
  t.unidad_id,
  t.clase,
  t.entidad_id,
  t.tipo_id,
  ft.seccion,
  ft.signo,
  round(t.monto, 2) as monto,
  round(t.monto_local, 2) as monto_local,
  t.movimientos::bigint as movimientos,
  round(coalesce(ic.monto, 0), 2) as monto_ic,
  round(coalesce(ic.monto_local, 0), 2) as monto_ic_local
from todo t
join fin_tipos ft on ft.id = t.tipo_id
left join ic on ic.periodo = t.periodo and ic.unidad_id = t.unidad_id and ic.tipo_id = t.tipo_id;

comment on view fin_eerr_partes is 'Portal AF4 360°: lo que entra al EERR por mes, unidad (A DISTRIBUIR sin repartir) y tipo, con la parte intercompañía (monto_ic).';

-- ---------------------------------------------------------------------------------------------
-- 5. Notas a los estados financieros
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_notas_mes (
  -- Primer día del mes al que se refieren las notas.
  periodo date primary key check (extract(day from periodo) = 1),
  -- Formato simple de los manuales («## título», «- punto», «1. paso»); se muestra como texto, nunca como HTML.
  texto text not null check (length(texto) <= 20000),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

alter table fin_notas_mes enable row level security;

comment on table fin_notas_mes is 'Portal AF4 360°: notas a los estados financieros de cada mes (EERR, balance e informe).';
