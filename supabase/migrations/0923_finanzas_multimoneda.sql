-- Portal AF4 360°: Costa Rica y multimoneda en el portal financiero (ver FINANZAS-360.md, mejora 29).
--
-- Hasta ahora todo el portal financiero era una sola empresa en dólares. Esta migración agrega:
--
-- 1. ENTIDADES (`fin_entidades`): cada empresa del grupo con su país y su moneda funcional (Panamá USD, Costa Rica
--    CRC). Cada unidad (`fin_unidades`) pertenece a una entidad (`entidad_id`) y a un país (`pais_id`); el texto `pais`
--    de la 0114 se mantiene igual a la entidad (lo sincroniza un disparador). Las unidades que llevan «COSTA RICA» en el
--    nombre pasan a Costa Rica; todas las demás quedan en Panamá. Cada cuenta (`fin_cuentas`) también tiene entidad y
--    moneda: el flujo de una entidad es el de sus cuentas (la caja está donde está la cuenta).
-- 2. MONEDA DEL MOVIMIENTO (`fin_movimientos.moneda`, `monto_original`, `tasa_usd`). `monto` sigue siendo dólares: es lo
--    que suman todas las vistas. Un movimiento en otra moneda guarda lo que dice el libro en `monto_original` y la base
--    calcula `monto` = `monto_original` / `tasa_usd` con el promedio del mes (`fin_tipos_cambio_mes`). Sin tasa para ese
--    mes, `monto` queda en 0 y `tasa_usd` vacía: el movimiento queda «sin tasa» y no entra al EERR ni al flujo hasta
--    cargarla (`fin_movimientos_sin_tasa`). Al cargar o cambiar la tasa de un mes, sus movimientos se recalculan solos
--    (salvo los de un mes cerrado). Lo de Panamá (todo USD) no cambia: los movimientos en dólares no se tocan.
-- 3. TIPOS DE CAMBIO POR MES (`fin_tipos_cambio_mes`): unidades de la moneda por 1 USD, promedio y cierre de cada mes,
--    completados desde los diarios (`tipos_cambio`, migración 0107) o escritos a mano. El EERR convierte con el promedio
--    del mes; los saldos (cuentas, cartera) con el cierre. Un mes cerrado no deja cambiar su tasa.
-- 4. VISTAS por entidad, con las mismas columnas de antes y tres nuevas al final:
--    · `fin_eerr_movimientos` y `fin_eerr_mensual`: `entidad_id`, `pais_id` y `monto_local` (en la moneda de la
--      entidad). A DISTRIBUIR se reparte POR ENTIDAD: lo de una entidad solo entre las tiendas de esa entidad.
--    · `fin_reparto_pendiente`: una fila por mes y entidad.
--    · `fin_flujo_mensual`: `entidad_id` (la de la cuenta; sin cuenta, la de la unidad), `moneda_cuenta`, `monto_cuenta`
--      (en la moneda de la cuenta, para su saldo) y `monto_local`.
-- 5. CARTERA en su moneda (`fin_cartera.moneda` acepta otras monedas; los abonos van en la moneda del documento).
--    `fin_cartera_al` devuelve dólares (al cierre del mes del corte) y `fin_cartera_entidad_al` da el saldo por
--    entidad y moneda.
--
-- RLS activado y sin políticas (SEGURIDAD.md). Vistas con `security_invoker = true`; las funciones solo las llama el
-- servidor. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Entidades
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_entidades (
  id uuid primary key default gen_random_uuid(),
  -- Código del país (PA, CR): es también el sufijo de las unidades de esta entidad que repiten un nombre de otra.
  codigo text not null unique check (codigo ~ '^[A-Z]{2}$'),
  razon_social text not null check (length(trim(razon_social)) > 0),
  pais_id uuid references paises(id),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table fin_entidades enable row level security;

insert into fin_entidades (codigo, razon_social, moneda, orden) values
  ('PA', 'Panamá', 'USD', 10),
  ('CR', 'Costa Rica', 'CRC', 20)
on conflict (codigo) do nothing;

update fin_entidades e set pais_id = p.id from paises p where e.pais_id is null and p.codigo = e.codigo;

comment on table fin_entidades is 'Portal AF4 360°: empresas del grupo (razón social, país y moneda funcional) para el EERR y el flujo por entidad.';

-- ---------------------------------------------------------------------------------------------
-- Unidades: país y entidad
-- ---------------------------------------------------------------------------------------------
alter table fin_unidades add column if not exists pais_id uuid references paises(id);
alter table fin_unidades add column if not exists entidad_id uuid references fin_entidades(id);

-- Primera vez: lo que dice «COSTA RICA» es de Costa Rica (las unidades del libro de Panamá que ya existen).
update fin_unidades set pais = 'CR' where entidad_id is null and nombre ilike '%COSTA RICA%';
update fin_unidades u set entidad_id = e.id
from fin_entidades e
where u.entidad_id is null and e.codigo = coalesce(nullif(upper(trim(u.pais)), ''), 'PA');
update fin_unidades set entidad_id = (select id from fin_entidades where codigo = 'PA') where entidad_id is null;
update fin_unidades u set pais_id = e.pais_id, pais = e.codigo
from fin_entidades e
where e.id = u.entidad_id and (u.pais_id is distinct from coalesce(e.pais_id, u.pais_id) or u.pais is distinct from e.codigo);

-- Mantiene juntos entidad, país y el texto `pais`. Manda lo que cambió: la entidad; si no, el país (por id o por código).
create or replace function fin_unidades_entidad() returns trigger
language plpgsql set search_path = public as $$
declare
  v_codigo text;
  v_ent fin_entidades%rowtype;
begin
  if tg_op = 'UPDATE' and new.entidad_id is not distinct from old.entidad_id then
    if new.pais_id is distinct from old.pais_id then
      new.entidad_id := null;
    elsif new.pais is distinct from old.pais then
      new.entidad_id := null;
      new.pais_id := null;
    end if;
  end if;
  if new.entidad_id is null then
    if new.pais_id is not null then
      select codigo into v_codigo from paises where id = new.pais_id;
    end if;
    v_codigo := coalesce(v_codigo, nullif(upper(trim(new.pais)), ''), 'PA');
    select * into v_ent from fin_entidades where codigo = v_codigo;
    if not found then
      raise exception 'No hay una entidad para el país %.', v_codigo using errcode = 'FM001';
    end if;
  else
    select * into v_ent from fin_entidades where id = new.entidad_id;
  end if;
  new.entidad_id := v_ent.id;
  new.pais := v_ent.codigo;
  new.pais_id := coalesce(v_ent.pais_id, new.pais_id);
  return new;
end $$;

drop trigger if exists fin_unidades_entidad on fin_unidades;
create trigger fin_unidades_entidad before insert or update of pais, pais_id, entidad_id on fin_unidades
for each row execute function fin_unidades_entidad();

alter table fin_unidades alter column entidad_id set not null;
create index if not exists fin_unidades_entidad on fin_unidades (entidad_id);

-- A DISTRIBUIR de Costa Rica: lo que se reparte entre las tiendas de Costa Rica.
insert into fin_unidades (nombre, clase, recibe_reparto, pais, orden)
values ('A DISTRIBUIR CR', 'reparto', false, 'CR', 105)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Cuentas: entidad y moneda (el saldo inicial de una cuenta va en su moneda)
-- ---------------------------------------------------------------------------------------------
alter table fin_cuentas add column if not exists moneda text not null default 'USD';
alter table fin_cuentas add column if not exists entidad_id uuid references fin_entidades(id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_cuentas_moneda_check') then
    alter table fin_cuentas add constraint fin_cuentas_moneda_check check (moneda ~ '^[A-Z]{3}$');
  end if;
end $$;
update fin_cuentas set entidad_id = (select id from fin_entidades where codigo = 'PA') where entidad_id is null;
alter table fin_cuentas alter column entidad_id set default null;

comment on column fin_saldos_iniciales.monto is 'Saldo al comenzar el mes, en la moneda de la cuenta (fin_cuentas.moneda).';

-- ---------------------------------------------------------------------------------------------
-- 3. Tipos de cambio por mes
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_tipos_cambio_mes (
  moneda text not null check (moneda ~ '^[A-Z]{3}$' and moneda <> 'USD'),
  -- Primer día del mes.
  periodo date not null check (extract(day from periodo) = 1),
  -- Unidades de la moneda por 1 USD.
  promedio numeric(18, 6) not null check (promedio > 0),
  cierre numeric(18, 6) not null check (cierre > 0),
  -- automatico: sale de los diarios (`tipos_cambio`) · manual: escrito en el portal (completar no lo pisa).
  origen text not null default 'manual' check (origen in ('automatico', 'manual')),
  -- Cuántos días con cotización tuvo el promedio automático.
  dias integer,
  nota text check (nota is null or length(nota) <= 300),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  primary key (moneda, periodo)
);

alter table fin_tipos_cambio_mes enable row level security;

comment on table fin_tipos_cambio_mes is 'Portal AF4 360°: tipo de cambio de cada mes (unidades por 1 USD): promedio para el EERR, cierre para los saldos.';

-- Unidades de `p_moneda` por 1 USD en el mes de `p_periodo`. USD = 1. Promedio: solo el del mes (sin él, null: «sin
-- tasa»). Cierre: el del mes o, si todavía no está, el último anterior (un saldo de hoy se valora con lo último que hay).
create or replace function fin_tasa(p_moneda text, p_periodo date, p_clase text default 'promedio') returns numeric
language sql stable set search_path = public as $$
  select case
    when p_moneda is null or p_moneda = 'USD' then 1::numeric
    when p_clase = 'cierre' then (
      select t.cierre from fin_tipos_cambio_mes t
      where t.moneda = p_moneda and t.periodo <= date_trunc('month', p_periodo)::date
      order by t.periodo desc limit 1
    )
    else (
      select t.promedio from fin_tipos_cambio_mes t
      where t.moneda = p_moneda and t.periodo = date_trunc('month', p_periodo)::date
    )
  end
$$;

-- Completa los meses desde los tipos de cambio diarios (`tipos_cambio`): promedio del mes y la cotización del último día
-- con dato. No pisa lo escrito a mano ni los meses cerrados. Devuelve cuántos meses guardó.
create or replace function fin_tipos_cambio_completar(p_moneda text default null, p_desde date default null)
returns integer
language plpgsql set search_path = public as $$
declare
  v_n integer;
begin
  if to_regclass('tipos_cambio') is null then
    return 0;
  end if;
  with diarios as (
    select d.moneda, date_trunc('month', d.fecha)::date as periodo, d.fecha, d.por_usd
    from tipos_cambio d
    where d.moneda <> 'USD'
      and (p_moneda is null or d.moneda = p_moneda)
      and (p_desde is null or d.fecha >= date_trunc('month', p_desde)::date)
  ),
  meses as (
    select moneda, periodo, round(avg(por_usd), 6) as promedio, count(*)::integer as dias,
           (array_agg(por_usd order by fecha desc))[1] as cierre
    from diarios
    group by moneda, periodo
  )
  insert into fin_tipos_cambio_mes (moneda, periodo, promedio, cierre, origen, dias, actualizado_en)
  select m.moneda, m.periodo, m.promedio, round(m.cierre, 6), 'automatico', m.dias, now()
  from meses m
  where not fin_mes_cerrado(m.periodo)
  on conflict (moneda, periodo) do update set
    promedio = excluded.promedio,
    cierre = excluded.cierre,
    dias = excluded.dias,
    actualizado_por = null,
    actualizado_en = now()
  where fin_tipos_cambio_mes.origen = 'automatico'
    and (fin_tipos_cambio_mes.promedio, fin_tipos_cambio_mes.cierre, fin_tipos_cambio_mes.dias)
        is distinct from (excluded.promedio, excluded.cierre, excluded.dias);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Moneda del movimiento
-- ---------------------------------------------------------------------------------------------
alter table fin_movimientos add column if not exists moneda text not null default 'USD';
alter table fin_movimientos add column if not exists monto_original numeric(16, 2);
alter table fin_movimientos add column if not exists tasa_usd numeric(18, 6);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_movimientos_moneda_check') then
    alter table fin_movimientos add constraint fin_movimientos_moneda_check check (
      moneda ~ '^[A-Z]{3}$'
      and (moneda = 'USD' or monto_original is not null)
      and (tasa_usd is null or tasa_usd > 0)
    );
  end if;
end $$;

create index if not exists fin_movimientos_moneda on fin_movimientos (moneda, periodo) where moneda <> 'USD';

-- Un movimiento en otra moneda: dólares = original / promedio del mes. Corre antes que el bloqueo del cierre
-- (`fin_movimientos_cierre`, los disparadores van por nombre), así el cierre ve el monto ya convertido. Recalcula al
-- crearlo, al cambiar su moneda, su monto original o su mes, o si se le borró la tasa (lo hace el cambio de una tasa).
create or replace function fin_movimientos_moneda() returns trigger
language plpgsql set search_path = public as $$
declare
  v_tasa numeric;
begin
  if new.moneda = 'USD' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.moneda is not distinct from old.moneda
     and new.monto_original is not distinct from old.monto_original
     and new.periodo is not distinct from old.periodo
     and new.tasa_usd is not null then
    return new;
  end if;
  v_tasa := fin_tasa(new.moneda, new.periodo, 'promedio');
  new.tasa_usd := v_tasa;
  new.monto := case when v_tasa is null then 0 else round(new.monto_original / v_tasa, 2) end;
  return new;
end $$;

drop trigger if exists fin_movimientos_a_moneda on fin_movimientos;
create trigger fin_movimientos_a_moneda before insert or update on fin_movimientos
for each row execute function fin_movimientos_moneda();

-- Al cargar, cambiar o borrar la tasa de un mes: sus movimientos en esa moneda se recalculan (los de un mes cerrado, no).
create or replace function fin_tipos_cambio_aplicar() returns trigger
language plpgsql set search_path = public as $$
declare
  v_moneda text := case when tg_op = 'DELETE' then old.moneda else new.moneda end;
  v_periodo date := case when tg_op = 'DELETE' then old.periodo else new.periodo end;
begin
  if tg_op = 'UPDATE' and new.promedio = old.promedio then
    return null;
  end if;
  update fin_movimientos m set tasa_usd = null, actualizado_en = now()
  where m.moneda = v_moneda
    and m.periodo = v_periodo
    and not fin_mes_cerrado(m.periodo)
    and not fin_mes_cerrado(coalesce(m.fecha_pago, m.periodo));
  return null;
end $$;

drop trigger if exists fin_tipos_cambio_aplicar on fin_tipos_cambio_mes;
create trigger fin_tipos_cambio_aplicar after insert or update or delete on fin_tipos_cambio_mes
for each row execute function fin_tipos_cambio_aplicar();

-- Un mes cerrado no deja cambiar su tasa (el mismo bloqueo de la 0127: `fin_meses_de_fila` lee `periodo`).
drop trigger if exists fin_tipos_cambio_mes_cierre on fin_tipos_cambio_mes;
create trigger fin_tipos_cambio_mes_cierre before insert or update or delete on fin_tipos_cambio_mes
for each row execute function fin_bloqueo_cierre();

-- Movimientos en otra moneda que esperan la tasa de su mes.
create or replace view fin_movimientos_sin_tasa
with (security_invoker = true) as
select periodo, moneda, count(*) as movimientos, round(sum(monto_original), 2) as monto_original
from fin_movimientos
where moneda <> 'USD' and tasa_usd is null
group by periodo, moneda;

-- ---------------------------------------------------------------------------------------------
-- 4. EERR por entidad (mismas columnas que la 0130 y, al final, entidad_id, pais_id y monto_local)
-- ---------------------------------------------------------------------------------------------
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

comment on view fin_eerr_movimientos is 'Portal AF4 360°: lo que entra al EERR (libro con EERR = SI y, si fin_config lo pide, la depreciación), con la entidad y el monto en su moneda.';

create or replace view fin_eerr_mensual
with (security_invoker = true) as
with movs as (
  select periodo, unidad_id, clase, tipo_id, monto, monto_local, entidad_id from fin_eerr_movimientos
),
base as (
  select b.periodo, b.unidad_id, u.entidad_id, b.envios,
         b.envios::numeric / nullif(sum(b.envios) over (partition by b.periodo, u.entidad_id), 0) as participacion
  from fin_base_distribucion b
  join fin_unidades u on u.id = b.unidad_id
  where u.recibe_reparto and b.envios > 0
),
directo as (
  select periodo, unidad_id, tipo_id, sum(monto) as monto, sum(monto_local) as monto_local
  from movs where clase <> 'reparto'
  group by 1, 2, 3
),
repartido as (
  -- Lo de A DISTRIBUIR de una entidad, solo entre las tiendas de esa entidad.
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

comment on view fin_eerr_mensual is 'Portal AF4 360°: EERR por mes, tienda y tipo en USD (monto_local: en la moneda de la entidad); A DISTRIBUIR repartido por envíos dentro de cada entidad.';

-- Lo que quedó en A DISTRIBUIR de una entidad en un mes sin base de envíos en esa entidad.
create or replace view fin_reparto_pendiente
with (security_invoker = true) as
select e.periodo, round(sum(e.monto), 2) as monto, sum(e.movimientos)::bigint as movimientos, e.entidad_id
from fin_eerr_movimientos e
where e.clase = 'reparto'
  and not exists (
    select 1 from fin_base_distribucion b join fin_unidades bu on bu.id = b.unidad_id
    where b.periodo = e.periodo and bu.recibe_reparto and b.envios > 0 and bu.entidad_id = e.entidad_id
  )
group by e.periodo, e.entidad_id;

-- ---------------------------------------------------------------------------------------------
-- Flujo por entidad (mismas columnas que la 0117 y, al final, entidad, moneda y montos de la cuenta y de la entidad)
-- ---------------------------------------------------------------------------------------------
create or replace view fin_flujo_mensual
with (security_invoker = true) as
with movs as (
  select
    date_trunc('month', coalesce(m.fecha_pago, m.periodo))::date as mes,
    m.cuenta_id,
    m.unidad_id,
    m.tipo_id,
    case
      when t.seccion = 'pago_tdc' then 'traspaso'
      when t.id is null then 'sin_clasificar'
      when m.es_bien_de_uso then 'inversion'
      else coalesce(t.bloque_flujo, 'operativo')
    end as bloque,
    case when coalesce(t.signo, -1) = 1 then 'entrada' else 'salida' end as sentido,
    m.monto,
    -- La caja está donde está la cuenta: sin cuenta, la entidad de la unidad.
    coalesce(c.entidad_id, u.entidad_id) as entidad_id,
    coalesce(c.moneda, 'USD') as moneda_cuenta,
    case
      when m.moneda = coalesce(c.moneda, 'USD') then coalesce(m.monto_original, m.monto)
      else round(m.monto * fin_tasa(coalesce(c.moneda, 'USD'), m.periodo), 2)
    end as monto_cuenta,
    m.periodo,
    m.moneda,
    m.monto_original
  from fin_movimientos m
  join fin_unidades u on u.id = m.unidad_id
  left join fin_tipos t on t.id = m.tipo_id
  left join fin_cuentas c on c.id = m.cuenta_id
  where ((m.en_flujo and coalesce(t.seccion, '') not in ('informacion', 'pago_tdc'))
     or t.seccion = 'pago_tdc')
    and (m.moneda = 'USD' or m.tasa_usd is not null)
),
con_local as (
  select movs.*,
    case
      when movs.moneda = e.moneda then coalesce(movs.monto_original, movs.monto)
      else round(movs.monto * fin_tasa(e.moneda, movs.periodo), 2)
    end as monto_local
  from movs
  join fin_entidades e on e.id = movs.entidad_id
)
select mes, cuenta_id, unidad_id, tipo_id, bloque, sentido, count(*)::integer as movimientos, round(sum(monto), 2) as monto,
  entidad_id, moneda_cuenta, round(sum(monto_cuenta), 2) as monto_cuenta, round(sum(monto_local), 2) as monto_local
from con_local
group by mes, cuenta_id, unidad_id, tipo_id, bloque, sentido, entidad_id, moneda_cuenta;

comment on view fin_flujo_mensual is 'Portal AF4 360°: flujo de caja por mes de pago, cuenta, tienda, tipo y bloque, en USD y en la moneda de la cuenta y de la entidad.';

-- ---------------------------------------------------------------------------------------------
-- 5. Cartera en su moneda
-- ---------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_cartera'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%moneda%' and c.conname <> 'fin_cartera_moneda_iso'
  loop
    execute format('alter table fin_cartera drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'fin_cartera_moneda_iso') then
    alter table fin_cartera add constraint fin_cartera_moneda_iso check (moneda ~ '^[A-Z]{3}$');
  end if;
end $$;

comment on column fin_cartera.monto is 'Monto del documento en su moneda (fin_cartera.moneda); los abonos van en la misma moneda.';

-- Igual que en la 0118, en dólares: un documento en otra moneda se valora con el tipo de cambio de cierre del mes del
-- corte (o el último anterior). Sin ninguna tasa no suma (aparece en `fin_cartera_entidad_al` como saldo sin dólares).
create or replace function fin_cartera_al(p_corte date default null)
returns table (
  clase text,
  unidad_id uuid,
  documentos bigint,
  saldo numeric,
  vencido numeric,
  tramo_0_30 numeric,
  tramo_31_60 numeric,
  tramo_61_90 numeric,
  tramo_90_mas numeric,
  sin_fecha numeric,
  incobrable numeric
)
language sql stable
set search_path = public
as $$
  with corte as (select coalesce(p_corte, fin_cartera_hoy()) as dia),
  docs as (
    select
      d.clase,
      d.unidad_id,
      d.fecha,
      d.estado_manual,
      coalesce(d.vencimiento, d.fecha + 30) as vence,
      (d.monto - coalesce((
        select sum(a.monto) from fin_cartera_abonos a
        where a.documento_id = d.id and (a.fecha is null or a.fecha <= (select dia from corte))
      ), 0)) as saldo_original,
      case when d.moneda = 'USD' then 1::numeric else fin_tasa(d.moneda, (select dia from corte), 'cierre') end as tasa
    from fin_cartera d
    where (d.fecha is null or d.fecha <= (select dia from corte))
      and d.estado_manual is distinct from 'anulado'
  ),
  vivos as (
    select docs.*,
      case when docs.tasa = 1 then docs.saldo_original else docs.saldo_original / docs.tasa end as saldo,
      case when fecha is null then null else (select dia from corte) - fecha end as dias
    from docs
    where saldo_original > 0.005
  )
  select
    v.clase,
    v.unidad_id,
    count(*) filter (where v.estado_manual is null),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.vence < (select dia from corte)), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias <= 30), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias between 31 and 60), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias between 61 and 90), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias > 90), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual is null and v.dias is null), 0), 2),
    round(coalesce(sum(v.saldo) filter (where v.estado_manual = 'incobrable'), 0), 2)
  from vivos v
  group by v.clase, v.unidad_id
$$;

-- Por entidad y moneda a una fecha de corte: saldo en su moneda y en dólares (cierre), vencido en dólares. La entidad
-- es la de la tienda; sin tienda, la que tiene esa moneda (o Panamá).
create or replace function fin_cartera_entidad_al(p_corte date default null)
returns table (
  entidad_id uuid,
  clase text,
  moneda text,
  documentos bigint,
  saldo_original numeric,
  saldo numeric,
  vencido numeric,
  tramo_90_mas numeric,
  sin_tasa boolean
)
language sql stable
set search_path = public
as $$
  with corte as (select coalesce(p_corte, fin_cartera_hoy()) as dia),
  docs as (
    select
      coalesce(
        u.entidad_id,
        (select e.id from fin_entidades e where e.moneda = d.moneda order by e.orden limit 1),
        (select e.id from fin_entidades e where e.codigo = 'PA')
      ) as entidad_id,
      d.clase,
      d.moneda,
      d.fecha,
      coalesce(d.vencimiento, d.fecha + 30) as vence,
      d.monto - coalesce((
        select sum(a.monto) from fin_cartera_abonos a
        where a.documento_id = d.id and (a.fecha is null or a.fecha <= (select dia from corte))
      ), 0) as saldo_original,
      fin_tasa(d.moneda, (select dia from corte), 'cierre') as tasa
    from fin_cartera d
    left join fin_unidades u on u.id = d.unidad_id
    where (d.fecha is null or d.fecha <= (select dia from corte))
      and d.estado_manual is null
  )
  select
    entidad_id,
    clase,
    moneda,
    count(*),
    round(sum(saldo_original), 2),
    round(coalesce(sum(saldo_original / tasa), 0), 2),
    round(coalesce(sum(saldo_original / tasa) filter (where vence < (select dia from corte)), 0), 2),
    round(coalesce(sum(saldo_original / tasa) filter (where (select dia from corte) - fecha > 90), 0), 2),
    bool_or(tasa is null)
  from docs
  where saldo_original > 0.005
  group by entidad_id, clase, moneda
$$;

-- Las funciones solo las llama el servidor (clave de servicio).
revoke all on function fin_tasa(text, date, text) from public;
revoke all on function fin_tipos_cambio_completar(text, date) from public;
revoke all on function fin_cartera_al(date) from public;
revoke all on function fin_cartera_entidad_al(date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_tasa(text, date, text) from anon, authenticated';
    execute 'revoke all on function fin_tipos_cambio_completar(text, date) from anon, authenticated';
    execute 'revoke all on function fin_cartera_al(date) from anon, authenticated';
    execute 'revoke all on function fin_cartera_entidad_al(date) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function fin_tasa(text, date, text) to service_role';
    execute 'grant execute on function fin_tipos_cambio_completar(text, date) to service_role';
    execute 'grant execute on function fin_cartera_entidad_al(date) to service_role';
  end if;
end $$;

comment on function fin_tasa(text, date, text) is 'Portal AF4 360°: unidades de una moneda por 1 USD en un mes (promedio o cierre).';
comment on function fin_tipos_cambio_completar(text, date) is 'Portal AF4 360°: completa fin_tipos_cambio_mes desde los tipos de cambio diarios (no pisa lo manual).';
comment on function fin_cartera_entidad_al(date) is 'Portal AF4 360°: por cobrar / por pagar por entidad y moneda a una fecha, en su moneda y en dólares.';
