-- Portal AF4 360°: nómina y depreciación hacia el libro y el EERR, como interruptores (ver FINANZAS-360.md).
--
-- Las dos cosas ya existían pero no estaban conectadas: la depreciación de los bienes de uso (`fin_depreciacion_mensual`,
-- migración 0907) no entraba al EERR, y la nómina (migración 0906) solo se comparaba con el libro. Quedan construidas y
-- **apagadas**: se encienden en Estado de resultados › Ajustes (`fin_config`).
--
-- 1. `fin_config`: ajustes de Finanzas (clave → valor jsonb). `depreciacion_en_eerr` y `nomina_al_libro`, en false.
-- 2. Depreciación en el EERR: sección nueva `depreciacion` (la D de EBITDA: va debajo del EBITDA y antes de finanzas) y
--    tipo «Depreciación Bienes de uso». Con el interruptor encendido, `fin_eerr_mensual` suma la depreciación de cada mes
--    (lo de A DISTRIBUIR se reparte por envíos como todo lo demás) y, para no contar dos veces el mismo bien, deja fuera
--    del EERR las altas de bienes de uso del libro (tipo «Alta Bien de Uso» o movimiento marcado «bien de uso») y lo que
--    el libro tenga cargado a mano como depreciación. Lo hace la vista: apagarlo deja todo como estaba.
--    La depreciación solo se suma en los meses que cubre el libro (del primero al último con movimientos).
-- 3. Nómina al libro: `fin_nomina_al_libro` crea los sueldos del mes desde la nómina (origen 'nomina') y saca del EERR y
--    del flujo los sueldos del Excel que reemplaza (`reemplazado_por = 'nomina'`, con sus valores de antes en
--    `reemplazo_previo` para poder devolverlos con `fin_nomina_fuera_del_libro`). Todo en una transacción y por la clave
--    de origen: pasar dos veces el mismo mes actualiza, no duplica.
--
-- RLS activado y sin políticas (SEGURIDAD.md). Las vistas llevan `security_invoker = true`; las funciones solo las llama el
-- servidor. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Ajustes
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_config (
  clave text primary key,
  valor jsonb not null,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

alter table fin_config enable row level security;

insert into fin_config (clave, valor) values
  ('depreciacion_en_eerr', 'false'::jsonb),
  ('nomina_al_libro', 'false'::jsonb)
on conflict (clave) do nothing;

comment on table fin_config is 'Portal AF4 360°: ajustes de Finanzas (interruptores de depreciación en el EERR y nómina al libro).';

-- ---------------------------------------------------------------------------------------------
-- 2. Sección y tipo de depreciación
-- ---------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- El `check` de `seccion` nació sin nombre propio (0114): se busca por su definición.
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'fin_tipos'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%seccion%'
  loop
    execute format('alter table fin_tipos drop constraint %I', r.conname);
  end loop;
end $$;

alter table fin_tipos add constraint fin_tipos_seccion_check check (seccion in (
  'ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros', 'depreciacion',
  'impuesto_ganancias', 'informacion', 'patrimonial', 'pago_tdc', 'sin_clasificar'
));

-- No es una salida de caja: sin bloque de flujo.
insert into fin_tipos (nombre, seccion, signo, orden) values ('Depreciación Bienes de uso', 'depreciacion', -1, 450)
on conflict (nombre) do update set seccion = 'depreciacion', signo = -1;

-- El presupuesto también puede llevar la línea de depreciación.
do $$
declare
  r record;
begin
  if to_regclass('fin_presupuesto_lineas') is null then return; end if;
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'fin_presupuesto_lineas'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%seccion%'
  loop
    execute format('alter table fin_presupuesto_lineas drop constraint %I', r.conname);
  end loop;
  alter table fin_presupuesto_lineas add constraint fin_presupuesto_lineas_seccion_check check (seccion in (
    'ingresos', 'costo_ventas', 'administracion', 'marketing', 'depreciacion', 'finanzas', 'otros', 'impuesto_ganancias'
  ));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Lo que entra al EERR: el libro y, con el interruptor, la depreciación
-- ---------------------------------------------------------------------------------------------
create or replace view fin_eerr_movimientos
with (security_invoker = true) as
with cfg as (
  select exists (select 1 from fin_config where clave = 'depreciacion_en_eerr' and valor = 'true'::jsonb) as dep
),
rango as (
  select min(periodo) as desde, max(periodo) as hasta from fin_movimientos
)
select m.periodo, m.unidad_id, u.clase, m.tipo_id, m.monto, 1::bigint as movimientos, 'libro'::text as fuente
from fin_movimientos m
join fin_unidades u on u.id = m.unidad_id
join fin_tipos t on t.id = m.tipo_id
cross join cfg
where m.en_eerr
  and t.seccion in ('ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros', 'depreciacion', 'impuesto_ganancias')
  -- Con la depreciación calculada, el alta del bien (y una depreciación cargada a mano) ya no entran: sería contarla dos veces.
  and not (cfg.dep and (m.es_bien_de_uso or t.nombre = 'Alta Bien de Uso' or t.seccion = 'depreciacion'))
union all
select d.periodo, d.unidad_id, u.clase, td.id, d.monto, d.bienes::bigint, 'bienes_uso'
from fin_depreciacion_mensual d
join fin_unidades u on u.id = d.unidad_id
join fin_tipos td on td.nombre = 'Depreciación Bienes de uso'
cross join cfg
cross join rango
where cfg.dep and d.periodo between rango.desde and rango.hasta;

comment on view fin_eerr_movimientos is 'Portal AF4 360°: lo que entra al EERR (libro con EERR = SI y, si fin_config lo pide, la depreciación de bienes de uso).';

-- Mismas columnas que en la 0114; solo cambia de dónde lee.
create or replace view fin_eerr_mensual
with (security_invoker = true) as
with movs as (
  select periodo, unidad_id, clase, tipo_id, monto from fin_eerr_movimientos
),
base as (
  select b.periodo, b.unidad_id, b.envios,
         b.envios::numeric / nullif(sum(b.envios) over (partition by b.periodo), 0) as participacion
  from fin_base_distribucion b
  join fin_unidades u on u.id = b.unidad_id
  where u.recibe_reparto and b.envios > 0
),
directo as (
  select periodo, unidad_id, tipo_id, sum(monto) as monto
  from movs where clase <> 'reparto'
  group by 1, 2, 3
),
repartido as (
  select m.periodo, b.unidad_id, m.tipo_id, sum(m.monto * b.participacion) as monto
  from movs m
  join base b on b.periodo = m.periodo
  where m.clase = 'reparto'
  group by 1, 2, 3
),
juntos as (
  select periodo, unidad_id, tipo_id, monto as directo, 0::numeric as repartido from directo
  union all
  select periodo, unidad_id, tipo_id, 0, monto from repartido
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
  round(sum(j.directo + j.repartido) * t.signo, 2) as efecto_resultado
from juntos j
join fin_tipos t on t.id = j.tipo_id
group by j.periodo, j.unidad_id, j.tipo_id, t.seccion, t.signo;

comment on view fin_eerr_mensual is 'Portal AF4 360°: EERR por mes, tienda y tipo; A DISTRIBUIR repartido por envíos; depreciación según fin_config.';

-- Lo que quedó en A DISTRIBUIR en un mes sin base de envíos (también la depreciación, si está encendida).
create or replace view fin_reparto_pendiente
with (security_invoker = true) as
select e.periodo, round(sum(e.monto), 2) as monto, sum(e.movimientos)::bigint as movimientos
from fin_eerr_movimientos e
where e.clase = 'reparto'
  and not exists (
    select 1 from fin_base_distribucion b join fin_unidades bu on bu.id = b.unidad_id
    where b.periodo = e.periodo and bu.recibe_reparto and b.envios > 0
  )
group by e.periodo;

comment on view fin_depreciacion_mensual is 'Portal AF4 360°: depreciación lineal por mes y tienda; entra a fin_eerr_mensual si fin_config.depreciacion_en_eerr es true.';

-- ---------------------------------------------------------------------------------------------
-- 3. Nómina al libro
-- ---------------------------------------------------------------------------------------------
-- Un sueldo del Excel reemplazado por la nómina: queda en el libro (con EERR y FLUJO = NO) para poder devolverlo.
alter table fin_movimientos add column if not exists reemplazado_por text;
alter table fin_movimientos add column if not exists reemplazado_en timestamptz;
alter table fin_movimientos add column if not exists reemplazo_previo jsonb;

create index if not exists fin_movimientos_nomina on fin_movimientos (periodo) where origen = 'nomina' or reemplazado_por is not null;

-- Pasa la nómina de un mes al libro. `p_movimientos`: [{origen_clave, unidad_id, tipo ('formal'|'externa'), monto,
-- fecha_pago, descripcion}], uno por tienda, tipo y mes de pago (los arma `movimientosDeNomina`, src/lib/nomina/al-libro.ts).
-- Crea o actualiza esos movimientos, borra los de nómina de ese mes que ya no vienen y reemplaza `p_reemplazar` (sueldos
-- del Excel). Devuelve cuántos creó o actualizó, cuántos borró y cuántos reemplazó.
create or replace function fin_nomina_al_libro(p_periodo date, p_movimientos jsonb, p_reemplazar uuid[], p_usuario uuid)
returns jsonb
language plpgsql
as $$
declare
  v_sueldos uuid;
  v_otros uuid;
  v_guardados integer;
  v_borrados integer;
  v_reemplazados integer;
  v_claves text[];
begin
  if not exists (select 1 from fin_config where clave = 'nomina_al_libro' and valor = 'true'::jsonb) then
    raise exception 'La nómina al libro está apagada (Estado de resultados › Ajustes).';
  end if;
  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'Mes inválido.';
  end if;
  select id into v_sueldos from fin_tipos where nombre = 'SUELDOS';
  select id into v_otros from fin_tipos where nombre = 'OTROS SUELDOS';
  if v_sueldos is null or v_otros is null then
    raise exception 'Faltan los tipos SUELDOS y OTROS SUELDOS en el catálogo.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) e
    where coalesce(e->>'origen_clave', '') not like ('nomina:' || to_char(p_periodo, 'YYYY-MM') || ':%')
       or e->>'tipo' not in ('formal', 'externa')
  ) then
    raise exception 'Movimiento de nómina inválido.';
  end if;

  select coalesce(array_agg(e->>'origen_clave'), '{}') into v_claves
  from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) e;

  insert into fin_movimientos (
    periodo, fecha_registro, unidad_id, tipo_id, tipo_texto, descripcion, en_eerr, en_flujo, monto, fecha_pago,
    origen, origen_clave, editado_a_mano, editado_por, editado_en, creado_por, actualizado_en
  )
  select
    p_periodo,
    current_date,
    (e->>'unidad_id')::uuid,
    case when e->>'tipo' = 'formal' then v_sueldos else v_otros end,
    case when e->>'tipo' = 'formal' then 'SUELDOS' else 'OTROS SUELDOS' end,
    coalesce(e->>'descripcion', ''),
    true,
    true,
    (e->>'monto')::numeric,
    nullif(e->>'fecha_pago', '')::date,
    'nomina',
    e->>'origen_clave',
    true,
    p_usuario,
    now(),
    p_usuario,
    now()
  from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) e
  on conflict (origen_clave) do update set
    unidad_id = excluded.unidad_id,
    tipo_id = excluded.tipo_id,
    tipo_texto = excluded.tipo_texto,
    descripcion = excluded.descripcion,
    en_eerr = true,
    en_flujo = true,
    monto = excluded.monto,
    fecha_pago = excluded.fecha_pago,
    editado_a_mano = true,
    editado_por = p_usuario,
    editado_en = now(),
    actualizado_en = now();
  get diagnostics v_guardados = row_count;

  delete from fin_movimientos
  where origen = 'nomina' and periodo = p_periodo and not (origen_clave = any (v_claves));
  get diagnostics v_borrados = row_count;

  update fin_movimientos set
    reemplazo_previo = jsonb_build_object('en_eerr', en_eerr, 'en_flujo', en_flujo, 'editado_a_mano', editado_a_mano),
    reemplazado_por = 'nomina',
    reemplazado_en = now(),
    en_eerr = false,
    en_flujo = false,
    editado_a_mano = true,
    editado_por = p_usuario,
    editado_en = now(),
    actualizado_en = now()
  where id = any (coalesce(p_reemplazar, '{}'))
    and periodo = p_periodo
    and origen <> 'nomina'
    and reemplazado_por is null
    and tipo_id in (v_sueldos, v_otros);
  get diagnostics v_reemplazados = row_count;

  return jsonb_build_object('guardados', v_guardados, 'borrados', v_borrados, 'reemplazados', v_reemplazados);
end $$;

-- Deshace un mes: borra los sueldos que vinieron de la nómina y devuelve los del Excel como estaban.
create or replace function fin_nomina_fuera_del_libro(p_periodo date, p_usuario uuid)
returns jsonb
language plpgsql
as $$
declare
  v_borrados integer;
  v_devueltos integer;
begin
  delete from fin_movimientos where origen = 'nomina' and periodo = p_periodo;
  get diagnostics v_borrados = row_count;
  update fin_movimientos set
    en_eerr = coalesce((reemplazo_previo->>'en_eerr')::boolean, true),
    en_flujo = coalesce((reemplazo_previo->>'en_flujo')::boolean, true),
    editado_a_mano = coalesce((reemplazo_previo->>'editado_a_mano')::boolean, false),
    reemplazado_por = null,
    reemplazado_en = null,
    reemplazo_previo = null,
    editado_por = p_usuario,
    editado_en = now(),
    actualizado_en = now()
  where periodo = p_periodo and reemplazado_por = 'nomina';
  get diagnostics v_devueltos = row_count;
  return jsonb_build_object('borrados', v_borrados, 'devueltos', v_devueltos);
end $$;

-- Las funciones solo las llama el servidor (clave de servicio).
revoke all on function fin_nomina_al_libro(date, jsonb, uuid[], uuid) from public;
revoke all on function fin_nomina_fuera_del_libro(date, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_nomina_al_libro(date, jsonb, uuid[], uuid) from anon, authenticated';
    execute 'revoke all on function fin_nomina_fuera_del_libro(date, uuid) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function fin_nomina_al_libro(date, jsonb, uuid[], uuid) to service_role';
    execute 'grant execute on function fin_nomina_fuera_del_libro(date, uuid) to service_role';
  end if;
end $$;

comment on function fin_nomina_al_libro(date, jsonb, uuid[], uuid) is 'Portal AF4 360°: pasa la nómina de un mes al libro (SUELDOS / OTROS SUELDOS) y reemplaza los sueldos del Excel.';
comment on function fin_nomina_fuera_del_libro(date, uuid) is 'Portal AF4 360°: deshace fin_nomina_al_libro de un mes.';
