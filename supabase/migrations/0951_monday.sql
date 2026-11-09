-- Portal AF4 360° — Conexión con Monday.com (Fase 2: despachos y entregas desde el tablero de despachos de Monday).
-- Ver FINANZAS-360.md › «Monday.com».
--
-- 1. `mon_config`: una sola fila (id = 1) con el id del tablero, el mapeo de sus columnas a los datos del portal (número de
--    pedido, tienda, courier, estado, causa de rechazo, fecha de despacho, fecha de entrega, remisión), la regla de los
--    estados (etiqueta de Monday → entregado / rechazado / cancelado / en ruta) y el avance de la lectura incremental
--    (`cursor_actualizado`: el `updated_at` más nuevo leído), la última lectura y el último error. El token
--    (`MONDAY_API_TOKEN`) vive solo en las variables del servidor.
-- 2. `mon_despachos`: un ítem del tablero por fila, enlazado a la orden de Ventas por tienda (`ven_ordenes`) por número de
--    pedido y tienda. `periodo` es el mes de la orden (o, sin orden, el de la fecha de despacho).
-- 3. `mon_causas`: catálogo editable de causas de rechazo con sus palabras clave (agrupa los textos libres del tablero) y
--    `mon_causa_textos`: un texto concreto asignado a mano a una causa (manda sobre las palabras clave).
--
-- RLS activado y sin políticas (SEGURIDAD.md): solo el servidor, con la clave de servicio. Se puede correr dos veces.

create table if not exists mon_config (
  id smallint primary key default 1 check (id = 1),
  tablero_id text check (tablero_id is null or tablero_id ~ '^[0-9]{1,20}$'),
  tablero_nombre text,
  columnas jsonb not null default '{}'::jsonb,
  estados jsonb not null default '{}'::jsonb,
  cursor_actualizado timestamptz,
  items integer not null default 0,
  ultima_lectura timestamptz,
  ultimo_error text check (ultimo_error is null or length(ultimo_error) <= 1000),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table mon_config enable row level security;
comment on table mon_config is 'Portal AF4 360°: tablero de despachos de Monday.com, mapeo de columnas y avance de la lectura.';

create table if not exists mon_despachos (
  item_id text primary key check (item_id ~ '^[0-9]{1,20}$'),
  tablero_id text not null,
  nombre text,
  numero_pedido text,
  tienda_texto text,
  unidad_id uuid references fin_unidades(id) on delete set null,
  orden_id uuid references ven_ordenes(id) on delete set null,
  courier text,
  estado text,
  estado_grupo text not null default 'sin_estado'
    check (estado_grupo in ('entregado', 'rechazado', 'cancelado', 'en_ruta', 'sin_estado')),
  causa_rechazo text,
  fecha_despacho date,
  fecha_entrega date,
  remision text,
  periodo date check (periodo is null or extract(day from periodo) = 1),
  actualizado_monday timestamptz,
  leido_en timestamptz not null default now()
);
create index if not exists mon_despachos_periodo on mon_despachos (periodo, unidad_id);
create index if not exists mon_despachos_orden on mon_despachos (orden_id);
alter table mon_despachos enable row level security;
comment on table mon_despachos is 'Portal AF4 360°: despachos leídos del tablero de Monday.com, enlazados a ven_ordenes.';

create table if not exists mon_causas (
  codigo text primary key check (codigo ~ '^[a-z0-9_]{1,40}$'),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  -- Palabras o frases (sin acentos, en mayúsculas al comparar) que la reconocen en el texto libre.
  palabras text[] not null default '{}',
  orden smallint not null default 100,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table mon_causas enable row level security;

create table if not exists mon_causa_textos (
  -- El texto normalizado (mayúsculas, sin acentos ni espacios dobles).
  texto text primary key check (length(texto) between 1 and 300),
  codigo text not null references mon_causas(codigo) on delete cascade,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table mon_causa_textos enable row level security;

insert into mon_causas (codigo, nombre, palabras, orden) values
  ('no_responde', 'Cliente no responde', array['NO RESPONDE', 'NO CONTESTA', 'APAGADO', 'BUZON', 'NO LOCALIZADO', 'SIN RESPUESTA'], 10),
  ('rechaza', 'Cliente rechaza el pedido', array['RECHAZ', 'NO LO QUIERE', 'YA NO', 'NO DESEA', 'NO PIDIO', 'ARREPENT'], 20),
  ('sin_dinero', 'Cliente sin dinero', array['SIN DINERO', 'NO TIENE DINERO', 'NO TIENE PLATA', 'NO TIENE EFECTIVO', 'SIN EFECTIVO'], 30),
  ('direccion', 'Dirección errada o incompleta', array['DIRECCION', 'NO EXISTE', 'NO UBICA', 'INCOMPLETA', 'ERRADA'], 40),
  ('reprograma', 'Reprogramado por el cliente', array['REPROGRAM', 'OTRO DIA', 'POSPON', 'NO ESTA', 'AUSENTE'], 50),
  ('cobertura', 'Fuera de cobertura', array['COBERTURA', 'ZONA ROJA', 'FUERA DE RUTA', 'LEJOS'], 60),
  ('producto', 'Producto dañado o equivocado', array['DANAD', 'ROTO', 'EQUIVOCAD', 'INCORRECT', 'DEFECT'], 70),
  ('otro', 'Otra causa', array[]::text[], 999)
on conflict (codigo) do nothing;
