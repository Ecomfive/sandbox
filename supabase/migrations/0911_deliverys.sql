-- Portal AF4 360° — Operación › Deliverys: liquidación semanal de los repartidores.
--
-- Reemplaza GESTION_DELIVERYS_<mes>.xlsx de Majo:
--  * «GESTION DELIVERY II»: una fila por día y repartidor (o zona de un repartidor) con los pedidos que salió a repartir
--    de cada tienda y, por tarifa, cuántos entregó y cuántos fallaron (un intento fallido se paga igual). Aquí cada celda
--    es una línea de `del_entregas` (cantidad × tarifa); también se cargan entregas sueltas (con su orden y lo cobrado
--    contra entrega).
--  * «CIERRE SEMANAL DELIVERY»: la suma de la semana (de jueves a miércoles) por repartidor y tienda → `del_cierres`,
--    con adelantos, descuentos, efectivo por rendir y el neto. Clicksi paga sus envíos aparte (`del_tiendas.pago_aparte`).
--  * «RECIBOS DE PAGOS»: el recibo de servicios de delivery independiente → `del_recibos` (uno por cierre pagado).
--
-- Datos personales (documento, teléfono): solo los ve quien tiene el módulo, enmascarados fuera de la ficha. RLS activado
-- y sin políticas (SEGURIDAD.md, migración 0063): solo el servidor, con la clave de servicio, toca estas tablas. La vista
-- lleva `security_invoker = true`.
--
-- No escribe en `fin_movimientos` por su cuenta: al registrar un pago se puede pedir que se cree el movimiento del libro
-- (origen `deliverys`, una línea por tienda, tipo «Shipping por Ventas»).
--
-- Se puede correr más de una vez.

-- ---------------------------------------------------------------------------------------------
-- Tiendas: cómo las llama la hoja y si pagan sus envíos aparte
-- ---------------------------------------------------------------------------------------------
create table if not exists del_tiendas (
  unidad_id uuid primary key references fin_unidades(id),
  -- El nombre en la hoja (CALZADOS, OFERFY, KENKU, CLICKSI, NUVO).
  etiqueta text not null unique,
  -- La tienda paga los envíos por su cuenta (Clicksi): no entra al recibo ni al libro de la empresa.
  pago_aparte boolean not null default false,
  creado_en timestamptz not null default now()
);

insert into del_tiendas (unidad_id, etiqueta, pago_aparte)
select u.id, x.etiqueta, x.pago_aparte
from (values
  ('CALZADOS O.', 'CALZADOS', false),
  ('OFERFY PAN', 'OFERFY', false),
  ('KENKU', 'KENKU', false),
  ('CLICKSI', 'CLICKSI', true),
  ('NUVO PAN', 'NUVO', false)
) as x(nombre, etiqueta, pago_aparte)
join fin_unidades u on u.nombre = x.nombre
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- Repartidores
-- ---------------------------------------------------------------------------------------------
create table if not exists del_repartidores (
  id uuid primary key default gen_random_uuid(),
  -- Nombre normalizado (mayúsculas, sin acentos, un espacio): identifica al repartidor al importar.
  clave text not null unique,
  nombre text not null,
  -- Cédula o pasaporte y teléfono: completos solo en su ficha y en el recibo; enmascarados en listas.
  documento text,
  telefono text,
  -- Otros nombres con que aparece en la hoja (sus zonas: «ZONA 5 …», «CHORRERA»…), ya normalizados.
  alias text[] not null default '{}',
  -- Tarifas propias por categoría ({"entrega": 3.65, …}); vacío = las de la hoja.
  tarifas jsonb,
  medio_pago text check (medio_pago is null or medio_pago in ('transferencia', 'efectivo', 'yappy')),
  activo boolean not null default true,
  nota text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Cierres semanales (repartidor + semana de jueves a miércoles)
-- ---------------------------------------------------------------------------------------------
create table if not exists del_cierres (
  id uuid primary key default gen_random_uuid(),
  repartidor_id uuid not null references del_repartidores(id),
  -- Jueves de la semana.
  semana date not null check (extract(isodow from semana) = 4),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'pagado')),
  adelantos numeric(12, 2) not null default 0 check (adelantos >= 0),
  descuentos numeric(12, 2) not null default 0 check (descuentos >= 0),
  nota text,
  -- Lo que quedó al cerrar (mientras está abierto se calcula de las entregas).
  en_ruta integer,
  entregas integer,
  fallidas integer,
  devueltas integer,
  reprogramadas integer,
  tarifas numeric(12, 2),
  propinas numeric(12, 2),
  aparte numeric(12, 2),
  cobrado_efectivo numeric(12, 2),
  a_pagar numeric(12, 2),
  -- a_pagar − adelantos − descuentos − efectivo cobrado: positivo se le paga, negativo el repartidor entrega.
  neto numeric(12, 2),
  -- Totales por tienda al cerrar: [{tienda, pagoAparte, entregas, fallidas, devueltas, tarifas, propinas, total}].
  detalle jsonb,
  cerrado_en timestamptz,
  cerrado_por uuid references auth.users(id),
  fecha_pago date,
  metodo_pago text check (metodo_pago is null or metodo_pago in ('transferencia', 'efectivo', 'yappy')),
  referencia_pago text,
  cuenta_id uuid references fin_cuentas(id),
  pagado_en timestamptz,
  pagado_por uuid references auth.users(id),
  -- Se crearon sus movimientos en el libro (origen `deliverys`).
  en_libro boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (repartidor_id, semana),
  check (estado = 'abierto' or neto is not null),
  check (estado <> 'pagado' or fecha_pago is not null)
);

-- ---------------------------------------------------------------------------------------------
-- Entregas: una línea por pedido (cargado a mano) o por celda de la hoja (cantidad × tarifa)
-- ---------------------------------------------------------------------------------------------
create table if not exists del_entregas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  -- Jueves de su semana de cierre (jueves a miércoles).
  semana date generated always as (fecha - ((extract(isodow from fecha)::integer + 3) % 7)) stored,
  repartidor_id uuid not null references del_repartidores(id),
  -- El nombre de la hoja tal como venía (el repartidor o una zona suya).
  etiqueta text,
  zona text,
  unidad_id uuid not null references fin_unidades(id),
  orden text,
  -- compartida 1.83 · cambio/retiro/complemento 2.00 o 2.50 · entrega 3.65 o 5 · fuera de ruta 4 · propina. Sin
  -- categoría: salió a ruta y volvió sin cobrar tarifa.
  categoria text check (categoria is null or categoria in ('compartida', 'cambio', 'entrega', 'fuera_ruta', 'propina')),
  estado text not null check (estado in ('entregado', 'fallido', 'devuelto', 'reprogramado')),
  cantidad integer not null default 1 check (cantidad > 0),
  -- Por unidad; en una propina, su monto (cantidad 1).
  tarifa numeric(10, 2) not null default 0 check (tarifa >= 0),
  monto numeric(12, 2) generated always as (case when categoria is null then 0 else round(cantidad * tarifa, 2) end) stored,
  monto_cobrar numeric(12, 2) check (monto_cobrar is null or monto_cobrar >= 0),
  cobrado numeric(12, 2) check (cobrado is null or cobrado >= 0),
  metodo_cobro text check (metodo_cobro is null or metodo_cobro in ('efectivo', 'yappy', 'transferencia', 'tarjeta', 'prepagado')),
  cierre_id uuid references del_cierres(id) on delete set null,
  nota text,
  origen text not null default 'manual',
  origen_clave text unique,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists del_entregas_semana on del_entregas (semana, repartidor_id);
create index if not exists del_entregas_origen on del_entregas (origen);
create index if not exists del_entregas_cierre on del_entregas (cierre_id);

-- ---------------------------------------------------------------------------------------------
-- Recibos (uno por cierre pagado; guarda los datos como quedaron al pagar)
-- ---------------------------------------------------------------------------------------------
create table if not exists del_recibos (
  id uuid primary key default gen_random_uuid(),
  numero integer generated always as identity unique,
  cierre_id uuid not null unique references del_cierres(id),
  repartidor_id uuid not null references del_repartidores(id),
  semana date not null,
  -- pago: la empresa le paga · rendicion: el repartidor entrega el efectivo que cobró de más.
  tipo text not null default 'pago' check (tipo in ('pago', 'rendicion')),
  monto numeric(12, 2) not null check (monto >= 0),
  fecha_pago date not null,
  metodo_pago text not null check (metodo_pago in ('transferencia', 'efectivo', 'yappy')),
  referencia text,
  nombre text not null,
  documento text,
  empresa text not null,
  empresa_ruc text,
  -- «8 al 14 de octubre de 2026».
  periodo_texto text not null,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

alter table del_tiendas enable row level security;
alter table del_repartidores enable row level security;
alter table del_cierres enable row level security;
alter table del_entregas enable row level security;
alter table del_recibos enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Totales de cada repartidor por semana (la suma se hace aquí, no en JavaScript)
-- ---------------------------------------------------------------------------------------------
create or replace view del_semanas
with (security_invoker = true) as
select
  e.repartidor_id,
  e.semana,
  coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina'), 0)::integer as en_ruta,
  coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'entregado'), 0)::integer as entregas,
  coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'fallido'), 0)::integer as fallidas,
  coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'devuelto'), 0)::integer as devueltas,
  coalesce(sum(e.cantidad) filter (where e.categoria is distinct from 'propina' and e.estado = 'reprogramado'), 0)::integer as reprogramadas,
  coalesce(sum(e.monto) filter (where e.categoria is distinct from 'propina' and not coalesce(t.pago_aparte, false)), 0)::numeric(12, 2) as tarifas,
  coalesce(sum(e.monto) filter (where e.categoria = 'propina' and not coalesce(t.pago_aparte, false)), 0)::numeric(12, 2) as propinas,
  coalesce(sum(e.monto) filter (where coalesce(t.pago_aparte, false)), 0)::numeric(12, 2) as aparte,
  coalesce(sum(e.cobrado) filter (where e.metodo_cobro = 'efectivo'), 0)::numeric(12, 2) as cobrado_efectivo,
  count(*)::integer as lineas
from del_entregas e
left join del_tiendas t on t.unidad_id = e.unidad_id
group by e.repartidor_id, e.semana;

comment on table del_entregas is 'Portal AF4 360°: entregas de los repartidores (una por pedido o una por celda de la hoja GESTION DELIVERY II).';
comment on table del_cierres is 'Portal AF4 360°: cierre semanal (jueves a miércoles) de cada repartidor.';
comment on view del_semanas is 'Portal AF4 360°: totales de cada repartidor por semana de cierre.';

-- ---------------------------------------------------------------------------------------------
-- Permiso: a los roles que ya tienen el Libro de movimientos. Lo demás se da en Usuarios y roles.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'deliverys', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
