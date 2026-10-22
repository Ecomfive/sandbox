-- Gestión de IDs Dropi › Asistente de IA (22 oct 2026).
--
-- Lo que la IA propone para una publicación, para no pagarlo dos veces, poder revisarlo después y aprender de lo que el equipo elige:
--  · tipo «analisis»: qué mejorar y en qué orden, y sugerencias de proceso para el equipo.
--  · tipo «titulos»: los títulos propuestos (ya revisados con las reglas) y el que eligió el equipo (quizá corregido).
--  · tipo «texto»: descripción y ángulos de venta (investigados en internet, con la foto del producto).
--  · tipo «fotos»: el plan de fotos que faltan y, de cada una, dónde quedó la imagen generada con Gemini (en Storage,
--    wms-productos/publicaciones/<publicación>/ia/).
-- Cada resultado puede llevar la valoración del equipo («me sirvió» / «no me sirvió») dentro de `resultado`.
-- Subir lo propuesto a Dropi se hace a mano por ahora.
--
-- Además, `dropi_ia_indicaciones`: lo que el equipo le dice a la IA (Reglas › Indicaciones para la IA), por parte: para todo, títulos,
-- descripción y ángulos, fotos, análisis. Se agrega a cada pedido.
--
-- Consumo de IA (OpenAI y Gemini, que también usa el Generador de landings):
--  · `ia_consumo`: una fila por cada uso (quién, para qué, tokens o imágenes y el costo estimado en dólares: ninguna de las dos APIs devuelve el costo).
--  · `ia_creditos`: el saldo que el equipo registra («saldo») y las recargas («recarga») de cada proveedor; con eso se estima cuánto crédito queda.
--  · `ia_consumo_config`: el aviso por proveedor: cuando el saldo estimado baja de ese monto sale en Hoy y en Avisos.
--
-- Reversa: supabase/rollbacks/0134_rollback.sql

create table if not exists dropi_publicaciones_ia (
  id uuid primary key default uuid_v7(),
  publicacion_id uuid not null references dropi_publicaciones (id) on delete cascade,
  tipo text not null check (tipo in ('analisis', 'titulos', 'texto', 'fotos')),
  resultado jsonb not null default '{}'::jsonb,
  -- Con qué modelo de texto se hizo (las fotos usan el de imágenes de Gemini).
  modelo text,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists dropi_publicaciones_ia_publicacion on dropi_publicaciones_ia (publicacion_id, tipo, creado_en desc);
create index if not exists dropi_publicaciones_ia_tipo on dropi_publicaciones_ia (tipo, creado_en desc);

create table if not exists dropi_ia_indicaciones (
  clave text primary key check (clave in ('general', 'titulo', 'descripcion', 'fotos', 'analisis')),
  texto text not null default '',
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  actualizado_por_nombre text
);

create table if not exists ia_consumo (
  id uuid primary key default uuid_v7(),
  proveedor text not null check (proveedor in ('openai', 'gemini', 'anthropic')),
  operacion text not null,
  modulo text not null default 'publicaciones-dropi',
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  busquedas integer not null default 0,
  imagenes integer not null default 0,
  costo_usd numeric(10, 4) not null default 0,
  ok boolean not null default true,
  error text,
  -- Sin llave foránea: el consumo se conserva aunque se borre la publicación o la landing.
  publicacion_id uuid,
  referencia text,
  usuario_id uuid,
  usuario_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists ia_consumo_proveedor on ia_consumo (proveedor, creado_en desc);
create index if not exists ia_consumo_fecha on ia_consumo (creado_en desc);

create table if not exists ia_creditos (
  id uuid primary key default uuid_v7(),
  proveedor text not null check (proveedor in ('openai', 'gemini', 'anthropic')),
  tipo text not null check (tipo in ('saldo', 'recarga')),
  monto_usd numeric(10, 2) not null check (monto_usd >= 0),
  nota text,
  usuario_id uuid,
  usuario_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists ia_creditos_proveedor on ia_creditos (proveedor, creado_en desc);

create table if not exists ia_consumo_config (
  proveedor text primary key check (proveedor in ('openai', 'gemini', 'anthropic')),
  umbral_usd numeric(10, 2) not null default 5 check (umbral_usd >= 0),
  actualizado_en timestamptz not null default now(),
  actualizado_por_nombre text
);

-- Solo el servidor (clave de servicio) toca los datos: RLS activado y sin políticas.
alter table dropi_publicaciones_ia enable row level security;
alter table dropi_ia_indicaciones enable row level security;
alter table ia_consumo enable row level security;
alter table ia_creditos enable row level security;
alter table ia_consumo_config enable row level security;
