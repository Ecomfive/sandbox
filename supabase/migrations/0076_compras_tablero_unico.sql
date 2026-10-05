-- Compras: un solo tablero para todos los países y para las compras de Importadora, con todo lo que trae ClickUp.
--
-- * `tipo`: 'pais' (compras nuestras de un país: llevan `pais_id`) o 'importacion' («Compras Importadora»: un servicio a
--   clientes que nos piden mercancía de cualquier parte del mundo y se la entregamos puerta a puerta; NO es una compra
--   nuestra, así que no lleva país aunque se entregue en Panamá: el destino va en `paises_destino`). Nunca se mezclan.
-- * Columnas nuevas para lo que ClickUp tenía y no estaba aquí (código, vía de envío, prioridad, etiquetas, responsable,
--   creador, descripción, URL del producto, fechas de inicio y cierre) y el registro original de cada tarea (`clickup`),
--   para que nada se pierda.
-- * Tablas hijas: comentarios, subtareas (las alternativas de proveedor), adjuntos y eventos (cada cambio de estado o de
--   etapa con su fecha y hora: la base de los tiempos por etapa del dashboard).

-- Los países donde hay compras en ClickUp y todavía no estaban.
insert into paises (codigo, nombre) values
  ('VE', 'Venezuela'), ('SV', 'El Salvador'), ('NI', 'Nicaragua'), ('GT', 'Guatemala'), ('HN', 'Honduras')
on conflict (codigo) do nothing;

alter table wms_compras alter column pais_id drop not null;

alter table wms_compras
  add column if not exists tipo text not null default 'pais',
  add column if not exists codigo text,
  add column if not exists via_envio text[] not null default '{}',
  add column if not exists prioridad text,
  add column if not exists etiquetas text[] not null default '{}',
  add column if not exists responsable_nombre text,
  add column if not exists creador_nombre text,
  add column if not exists descripcion text,
  add column if not exists url_producto text,
  add column if not exists paises_destino text[] not null default '{}',
  add column if not exists fecha_inicio date,
  add column if not exists cerrado_en timestamptz,
  add column if not exists clickup_id text unique,
  add column if not exists clickup_lista text,
  add column if not exists clickup jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wms_compras_tipo_valido') then
    alter table wms_compras add constraint wms_compras_tipo_valido check (
      tipo in ('pais', 'importacion')
      -- Una compra de país lleva su país; una de Importadora nunca (no es nuestra).
      and ((tipo = 'pais') = (pais_id is not null))
      and (prioridad is null or prioridad in ('urgente', 'alta', 'normal', 'baja'))
      and via_envio <@ array['aire', 'mar', 'tierra']::text[]
    );
  end if;
end $$;

create index if not exists wms_compras_tipo_idx on wms_compras (tipo, pais_id, creado_en desc);

-- Lo que antes daba acceso a cualquiera con sesión (0050) ya lo quitó la 0063; por si quedó, se borra.
drop policy if exists "authenticated read/write" on wms_compras;

-- Comentarios de una compra (los de ClickUp con su autor y hora, y los que se escriban aquí).
create table if not exists wms_compra_comentarios (
  id uuid primary key default uuid_v7(),
  compra_id uuid not null references wms_compras(id) on delete cascade,
  autor text,
  texto text not null default '',
  creado_en timestamptz not null default now(),
  clickup_id text unique,
  clickup jsonb
);
create index if not exists wms_compra_comentarios_compra_idx on wms_compra_comentarios (compra_id, creado_en);

-- Subtareas de una compra (en ClickUp se usaban para comparar proveedores: «Avanzar con PROVEEDOR #2»).
create table if not exists wms_compra_subtareas (
  id uuid primary key default uuid_v7(),
  compra_id uuid not null references wms_compras(id) on delete cascade,
  nombre text not null,
  estado text,
  responsable_nombre text,
  descripcion text,
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  clickup_id text unique,
  clickup jsonb
);
create index if not exists wms_compra_subtareas_compra_idx on wms_compra_subtareas (compra_id);

-- Adjuntos: fotos y documentos se copian a Storage (`ruta`); los videos quedan como enlace a ClickUp (`url_clickup`).
create table if not exists wms_compra_adjuntos (
  id uuid primary key default uuid_v7(),
  compra_id uuid not null references wms_compras(id) on delete cascade,
  nombre text not null,
  extension text,
  tamano bigint,
  clase text not null default 'otro' check (clase in ('foto', 'documento', 'video', 'otro')),
  -- De dónde salió en ClickUp: un adjunto de la tarea, el campo «📸 Foto del Producto» o el campo «Documentos».
  origen text not null default 'adjunto' check (origen in ('adjunto', 'campo_foto', 'campo_documentos', 'sistema')),
  ruta text,
  url_clickup text,
  subido_por text,
  creado_en timestamptz not null default now(),
  clickup_id text,
  unique (compra_id, clickup_id)
);
create index if not exists wms_compra_adjuntos_compra_idx on wms_compra_adjuntos (compra_id);

-- Cada cambio de una compra con su hora: estado y etapa (de ClickUp y, desde ahora, los que se hagan aquí). Es lo que
-- permite medir cuánto dura cada etapa y dónde se traba la operación.
create table if not exists wms_compra_eventos (
  id uuid primary key default uuid_v7(),
  compra_id uuid not null references wms_compras(id) on delete cascade,
  campo text not null,
  valor_antes text,
  valor_despues text,
  ocurrido_en timestamptz not null default now(),
  autor text,
  -- 'clickup_estado' (historial de estados de ClickUp), 'clickup_actividad' (la actividad de ClickUp) o 'sistema'.
  origen text not null default 'sistema',
  unique (compra_id, campo, valor_despues, ocurrido_en)
);
create index if not exists wms_compra_eventos_compra_idx on wms_compra_eventos (compra_id, ocurrido_en);
create index if not exists wms_compra_eventos_campo_idx on wms_compra_eventos (campo, ocurrido_en);

alter table wms_compra_comentarios enable row level security;
alter table wms_compra_subtareas enable row level security;
alter table wms_compra_adjuntos enable row level security;
alter table wms_compra_eventos enable row level security;

-- Fotos y documentos de las compras: bucket privado (facturas y comprobantes); se ven con enlaces firmados de una hora.
insert into storage.buckets (id, name, public) values ('wms-compras', 'wms-compras', false)
on conflict (id) do nothing;

-- Plan Pro: los videos de las compras pesan hasta ~75 MB; el bucket acepta archivos de hasta 200 MB.
update storage.buckets set file_size_limit = 209715200 where id = 'wms-compras';
