-- Portal AF4 360° — Equipo › Nómina (ver FINANZAS-360.md, fase de nómina).
--
-- Reemplaza dos Excel de Majo:
--  * PLANILLA_FORMAL_PANAMA.xlsx: la planilla formal de Panamá, una hoja por mes con dos bloques (1ª y 2ª quincena):
--    salario, hora rata, horas extra (×1,25), feriados (×1,5), tardanzas, ausencias, bono, Seguro Social (9,75 %),
--    Seguro Educativo (1,25 %) y salario neto.
--  * NOMINA_EXTRANJERA.xlsx: colaboradores externos pagados en USDT por Binance, una hoja por mes y una fila por pago
--    (mensual, quincenal o semanal), con su tienda, transacción y origen del pago; la comisión P2P va aparte por mes.
--
-- **Datos sensibles** (cédulas, pasaportes, salarios): el módulo `nomina` no se da a nadie solo; esta migración se lo da
-- únicamente a los roles que ya tienen Usuarios y roles. RLS activado y sin políticas (SEGURIDAD.md, migración 0063):
-- solo el servidor, con la clave de servicio, toca estas tablas. Las vistas llevan `security_invoker = true`.
--
-- No escribe en `fin_movimientos`: el libro sigue siendo la fuente del EERR (así no hay doble conteo). La conciliación
-- nómina ↔ libro es una pantalla (/nomina/conciliacion) que compara las dos.
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------------------------
create table if not exists nom_personas (
  id uuid primary key default gen_random_uuid(),
  -- formal: planilla de Panamá (USD, con seguros) · externa: colaborador pagado en USDT
  tipo text not null check (tipo in ('formal', 'externa')),
  -- Nombre normalizado (mayúsculas, sin acentos, un espacio): identifica a la persona entre meses al importar.
  clave text not null,
  nombre text not null,
  -- Cédula o pasaporte. Se muestra completo solo en la ficha; en listas y descargas va enmascarado.
  documento text,
  -- Planilla: «E» o «P» como viene del Excel. Externa: el país.
  nacionalidad text,
  pais text,
  numero_empleado text,
  cargo text,
  -- Tienda a la que se carga su costo. Externa: la tienda de cada línea manda; formal: la de la persona.
  unidad_id uuid references fin_unidades(id),
  -- Si alguien la cambió a mano, reimportar no la pisa.
  unidad_editada boolean not null default false,
  fecha_inicio date,
  fecha_fin date,
  estatus text,
  correo text,
  medio_pago text,
  frecuencia_pago text,
  -- Último salario mensual conocido (formal en USD; externa, el sueldo de la última línea en USDT).
  salario_mensual numeric(12, 2),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tipo, clave)
);

-- ---------------------------------------------------------------------------------------------
-- Períodos (un mes de una nómina)
-- ---------------------------------------------------------------------------------------------
create table if not exists nom_periodos (
  id uuid primary key default gen_random_uuid(),
  periodo date not null check (extract(day from periodo) = 1),
  tipo text not null check (tipo in ('formal', 'externa')),
  -- Comisión P2P / Binance del mes (solo externa): no es de ninguna persona.
  comision numeric(12, 2) not null default 0,
  -- La fila de totales del Excel («TOTAL USDT PAGADO»), para compararla con la suma de las líneas. Vacía si el Excel no
  -- la trae o tiene un error (#REF!).
  total_excel numeric(14, 2),
  origen text,
  actualizado_en timestamptz not null default now(),
  unique (periodo, tipo)
);

-- ---------------------------------------------------------------------------------------------
-- Líneas: una por persona y pago (quincena, semana o mes)
-- ---------------------------------------------------------------------------------------------
create table if not exists nom_lineas (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references nom_periodos(id) on delete cascade,
  persona_id uuid not null references nom_personas(id),
  periodo date not null check (extract(day from periodo) = 1),
  tipo text not null check (tipo in ('formal', 'externa')),
  -- «1ª quincena», «2ª quincena» o el período cubierto de la externa («1ERA Q», «15/06/2026»…).
  tramo text not null default '',
  -- Tienda de esta línea (externa). Vacía: se usa la de la persona.
  unidad_id uuid references fin_unidades(id),
  cargo text,
  estatus text,
  frecuencia text,
  moneda text not null default 'USD' check (moneda in ('USD', 'USDT')),
  salario_mensual numeric(12, 2),
  hora_rata numeric(12, 6),
  horas_trabajadas numeric(8, 2),
  -- Hora rata × horas trabajadas (formal) o el sueldo del pago (externa).
  devengado numeric(12, 2) not null default 0,
  horas_extra numeric(8, 2) not null default 0,
  monto_horas_extra numeric(12, 2) not null default 0,
  -- Feriado trabajado y horas extra en feriado.
  monto_feriado numeric(12, 2) not null default 0,
  bono numeric(12, 2) not null default 0,
  descuento_tardanza numeric(12, 2) not null default 0,
  descuento_ausencia numeric(12, 2) not null default 0,
  otros_descuentos numeric(12, 2) not null default 0,
  -- Total asignaciones (formal) o total USDT (externa).
  total_bruto numeric(12, 2) not null default 0,
  seguro_social numeric(12, 2) not null default 0,
  seguro_educativo numeric(12, 2) not null default 0,
  -- Lo que recibe la persona: salario neto (formal) o total USDT (externa).
  neto numeric(12, 2) not null default 0,
  pagado boolean,
  fecha_pago date,
  medio_pago text,
  referencia text,
  origen_pago text,
  tipo_pago text,
  observacion text,
  -- Neto recalculado con las fórmulas de la planilla menos el neto del Excel (0 si cuadra).
  diferencia_calculo numeric(12, 2) not null default 0,
  origen text not null default 'manual',
  origen_clave text unique,
  editado_a_mano boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists nom_lineas_periodo on nom_lineas (periodo, tipo);
create index if not exists nom_lineas_persona on nom_lineas (persona_id, periodo);

alter table nom_personas enable row level security;
alter table nom_periodos enable row level security;
alter table nom_lineas enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Costo de nómina por mes, tipo y tienda (para la conciliación con el libro)
-- ---------------------------------------------------------------------------------------------
-- Formal: lo pagado (neto), que es lo que el libro carga como SUELDOS; las retenciones (Seguro Social y Educativo) van
-- aparte porque el libro registra el pago a la Caja en otro tipo. Externa: el total USDT de cada pago (OTROS SUELDOS).
create or replace view nom_costo_mensual
with (security_invoker = true) as
select
  l.periodo,
  l.tipo,
  coalesce(l.unidad_id, p.unidad_id) as unidad_id,
  round(sum(l.total_bruto), 2) as bruto,
  round(sum(l.seguro_social + l.seguro_educativo), 2) as retenciones,
  round(sum(l.neto), 2) as neto,
  count(*) as lineas,
  count(distinct l.persona_id) as personas
from nom_lineas l
join nom_personas p on p.id = l.persona_id
group by l.periodo, l.tipo, coalesce(l.unidad_id, p.unidad_id);

comment on table nom_lineas is 'Portal AF4 360°: líneas de nómina (planilla formal de Panamá y colaboradores externos en USDT).';
comment on view nom_costo_mensual is 'Portal AF4 360°: costo de nómina por mes, tipo y tienda (formal = neto, externa = total USDT).';

-- ---------------------------------------------------------------------------------------------
-- Permiso: solo a quien ya administra Usuarios y roles (datos sensibles). Lo demás se da en Usuarios y roles.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'nomina', solo_lectura
from permisos_rol
where modulo = 'usuarios'
on conflict (rol_id, modulo) do nothing;
