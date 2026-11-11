-- Portal AF4 360°: Proyección de caja a 13 semanas (/proyeccion-caja, ver FINANZAS-360.md).
--
-- La proyección no se guarda: se arma al abrir la página desde lo que ya existe (caja del Flujo de caja, ventas por
-- tienda, retiros de Dropi, carteras, compras, nómina, deliverys y el libro). La lógica vive en
-- `src/lib/finanzas/proyeccion-caja.ts`. Aquí van:
--
--  * `fin_proyeccion_ajustes`: partidas a mano por semana (una compra grande, un préstamo), con signo: positivo entra,
--    negativo sale. Se suman a los tres escenarios.
--  * `fin_proyeccion_fotos`: una foto por semana de lo que decía la proyección base (por semana y rubro), que se guarda
--    al abrir la página si esa semana todavía no tiene. Con ellas se mide la precisión contra lo real.
--  * Funciones de solo lectura que agregan en Postgres lo que la página necesita sumado:
--    - `fin_proyeccion_ventas(desde, hasta)`: órdenes por tienda, semana de envío (lunes) y método de pago: enviadas,
--      entregadas, devueltas y lo cobrado de las entregadas.
--    - `fin_proyeccion_comisiones(desde, hasta)`: la parte que se queda cada pasarela (Yappy, MiPOS, Servientrega).
--    - `fin_proyeccion_libro(desde, hasta)`: los movimientos del libro que mueven caja (FLUJO = SI o PAGO TDC) por fecha de
--      pago, con los datos de su tipo.
--    - `fin_proyeccion_meses_libro(desde)`: cuántos movimientos tiene cada mes del libro (para saber cuál está completo).
--    - `fin_proyeccion_flujo_entre(desde, hasta)`: el flujo neto de caja con fecha de pago en (desde, hasta], con las
--      mismas reglas que `fin_flujo_mensual` (0117): sirve para llevar la caja de un día a otro.
--  * Ajustes en `fin_config` (0130): `caja_minima` (número), `proyeccion_caja_inicial` ({monto, fecha}: la caja a mano
--    cuando no hay saldos iniciales) y `proyeccion_probabilidades` ({cobroVencido, pagoVencido}, de 0 a 1).
--
-- RLS activado y sin políticas (SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas. Las
-- funciones solo las llama el servidor. Se puede correr dos veces.

create table if not exists fin_proyeccion_ajustes (
  id uuid primary key default gen_random_uuid(),
  -- Lunes de la semana.
  semana date not null check (extract(isodow from semana) = 1),
  concepto text not null check (length(trim(concepto)) between 1 and 120),
  -- Positivo entra, negativo sale.
  monto numeric(14, 2) not null check (monto <> 0),
  nota text check (nota is null or length(nota) <= 2000),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists fin_proyeccion_ajustes_semana on fin_proyeccion_ajustes (semana);

create table if not exists fin_proyeccion_fotos (
  id uuid primary key default gen_random_uuid(),
  -- Lunes de la semana en que se tomó.
  semana date not null unique check (extract(isodow from semana) = 1),
  caja_inicial numeric(14, 2) not null,
  -- { "AAAA-MM-DD (lunes)": { "rubro": monto } }, entradas y salidas en positivo.
  valores jsonb not null,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

alter table fin_proyeccion_ajustes enable row level security;
alter table fin_proyeccion_fotos enable row level security;

-- La 0130 la crea; por si esta se corre antes.
create table if not exists fin_config (
  clave text primary key,
  valor jsonb not null,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table fin_config enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Ventas por tienda, semana de envío y método
-- ---------------------------------------------------------------------------------------------
create or replace function fin_proyeccion_ventas(p_desde date, p_hasta date)
returns table (unidad_id uuid, semana date, metodo text, enviadas bigint, entregadas bigint, devueltas bigint, valor_entregadas numeric)
language sql stable
set search_path = public
as $$
  select
    o.unidad_id,
    date_trunc('week', o.fecha_envio)::date,
    o.metodo_pago,
    count(*) filter (where o.estado_entrega in ('entregada', 'devuelta', 'en_transito')),
    count(*) filter (where o.estado_entrega = 'entregada'),
    count(*) filter (where o.estado_entrega = 'devuelta'),
    round(coalesce(sum(o.total) filter (where o.estado_entrega = 'entregada'), 0), 2)
  from ven_ordenes o
  where o.fecha_envio between p_desde and p_hasta
  group by 1, 2, 3
$$;

-- La comisión de cada pasarela, con el método de pago de la orden al que corresponde.
create or replace function fin_proyeccion_comisiones(p_desde date, p_hasta date)
returns table (metodo text, bruto numeric, comision numeric)
language sql stable
set search_path = public
as $$
  select
    case f.fuente when 'mipos' then 'tarjeta' else f.fuente end,
    round(sum(f.monto_bruto), 2),
    round(sum(f.comision), 2)
  from conc_fuentes_cobro f
  where not f.anulada and f.fecha between p_desde and p_hasta
  group by 1
$$;

-- ---------------------------------------------------------------------------------------------
-- Libro
-- ---------------------------------------------------------------------------------------------
create or replace function fin_proyeccion_libro(p_desde date, p_hasta date)
returns table (
  id uuid,
  fecha date,
  unidad_id uuid,
  tipo text,
  seccion text,
  signo smallint,
  bloque text,
  descripcion text,
  monto numeric,
  es_bien_de_uso boolean
)
language sql stable
set search_path = public
as $$
  select
    m.id,
    coalesce(m.fecha_pago, m.periodo),
    m.unidad_id,
    t.nombre,
    t.seccion,
    coalesce(t.signo, -1)::smallint,
    t.bloque_flujo,
    coalesce(m.descripcion, ''),
    m.monto,
    coalesce(m.es_bien_de_uso, false)
  from fin_movimientos m
  left join fin_tipos t on t.id = m.tipo_id
  where coalesce(m.fecha_pago, m.periodo) between p_desde and p_hasta
    and coalesce(t.seccion, '') not in ('informacion', 'pago_tdc')
    and m.en_flujo
  order by 2, 1
$$;

create or replace function fin_proyeccion_meses_libro(p_desde date)
returns table (mes date, movimientos bigint)
language sql stable
set search_path = public
as $$
  select date_trunc('month', coalesce(m.fecha_pago, m.periodo))::date, count(*)
  from fin_movimientos m
  left join fin_tipos t on t.id = m.tipo_id
  where coalesce(m.fecha_pago, m.periodo) >= p_desde
    and m.en_flujo
    and coalesce(t.seccion, '') not in ('informacion', 'pago_tdc')
  group by 1
$$;

-- Flujo neto (entradas − salidas) con fecha de pago en (desde, hasta]. PAGO TDC no cambia la caja total; INFORMACIÓN no
-- entra. Sin tipo, salida (como `fin_flujo_mensual`).
create or replace function fin_proyeccion_flujo_entre(p_desde date, p_hasta date)
returns numeric
language sql stable
set search_path = public
as $$
  select round(coalesce(sum(case when coalesce(t.signo, -1) = 1 then m.monto else -m.monto end), 0), 2)
  from fin_movimientos m
  left join fin_tipos t on t.id = m.tipo_id
  where m.en_flujo
    and coalesce(t.seccion, '') not in ('informacion', 'pago_tdc')
    and coalesce(m.fecha_pago, m.periodo) > p_desde
    and coalesce(m.fecha_pago, m.periodo) <= p_hasta
$$;

-- Las funciones solo las llama el servidor (clave de servicio).
do $$
declare
  f text;
begin
  foreach f in array array[
    'fin_proyeccion_ventas(date, date)',
    'fin_proyeccion_comisiones(date, date)',
    'fin_proyeccion_libro(date, date)',
    'fin_proyeccion_meses_libro(date)',
    'fin_proyeccion_flujo_entre(date, date)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
  end loop;
end $$;

comment on table fin_proyeccion_ajustes is 'Portal AF4 360°: partidas a mano de la proyección de caja (por semana, con signo).';
comment on table fin_proyeccion_fotos is 'Portal AF4 360°: foto semanal de la proyección de caja base, para medir su precisión.';

-- ---------------------------------------------------------------------------------------------
-- Permiso: lo reciben quienes ya tienen el Flujo de caja, con su mismo solo lectura.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'proyeccion-caja', solo_lectura
from permisos_rol
where modulo = 'flujo-caja'
on conflict (rol_id, modulo) do nothing;
