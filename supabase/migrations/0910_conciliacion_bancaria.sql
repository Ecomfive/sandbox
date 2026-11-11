-- Portal AF4 360° fase 5: Conciliación bancaria (ver FINANZAS-360.md). Reemplaza CONCILIACIONES_DE_BANCO_PRUEBA.xlsx.
--
-- Cada línea del extracto de un banco (Banco General, BAC Oceans, BAC Ecomfive…) se concilia contra:
--   (a) movimientos del libro (`fin_movimientos`): misma cuenta, mismo monto con su signo y fecha de pago ± días; uno
--       a uno o una línea = suma de varios movimientos. Son SOLO sugerencias con puntaje: las confirma una persona.
--   (b) liquidaciones de cobro (`conc_fuentes_cobro`): Yappy (el depósito de un día = la suma de los cobros del día
--       anterior), MiPOS (tarjeta, llega neto de comisión) y Servientrega (contra entrega: el código de consignación
--       trae la referencia bancaria del depósito). Un depósito suma varios cobros.
--   (c) órdenes de tienda (`conc_ordenes`, puente): las órdenes que trae el propio libro de conciliación (Monday,
--       Servientrega). La pantalla las lee por la vista `conc_ordenes_fuente`; cuando exista `ven_ordenes` (0122) basta
--       con redefinir esa vista (las parejas guardan `orden_id` + `orden_fuente`, sin llave foránea, a propósito).
--
-- Estado de una línea: pendiente → sugerida (tiene una propuesta) → conciliada (pareja confirmada) · o ignorada (con
-- motivo). Solo se concilia SIN una persona lo que trae prueba: un corte de Yappy cuya suma y número de cobros calzan,
-- o una consignación de Servientrega cuya referencia bancaria y monto calzan con la línea.
--
-- Lo que el banco tiene y el libro no se crea en el libro desde aquí (origen 'conciliacion', `editado_a_mano`).
--
-- RLS activado y sin políticas (ver SEGURIDAD.md): solo el servidor, con la clave de servicio. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- Extractos y líneas
-- ---------------------------------------------------------------------------------------------
create table if not exists conc_extractos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references fin_cuentas(id),
  -- Archivo y hoja de donde salió (o «csv»). La clave hace que reimportar el mismo archivo no duplique.
  archivo text not null,
  hoja text not null default '',
  formato text not null default 'generico' check (formato in ('banco_general', 'bac', 'generico')),
  desde date,
  hasta date,
  lineas integer not null default 0,
  clave text not null unique,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create table if not exists conc_lineas (
  id uuid primary key default gen_random_uuid(),
  extracto_id uuid references conc_extractos(id) on delete set null,
  cuenta_id uuid not null references fin_cuentas(id),
  fecha date not null,
  -- Posición dentro del extracto: ordena las líneas de un mismo día (y da el saldo final cuando el banco lo trae).
  orden integer not null default 0,
  descripcion text not null default '',
  referencia text,
  referencia_extra text,
  codigo text,
  -- Con signo: crédito (entra) positivo, débito (sale) negativo.
  monto numeric(14, 2) not null check (monto <> 0),
  saldo numeric(14, 2),
  -- Qué es, según la descripción (`clasificarLinea`): decide contra qué se busca.
  clase text not null default 'otro' check (clase in (
    'yappy', 'comision_yappy', 'servientrega', 'deposito_efectivo', 'transferencia_recibida', 'mipos',
    'comision_bancaria', 'pago', 'otro'
  )),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'sugerida', 'conciliada', 'ignorada')),
  motivo text,
  tienda text,
  -- Lo que decía el Excel de conciliación al importarlo (para comparar con lo que hace el portal).
  estado_excel text,
  huella text not null unique,
  conciliada_en timestamptz,
  conciliada_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (estado <> 'ignorada' or coalesce(trim(motivo), '') <> '')
);

create index if not exists conc_lineas_cuenta_fecha on conc_lineas (cuenta_id, fecha);
create index if not exists conc_lineas_estado on conc_lineas (estado);

-- ---------------------------------------------------------------------------------------------
-- Fuentes de cobro: Yappy, MiPOS y Servientrega (una fila por cobro o guía)
-- ---------------------------------------------------------------------------------------------
create table if not exists conc_fuentes_cobro (
  id uuid primary key default gen_random_uuid(),
  fuente text not null check (fuente in ('yappy', 'mipos', 'servientrega')),
  -- Fecha del cobro (Yappy/MiPOS) o de la entrega (Servientrega).
  fecha date not null,
  -- Cuándo debería llegar al banco: la del código de consignación de Servientrega. Vacía = se calcula.
  fecha_deposito date,
  -- Referencia del cobro (Yappy), n.º de autorización (MiPOS) o n.º de guía (Servientrega).
  referencia text,
  -- Cómo se liquidan juntos: el código de consignación (Servientrega), el lote (MiPOS). Yappy liquida por día.
  lote text,
  -- Referencia bancaria que trae el código de consignación («BAC6458CPL…» → 6458): la prueba del depósito.
  referencia_banco text,
  orden text,
  tienda text,
  repartidor text,
  metodo text,
  monto_bruto numeric(14, 2) not null,
  comision numeric(14, 2) not null default 0,
  neto numeric(14, 2) generated always as (monto_bruto - comision) stored,
  anulada boolean not null default false,
  estado_excel text,
  huella text not null unique,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists conc_fuentes_cobro_fecha on conc_fuentes_cobro (fuente, fecha);
create index if not exists conc_fuentes_cobro_lote on conc_fuentes_cobro (lote);

-- ---------------------------------------------------------------------------------------------
-- Órdenes de tienda (puente hasta `ven_ordenes`)
-- ---------------------------------------------------------------------------------------------
create table if not exists conc_ordenes (
  id uuid primary key default gen_random_uuid(),
  tienda text,
  -- N.º de orden de la tienda, o «CIERRE dd/mm/aaaa» para el cierre diario de un repartidor.
  numero text not null,
  fecha date,
  monto numeric(14, 2) not null,
  metodo_pago text not null check (metodo_pago in ('yappy', 'tarjeta', 'servientrega', 'efectivo', 'transferencia', 'cierre')),
  repartidor text,
  fuente text not null default 'libro_conciliacion',
  huella text not null unique,
  creado_en timestamptz not null default now()
);

create index if not exists conc_ordenes_fecha on conc_ordenes (fecha);

-- La pantalla lee las órdenes por aquí. Para pasar a `ven_ordenes`: `create or replace view conc_ordenes_fuente` con
-- las mismas columnas sacadas de ven_ordenes (y `'ven_ordenes' as fuente`).
create or replace view conc_ordenes_fuente
with (security_invoker = true) as
select id, tienda, numero, fecha, monto, metodo_pago, repartidor, fuente
from conc_ordenes;

-- ---------------------------------------------------------------------------------------------
-- Parejas: qué cubre cada línea
-- ---------------------------------------------------------------------------------------------
create table if not exists conc_pares (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references conc_lineas(id) on delete cascade,
  clase text not null check (clase in ('movimiento', 'cobro', 'orden')),
  movimiento_id uuid references fin_movimientos(id) on delete cascade,
  cobro_id uuid references conc_fuentes_cobro(id) on delete cascade,
  orden_id uuid,
  orden_fuente text,
  -- Lo que esta parte cubre de la línea, con el signo de la línea (neto de su comisión).
  monto numeric(14, 2) not null,
  -- Comisión descontada de esta parte (MiPOS: llega neto). La suma de los montos es lo depositado.
  comision numeric(14, 2) not null default 0,
  puntaje smallint not null check (puntaje between 0 and 100),
  metodo text not null check (metodo in ('exacto', 'suma', 'corte', 'referencia', 'comision')),
  -- Las partes de una misma propuesta (un depósito = varios cobros) comparten el grupo.
  grupo text not null,
  -- Cómo se muestra la propuesta («Yappy del 02/09 (31 cobros)», «Libro · 2 movimientos»).
  detalle text,
  estado text not null default 'sugerido' check (estado in ('sugerido', 'confirmado', 'descartado')),
  -- Confirmado por el sistema (solo con prueba: corte de Yappy o referencia de Servientrega).
  auto boolean not null default false,
  -- La propuesta elegida para la línea (la de más puntaje cuyas partes nadie más tomó). Las demás son alternativas: se ven
  -- en la ficha, pero una línea con solo alternativas sigue pendiente.
  principal boolean not null default false,
  creado_en timestamptz not null default now(),
  confirmado_en timestamptz,
  confirmado_por uuid references auth.users(id),
  check (
    (clase = 'movimiento' and movimiento_id is not null and cobro_id is null and orden_id is null)
    or (clase = 'cobro' and cobro_id is not null and movimiento_id is null and orden_id is null)
    or (clase = 'orden' and orden_id is not null and movimiento_id is null and cobro_id is null)
  )
);

create index if not exists conc_pares_linea on conc_pares (linea_id, estado);
-- Un movimiento, un cobro o una orden se concilia una sola vez.
create unique index if not exists conc_pares_mov_unico on conc_pares (movimiento_id) where estado = 'confirmado' and movimiento_id is not null;
create unique index if not exists conc_pares_cobro_unico on conc_pares (cobro_id) where estado = 'confirmado' and cobro_id is not null;
create unique index if not exists conc_pares_orden_unico on conc_pares (orden_fuente, orden_id) where estado = 'confirmado' and orden_id is not null;
-- La misma parte no se propone dos veces para la misma línea.
create unique index if not exists conc_pares_sin_repetir on conc_pares (linea_id, coalesce(movimiento_id, cobro_id, orden_id)) where estado <> 'descartado';

alter table conc_extractos enable row level security;
alter table conc_lineas enable row level security;
alter table conc_fuentes_cobro enable row level security;
alter table conc_ordenes enable row level security;
alter table conc_pares enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Resumen por cuenta y mes (lo agrega Postgres, no la página)
-- ---------------------------------------------------------------------------------------------
create or replace view conc_resumen_mensual
with (security_invoker = true) as
with ordenadas as (
  select l.*, date_trunc('month', l.fecha)::date as mes,
         row_number() over (partition by l.cuenta_id, date_trunc('month', l.fecha) order by l.fecha desc, l.orden desc, l.id desc) as desde_el_final
  from conc_lineas l
)
select
  cuenta_id,
  mes,
  count(*)::integer as lineas,
  count(*) filter (where estado = 'conciliada')::integer as conciliadas,
  count(*) filter (where estado = 'sugerida')::integer as sugeridas,
  count(*) filter (where estado = 'pendiente')::integer as pendientes,
  count(*) filter (where estado = 'ignorada')::integer as ignoradas,
  round(coalesce(sum(monto) filter (where monto > 0), 0), 2) as creditos,
  round(coalesce(-sum(monto) filter (where monto < 0), 0), 2) as debitos,
  round(sum(monto), 2) as neto,
  round(coalesce(sum(abs(monto)) filter (where estado in ('pendiente', 'sugerida')), 0), 2) as sin_conciliar,
  -- El saldo que trae la última línea del mes (si el extracto trae saldo).
  max(saldo) filter (where desde_el_final = 1) as saldo_final
from ordenadas
group by cuenta_id, mes;

comment on table conc_lineas is 'Portal AF4 360°: líneas de extractos bancarios con su estado de conciliación.';
comment on table conc_fuentes_cobro is 'Portal AF4 360°: cobros de Yappy, MiPOS y Servientrega que se liquidan al banco.';
comment on table conc_ordenes is 'Portal AF4 360°: órdenes de tienda del libro de conciliación (puente hasta ven_ordenes).';
comment on table conc_pares is 'Portal AF4 360°: qué movimiento del libro, cobro u orden cubre cada línea del banco.';
comment on view conc_resumen_mensual is 'Portal AF4 360°: conciliación por cuenta y mes (líneas por estado, monto sin conciliar, saldo).';

-- ---------------------------------------------------------------------------------------------
-- Permiso: lo recibe quien ya tiene el Libro de movimientos, con su mismo solo lectura.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'conciliacion-bancaria', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
