-- Portal AF4 360° fase 2b: libro de movimientos editable y bienes de uso (ver FINANZAS-360.md).
--
-- 1. Libro: los movimientos se agregan a mano («Agregar», origen 'manual'), se pegan desde Excel (origen 'pegado') y se
--    corrigen en su ficha (queda `editado_a_mano`: reimportar el Excel no los pisa). Solo índices: las columnas de
--    edición ya están desde la 0116.
-- 2. Bienes de uso (hoja «Bienes de Uso» de GASTOS_PANAMA): cada bien con su alta, importe, vida útil y baja, y la
--    depreciación lineal mes a mes. La vista `fin_depreciacion_mensual` queda lista para el EERR, pero **todavía no se
--    suma** (la línea «Depreciación Bienes de uso» del EERR del Excel está en cero y cambiaría lo que ya cuadra).
--
-- RLS activado y sin políticas (ver SEGURIDAD.md). Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- Libro editable
-- ---------------------------------------------------------------------------------------------
-- `huellasDeOrigen` (importar y cerrar una importación) filtra por archivo de origen.
create index if not exists fin_movimientos_origen on fin_movimientos (origen);
-- La ficha lee la actividad de un movimiento por su id.
create index if not exists historial_auditoria_fin_movimientos
  on historial_auditoria (entidad_id, creado_en desc)
  where entidad = 'fin_movimientos';

-- ---------------------------------------------------------------------------------------------
-- Bienes de uso
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_bienes_uso (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null check (length(trim(descripcion)) > 0),
  -- La «Tabla de Vidas Útiles» del Excel.
  tipo text not null check (tipo in ('Inmuebles', 'Muebles y Utiles', 'Instalaciones', 'Equipos Computación', 'Rodados', 'Mejoras')),
  -- Tienda a la que se carga la depreciación; vacío = A DISTRIBUIR (se reparte por envíos, como el resto del libro).
  unidad_id uuid references fin_unidades(id),
  -- La depreciación empieza el mes de esta fecha (como la grilla del Excel: el mes de alta ya deprecia).
  fecha_alta date not null,
  -- Cuatro decimales: el Excel guarda importes prorrateados (672,5741…) y así la cuota mensual da igual que su grilla.
  importe numeric(16, 4) not null check (importe > 0),
  meses_vida integer not null check (meses_vida between 1 and 600),
  valor_residual numeric(16, 4) not null default 0,
  -- El mes de la baja ya no deprecia.
  fecha_baja date,
  motivo_baja text,
  notas text,
  -- Corregido en el portal: reimportar el Excel ya no lo pisa.
  editado_a_mano boolean not null default false,
  origen text not null default 'manual',
  origen_clave text unique,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  check (valor_residual >= 0 and valor_residual < importe),
  check (fecha_baja is null or fecha_baja >= fecha_alta)
);

create index if not exists fin_bienes_uso_alta on fin_bienes_uso (fecha_alta);
alter table fin_bienes_uso enable row level security;

-- Una fila por bien y mes que deprecia: cuota lineal = (importe − valor residual) / meses de vida, desde el mes de alta
-- durante `meses_vida` meses, y nunca desde el mes de la baja en adelante.
create or replace view fin_bienes_uso_cuotas
with (security_invoker = true) as
select
  b.id as bien_id,
  b.unidad_id,
  m.periodo::date as periodo,
  (b.importe - b.valor_residual) / b.meses_vida as cuota
from fin_bienes_uso b
cross join lateral generate_series(
  (b.fecha_alta - (extract(day from b.fecha_alta)::int - 1))::timestamp,
  (b.fecha_alta - (extract(day from b.fecha_alta)::int - 1))::timestamp + make_interval(months => b.meses_vida - 1),
  interval '1 month'
) as m(periodo)
where b.fecha_baja is null
   or m.periodo < (b.fecha_baja - (extract(day from b.fecha_baja)::int - 1))::timestamp;

-- Lista para el EERR: el cargo de depreciación de cada mes por tienda (sin tienda = A DISTRIBUIR).
create or replace view fin_depreciacion_mensual
with (security_invoker = true) as
select
  c.periodo,
  coalesce(c.unidad_id, (select u.id from fin_unidades u where u.nombre = 'A DISTRIBUIR')) as unidad_id,
  round(sum(c.cuota), 2) as monto,
  count(*)::int as bienes
from fin_bienes_uso_cuotas c
group by 1, 2;

comment on table fin_bienes_uso is 'Portal AF4 360°: bienes de uso (hoja «Bienes de Uso» de GASTOS_PANAMA).';
comment on view fin_depreciacion_mensual is 'Portal AF4 360°: depreciación lineal por mes y tienda; aún no entra a fin_eerr_mensual.';

-- Permiso: lo recibe quien ya trabaja en el Libro de movimientos, con su mismo solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'bienes-de-uso', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
