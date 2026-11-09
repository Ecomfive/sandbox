-- Portal AF4 360° — Cierre y control (mejoras 13 a 23 sobre el Cierre de mes de la 0127). Ver FINANZAS-360.md.
--
-- 1. AJUSTES DEL CIERRE (`fin_config.cierre`): el día hábil del mes siguiente en que cada mes debe quedar cerrado (fecha
--    objetivo), el umbral de variación contra el mes anterior que exige explicación (% y monto, los dos), las tolerancias
--    de los cuadres de inventario y de Dropi y cómo se llama Dropi en la cartera por cobrar.
-- 2. RESPONSABLE Y FECHA LÍMITE POR TAREA (`fin_cierre_tareas.responsable_id`, `fecha_limite`): sin fecha propia, la
--    tarea vence en la fecha objetivo del mes. `aviso_estado` / `aviso_en` recuerdan el último aviso enviado al
--    responsable (por vencer, vencida) para no repetirlo cada día.
-- 3. REAPERTURAS (`fin_cierre_reaperturas`): una fila por cada vez que se reabrió un mes cerrado, con quién y por qué
--    (antes solo quedaba la última en `fin_cierres`). Se copian las que ya había.
-- 4. APROBACIÓN EN DOS PASOS: quien envía el mes a revisión (prepara, `enviado_revision_por`) no puede ser quien lo
--    cierra (aprueba, `cerrado_por`). Lo impone un disparador (código FC002) además de la acción del servidor.
-- 5. ASIENTOS DE AJUSTE (`fin_ajustes_cierre`): provisiones, devengos, reclasificaciones y otros ajustes del cierre,
--    separados del libro operativo. Cada ajuste escribe sus líneas en `fin_movimientos` con `origen = 'ajuste_cierre'` y
--    `ajuste_id` (EERR = SI, flujo = NO: no mueven caja), así entran al EERR del mes por las vistas de siempre y el
--    bloqueo de la 0127 los protege. El Libro de movimientos no los muestra (se ven en Cierre de mes › Asientos de ajuste).
--    Borrar un ajuste borra sus líneas (en cascada; con el mes cerrado, el bloqueo lo impide).
-- 6. GASTOS PREPAGADOS (`fin_prepagos`): un pago anual o adelantado (seguro, licencia, dominio) que se reparte mes a mes;
--    cada mes el devengo se registra como ajuste (origen 'devengo', una vez por prepago y mes).
-- 7. CUADRES DEL CIERRE (`fin_cierre_cuadres`): inventario contable contra el WMS y cartera por cobrar contra Dropi,
--    con la diferencia y su explicación. `fin_cuadre_dropi_al` calcula lo que Dropi tiene pendiente a una fecha.
-- 8. VARIACIONES EXPLICADAS (`fin_cierre_variaciones`): la explicación escrita de cada línea del EERR que varió más que
--    el umbral contra el mes anterior (sin ellas no se cierra).
-- 9. Tipo «Provisión prestaciones laborales» (administración) para las provisiones de la nómina.
--
-- RLS activado y sin políticas (SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas. Las tablas
-- con mes (`periodo`) quedan bajo el bloqueo del cierre (`fin_bloqueo_cierre`). Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- 1. Ajustes del cierre
-- ---------------------------------------------------------------------------------------------
insert into fin_config (clave, valor) values
  ('cierre', '{"dia_habil": 5, "umbral_pct": 10, "umbral_monto": 500, "tolerancia_inventario": 100, "tolerancia_dropi": 100, "contraparte_dropi": "dropi"}'::jsonb)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2. Responsable y fecha límite por tarea
-- ---------------------------------------------------------------------------------------------
alter table fin_cierre_tareas add column if not exists responsable_id uuid references perfiles(id) on delete set null;
alter table fin_cierre_tareas add column if not exists fecha_limite date;
alter table fin_cierre_tareas add column if not exists aviso_estado text;
alter table fin_cierre_tareas add column if not exists aviso_en timestamptz;
create index if not exists fin_cierre_tareas_responsable on fin_cierre_tareas (responsable_id) where responsable_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 3. Reaperturas
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_cierre_reaperturas (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null references fin_cierres(id) on delete cascade,
  periodo date not null check (extract(day from periodo) = 1),
  reabierto_en timestamptz not null default now(),
  reabierto_por uuid references auth.users(id),
  motivo text not null check (length(trim(motivo)) between 5 and 500),
  -- Quién lo había cerrado (aprobado) y cuándo, para el registro.
  cerrado_en timestamptz,
  cerrado_por uuid references auth.users(id),
  unique (cierre_id, reabierto_en)
);
create index if not exists fin_cierre_reaperturas_fecha on fin_cierre_reaperturas (reabierto_en desc);
alter table fin_cierre_reaperturas enable row level security;

insert into fin_cierre_reaperturas (cierre_id, periodo, reabierto_en, reabierto_por, motivo)
select c.id, c.periodo, c.reabierto_en, c.reabierto_por, left(coalesce(nullif(trim(c.motivo_reapertura), ''), 'Sin motivo registrado'), 500)
from fin_cierres c
where c.reabierto_en is not null
on conflict (cierre_id, reabierto_en) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 4. Aprobación en dos pasos
-- ---------------------------------------------------------------------------------------------
create or replace function fin_cierre_aprobacion() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.estado = 'cerrado' and old.estado is distinct from 'cerrado'
     and new.cerrado_por is not null and new.cerrado_por = new.enviado_revision_por then
    raise exception using
      errcode = 'FC002',
      message = 'Quien preparó el cierre (lo envió a revisión) no puede aprobarlo: lo cierra otra persona.';
  end if;
  return new;
end $$;

drop trigger if exists fin_cierres_aprobacion on fin_cierres;
create trigger fin_cierres_aprobacion before update on fin_cierres
for each row execute function fin_cierre_aprobacion();

-- ---------------------------------------------------------------------------------------------
-- 5. Asientos de ajuste
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_ajustes_cierre (
  id uuid primary key default gen_random_uuid(),
  periodo date not null check (extract(day from periodo) = 1),
  clase text not null check (clase in ('provision', 'devengo', 'reclasificacion', 'otro')),
  concepto text not null check (length(trim(concepto)) between 1 and 200),
  -- manual (una persona) · provision_nomina (propuesta desde la nómina) · devengo (gasto prepagado)
  origen text not null default 'manual' check (origen in ('manual', 'provision_nomina', 'devengo')),
  -- La parte de la propuesta: «xiii», «vacaciones», «prima» o el id del prepago.
  origen_ref text,
  -- Efecto total en el resultado del mes (positivo = sube el resultado), para listarlo sin sumar las líneas.
  efecto numeric(14, 2) not null default 0,
  notas text check (notas is null or length(notas) <= 1000),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);
create index if not exists fin_ajustes_cierre_periodo on fin_ajustes_cierre (periodo);
-- Una propuesta automática se registra una sola vez por mes.
create unique index if not exists fin_ajustes_cierre_unico on fin_ajustes_cierre (periodo, origen, origen_ref) where origen <> 'manual';
alter table fin_ajustes_cierre enable row level security;

alter table fin_movimientos add column if not exists ajuste_id uuid references fin_ajustes_cierre(id) on delete cascade;
create index if not exists fin_movimientos_ajuste on fin_movimientos (ajuste_id) where ajuste_id is not null;

insert into fin_tipos (nombre, seccion, signo, orden) values ('Provisión prestaciones laborales', 'administracion', -1, 226)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 6. Gastos prepagados
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_prepagos (
  id uuid primary key default gen_random_uuid(),
  concepto text not null check (length(trim(concepto)) between 1 and 120),
  unidad_id uuid not null references fin_unidades(id),
  tipo_id uuid not null references fin_tipos(id),
  monto numeric(14, 2) not null check (monto > 0),
  -- Primer mes que cubre y cuántos meses se reparte.
  desde date not null check (extract(day from desde) = 1),
  meses integer not null check (meses between 1 and 60),
  -- Mes en que se pagó y si ese pago ya está en el EERR del libro (entonces el mes del pago lleva un ajuste que lo saca).
  periodo_pago date check (periodo_pago is null or extract(day from periodo_pago) = 1),
  pago_en_eerr boolean not null default true,
  notas text check (notas is null or length(notas) <= 1000),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table fin_prepagos enable row level security;

-- ---------------------------------------------------------------------------------------------
-- 7. Cuadres del cierre
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_cierre_cuadres (
  id uuid primary key default gen_random_uuid(),
  periodo date not null check (extract(day from periodo) = 1),
  clase text not null check (clase in ('inventario', 'cartera_dropi')),
  -- Lo que dicen los libros y lo que dice el sistema de origen (WMS, Dropi) al registrarlo.
  valor_libros numeric(14, 2) not null,
  valor_sistema numeric(14, 2) not null,
  diferencia numeric(14, 2) generated always as (valor_libros - valor_sistema) stored,
  -- Las partes del lado del sistema (wallet, retiros en tránsito, entregados sin liquidar…), para explicar la diferencia.
  detalle jsonb,
  explicacion text check (explicacion is null or length(explicacion) <= 2000),
  registrado_en timestamptz not null default now(),
  registrado_por uuid references auth.users(id),
  unique (periodo, clase)
);
alter table fin_cierre_cuadres enable row level security;

-- Lo que Dropi tiene pendiente de pagarnos a una fecha (Panamá u otro país): el saldo de la wallet a esa fecha, los
-- retiros pedidos y todavía no recibidos, y los pedidos entregados que Dropi aún no acreditó (sin «ganancia» en su
-- historial de cartera), más el saldo de la cartera por cobrar de los libros cuya contraparte se llama como Dropi.
create or replace function fin_cuadre_dropi_al(p_corte date, p_pais text default 'PA', p_contraparte text default 'dropi')
returns table (
  wallet numeric,
  wallet_fecha date,
  retiros_transito numeric,
  retiros_abiertos bigint,
  entregados_sin_liquidar numeric,
  pedidos_sin_liquidar bigint,
  cartera_libros numeric,
  documentos_libros bigint
)
language sql stable
set search_path = public
as $$
  with pais as (select id from paises where codigo = p_pais limit 1),
  dropi as (select id from plataformas where lower(nombre) like '%dropi%'),
  wallet as (
    select distinct on (s.plataforma_id) s.plataforma_id, s.monto, s.fecha
    from saldos_wallet s
    where s.pais_id = (select id from pais) and s.plataforma_id in (select id from dropi) and s.fecha <= p_corte
    order by s.plataforma_id, s.fecha desc
  ),
  transito as (
    select coalesce(sum(coalesce(r.a_recibir, r.monto_neto)), 0) as monto, count(*) as n
    from retiros r
    where r.pais_id = (select id from pais)
      and r.plataforma_id in (select id from dropi)
      and r.fecha <= p_corte
      and r.estado <> 'cancelado'
      and coalesce(r.estado_dropi, '') not in ('rechazado', 'cancelado')
      and (coalesce(r.fecha_recibido, r.fecha_cierre) is null or coalesce(r.fecha_recibido, r.fecha_cierre) > p_corte)
  ),
  entregados as (
    select coalesce(sum(o.monto), 0) as monto, count(*) as n
    from ordenes o
    where o.pais_id = (select id from pais)
      and o.plataforma_id in (select id from dropi)
      and o.fecha <= p_corte
      and o.fecha > p_corte - 120
      and o.estado ilike '%entregad%'
      and not exists (
        select 1 from historial_cartera c
        where c.pais_id = o.pais_id and c.plataforma_id = o.plataforma_id
          and c.orden_referencia_externa = o.referencia_externa
          and c.descripcion ilike '%ganancia%'
          and c.fecha <= p_corte
      )
  ),
  libros as (
    select coalesce(sum(x.saldo), 0) as saldo, count(*) as n
    from (
      select d.monto - coalesce((
        select sum(a.monto) from fin_cartera_abonos a where a.documento_id = d.id and (a.fecha is null or a.fecha <= p_corte)
      ), 0) as saldo
      from fin_cartera d
      where d.clase = 'cobrar'
        and d.contraparte ilike '%' || p_contraparte || '%'
        and (d.fecha is null or d.fecha <= p_corte)
        and d.estado_manual is null
    ) x
    where x.saldo > 0.005
  )
  select
    round(coalesce((select sum(monto) from wallet), 0), 2),
    (select max(fecha) from wallet),
    round((select monto from transito), 2),
    (select n from transito),
    round((select monto from entregados), 2),
    (select n from entregados),
    round((select saldo from libros), 2),
    (select n from libros)
$$;

revoke all on function fin_cuadre_dropi_al(date, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_cuadre_dropi_al(date, text, text) from anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Variaciones explicadas
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_cierre_variaciones (
  id uuid primary key default gen_random_uuid(),
  periodo date not null check (extract(day from periodo) = 1),
  -- La clave de la línea del EERR («ebitda», «administracion-SUELDOS»…).
  linea text not null check (length(linea) between 1 and 200),
  etiqueta text not null,
  actual numeric(14, 2),
  anterior numeric(14, 2),
  explicacion text not null check (length(trim(explicacion)) between 5 and 2000),
  escrito_en timestamptz not null default now(),
  escrito_por uuid references auth.users(id),
  unique (periodo, linea)
);
alter table fin_cierre_variaciones enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Bloqueo del cierre: un mes cerrado no deja cambiar sus ajustes, cuadres ni explicaciones.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['fin_ajustes_cierre', 'fin_cierre_cuadres', 'fin_cierre_variaciones'] loop
    execute format('drop trigger if exists %I on %I', v_tabla || '_cierre', v_tabla);
    execute format(
      'create trigger %I before insert or update or delete on %I for each row execute function fin_bloqueo_cierre()',
      v_tabla || '_cierre', v_tabla
    );
  end loop;
end $$;

comment on table fin_cierre_reaperturas is 'Portal AF4 360°: cada reapertura de un mes cerrado, con quién y por qué.';
comment on table fin_ajustes_cierre is 'Portal AF4 360°: asientos de ajuste del cierre (provisiones, devengos, reclasificaciones); sus líneas están en fin_movimientos con origen ajuste_cierre.';
comment on table fin_prepagos is 'Portal AF4 360°: gastos anuales o prepagados que se devengan mes a mes como ajuste del cierre.';
comment on table fin_cierre_cuadres is 'Portal AF4 360°: cuadres del cierre (inventario contable contra WMS, cartera contra Dropi).';
comment on table fin_cierre_variaciones is 'Portal AF4 360°: explicación de las líneas del EERR que variaron más que el umbral contra el mes anterior.';
