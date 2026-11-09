-- Portal AF4 360° — fase 1: libro de movimientos y estado de resultados por tienda (ver FINANZAS-360.md).
--
-- Reemplaza la hoja «2026» de GASTOS_PANAMA_2026.xlsx: cada movimiento se clasifica por unidad de negocio (tienda o
-- unidad de gestión) y por tipo, y el tipo decide en qué sección del EERR cae. Lo cargado a una unidad «de reparto»
-- (A DISTRIBUIR) se reparte entre las tiendas en proporción a sus envíos del mes (`fin_base_distribucion`), que es la
-- regla que usa la hoja EERR.
--
-- RLS activado y sin políticas (ver SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas.
-- Las vistas llevan `security_invoker = true` para no saltarse ese RLS.

-- ---------------------------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_unidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- tienda: vende y tiene EERR propio · gestion: CORPORATIVO, INFORMACIÓN… · reparto: A DISTRIBUIR
  clase text not null default 'tienda' check (clase in ('tienda', 'gestion', 'reparto')),
  pais text not null default 'PA',
  -- Si recibe su parte de lo cargado a una unidad de reparto (solo tiendas).
  recibe_reparto boolean not null default true,
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);

create table if not exists fin_tipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  seccion text not null check (seccion in (
    'ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros',
    'impuesto_ganancias', 'informacion', 'patrimonial', 'pago_tdc', 'sin_clasificar'
  )),
  -- +1 suma al resultado (ingresos), -1 resta (costos, gastos y devoluciones).
  signo smallint not null default -1 check (signo in (-1, 1)),
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);

create table if not exists fin_cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  clase text not null default 'banco' check (clase in ('banco', 'tarjeta', 'billetera', 'otro')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Libro de movimientos
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_movimientos (
  id uuid primary key default gen_random_uuid(),
  -- Mes de imputación (primer día del mes): el de la columna MES del Excel.
  periodo date not null check (extract(day from periodo) = 1),
  fecha_registro date,
  unidad_id uuid not null references fin_unidades(id),
  tipo_id uuid references fin_tipos(id),
  -- El tipo tal como venía, por si no estaba en el catálogo (entonces tipo_id queda vacío).
  tipo_texto text,
  estatus_gestion text,
  unidad_a_pagar text,
  descripcion text not null default '',
  en_eerr boolean not null default true,
  en_flujo boolean not null default true,
  -- Siempre en dólares y positivo: el signo lo da el tipo.
  monto numeric(14, 2) not null,
  fecha_servicio date,
  fecha_pago date,
  cuenta_id uuid references fin_cuentas(id),
  factura text,
  factura_numero text,
  ruc_proveedor text,
  es_bien_de_uso boolean not null default false,
  -- De dónde salió: 'manual' (portal) o el nombre del archivo importado. La clave hace idempotente la importación.
  origen text not null default 'manual',
  origen_clave text unique,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index if not exists fin_movimientos_periodo on fin_movimientos (periodo, unidad_id);
create index if not exists fin_movimientos_tipo on fin_movimientos (tipo_id);

-- Base del reparto: envíos y entregados de cada tienda en el mes.
create table if not exists fin_base_distribucion (
  periodo date not null check (extract(day from periodo) = 1),
  unidad_id uuid not null references fin_unidades(id),
  envios integer not null default 0 check (envios >= 0),
  entregados integer not null default 0 check (entregados >= 0),
  origen text not null default 'manual',
  actualizado_en timestamptz not null default now(),
  primary key (periodo, unidad_id)
);

alter table fin_unidades enable row level security;
alter table fin_tipos enable row level security;
alter table fin_cuentas enable row level security;
alter table fin_movimientos enable row level security;
alter table fin_base_distribucion enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Catálogo inicial (hoja «Tabla de Datos»)
-- ---------------------------------------------------------------------------------------------
insert into fin_unidades (nombre, clase, recibe_reparto, orden) values
  ('NUVO PAN', 'tienda', true, 10),
  ('OFERFY PAN', 'tienda', true, 20),
  ('KENKU', 'tienda', true, 30),
  ('ECOMFIVE', 'tienda', true, 40),
  ('CALZADOS O.', 'tienda', true, 50),
  ('CLICKSI', 'tienda', true, 60),
  ('COSTA RICA', 'tienda', false, 70),
  ('NUVO COSTA RICA', 'tienda', false, 80),
  ('CORPORATIVO', 'gestion', false, 90),
  ('A DISTRIBUIR', 'reparto', false, 100),
  ('INFORMACIÓN', 'gestion', false, 110),
  ('ALCIDES', 'gestion', false, 120),
  -- Movimientos que llegan sin tienda: no entran al EERR de ninguna tienda hasta asignarlos.
  ('SIN ASIGNAR', 'gestion', false, 130)
on conflict (nombre) do nothing;

insert into fin_tipos (nombre, seccion, signo, orden) values
  ('Ingresos', 'ingresos', 1, 10),
  ('Devoluciones', 'ingresos', -1, 20),
  ('Compra Mercancia Local', 'costo_ventas', -1, 100),
  ('COSTO DE VENTAS', 'costo_ventas', -1, 105),
  ('Importación - Compra de mercancia', 'costo_ventas', -1, 110),
  ('Importación - Compra de mercancia FINANCIAMIENTO', 'costo_ventas', -1, 111),
  ('Importación - Compra de mercancia PAGO PRESTAMO', 'costo_ventas', -1, 112),
  ('Importación - Envíos', 'costo_ventas', -1, 113),
  ('Importación - Impuestos', 'costo_ventas', -1, 114),
  ('Otros gastos de importación', 'costo_ventas', -1, 115),
  ('Scrap', 'costo_ventas', -1, 120),
  ('Costos de Plataforma comercial', 'costo_ventas', -1, 125),
  ('Packaging', 'costo_ventas', -1, 130),
  ('Shipping por Ventas', 'costo_ventas', -1, 135),
  ('Shipping por Ventas Cambios', 'costo_ventas', -1, 136),
  ('Costos de procesamiento', 'costo_ventas', -1, 140),
  ('Impuestos sobre ventas', 'costo_ventas', -1, 145),
  ('Oficina - ARRIENDO', 'administracion', -1, 200),
  ('Almacen - ARRIENDO', 'administracion', -1, 201),
  ('Oficina - SERVICIOS', 'administracion', -1, 205),
  ('GASTOS VARIOS OFICINA', 'administracion', -1, 210),
  ('SISTEMAS', 'administracion', -1, 215),
  ('SUELDOS', 'administracion', -1, 220),
  ('OTROS SUELDOS', 'administracion', -1, 225),
  ('Otros Gastos Administración', 'administracion', -1, 230),
  ('Comisiones Gerenciales', 'administracion', -1, 235),
  ('Anticipo Comisión Gerencial', 'administracion', -1, 236),
  ('Alta Bien de Uso', 'administracion', -1, 240),
  ('Comisiones bancarias', 'finanzas', -1, 300),
  ('Intereses pérdidos', 'finanzas', -1, 305),
  ('Gastos Financieros - Intereses', 'finanzas', -1, 310),
  ('Gastos Financieros - FECI', 'finanzas', -1, 315),
  ('Amortización de Financiamiento', 'finanzas', -1, 320),
  ('Diferencia de Cambio', 'finanzas', -1, 325),
  ('Interes ganados', 'finanzas', 1, 330),
  ('Aporte Capital', 'patrimonial', 1, 335),
  ('Compensación Deuda Intertiendas', 'finanzas', -1, 340),
  ('Prestamos Intertiendas', 'finanzas', -1, 345),
  ('Publicidad Online - FACEBOOK', 'marketing', -1, 400),
  ('Publicidad Online - TIKTOK', 'marketing', -1, 405),
  ('Publicidad Online - GOOGLE ADS', 'marketing', -1, 410),
  ('Publicidad Online - OTROS', 'marketing', -1, 415),
  ('Publicidad Offline', 'marketing', -1, 420),
  ('Capacitaciones', 'otros', -1, 500),
  ('Movimiento Bancario', 'otros', -1, 505),
  ('Uso Oficina', 'otros', -1, 510),
  ('Retiro de dividendos', 'otros', -1, 515),
  ('Impuesto a las Ganancias', 'impuesto_ganancias', -1, 600),
  ('PAGO TDC', 'pago_tdc', -1, 700),
  ('INFORMACIÓN', 'informacion', -1, 710),
  ('INTERCOMPANY CR', 'patrimonial', -1, 800),
  ('INTERCOMPANY VZLA', 'patrimonial', -1, 801),
  ('INTERCOMPANY CL', 'patrimonial', -1, 802),
  ('INTERCOMPANY CO', 'patrimonial', -1, 803),
  ('INTERCOMPANY MX', 'patrimonial', -1, 804),
  ('INTERCOMPANY CALZADOS', 'patrimonial', -1, 805),
  ('INTERCOMPANY AMENA', 'patrimonial', -1, 806),
  ('OTROS CRÉDITOS', 'patrimonial', -1, 810),
  ('BIENES DE USO', 'patrimonial', -1, 815),
  ('DIVIDENDOS', 'patrimonial', -1, 820)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Estado de resultados por tienda
-- ---------------------------------------------------------------------------------------------
-- Secciones que forman el EERR; información, pago de tarjeta y patrimoniales quedan fuera aunque estén en «SI».
create or replace view fin_eerr_mensual
with (security_invoker = true) as
with movs as (
  select m.periodo, m.unidad_id, u.clase, m.tipo_id, m.monto
  from fin_movimientos m
  join fin_unidades u on u.id = m.unidad_id
  join fin_tipos t on t.id = m.tipo_id
  where m.en_eerr
    and t.seccion in ('ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros', 'impuesto_ganancias')
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

-- Lo que quedó cargado a A DISTRIBUIR en un mes sin base de envíos: no se repartió y hay que cargar la base.
create or replace view fin_reparto_pendiente
with (security_invoker = true) as
select m.periodo, round(sum(m.monto), 2) as monto, count(*) as movimientos
from fin_movimientos m
join fin_unidades u on u.id = m.unidad_id and u.clase = 'reparto'
join fin_tipos t on t.id = m.tipo_id
where m.en_eerr
  and t.seccion in ('ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros', 'impuesto_ganancias')
  and not exists (
    select 1 from fin_base_distribucion b join fin_unidades bu on bu.id = b.unidad_id
    where b.periodo = m.periodo and bu.recibe_reparto and b.envios > 0
  )
group by m.periodo;

-- Movimientos con un tipo que no está en el catálogo: no entran al EERR hasta clasificarlos.
create or replace view fin_movimientos_sin_tipo
with (security_invoker = true) as
select periodo, coalesce(tipo_texto, '(vacío)') as tipo_texto, count(*) as movimientos, round(sum(monto), 2) as monto
from fin_movimientos
where tipo_id is null
group by 1, 2;

comment on table fin_movimientos is 'Portal AF4 360°: libro de movimientos (reemplaza la hoja «2026» de GASTOS_PANAMA).';
comment on view fin_eerr_mensual is 'Portal AF4 360°: EERR por mes, tienda y tipo; A DISTRIBUIR repartido por envíos.';

-- Permiso: el mismo de Estado de resultados (lo reciben quienes tienen Gastos, migración 0900).
