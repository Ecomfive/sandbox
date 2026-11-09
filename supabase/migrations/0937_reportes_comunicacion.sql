-- Portal AF4 360°: reportes, comunicación y plataforma (mejoras 89–100).
--
-- 1. `fin_informes_versiones`: cada informe generado o enviado guarda su contenido (snapshot jsonb), quién y cuándo.
-- 2. `fin_informes_envios`: registro de envíos del informe mensual por correo y del resumen semanal por WhatsApp.
-- 3. `fin_informes_explicacion`: la explicación en texto de la variación del mes (borrador de la IA, editada a mano).
-- 4. `fin_comentarios`: hilos de comentarios anclados a una cifra (página + período + clave de la cifra), con menciones.
-- 5. `perfiles.tiendas_permitidas`: las tiendas (`fin_unidades`) que ve cada persona; null = todas.
-- 6. `fin_movimientos.itbms`: el ITBMS del documento, para el libro del contador (vacío = no cargado).
-- 7. Dropi al portal financiero: en la migración 0938.
-- 8. `fin_shopify_estado`: hasta dónde leyó la tarea de Shopify en cada tienda.
-- 9. `fin_respaldos` y el bucket privado `respaldos-finanzas`.
--
-- Los destinatarios del informe y los números de WhatsApp viven en `fin_config` (`informe_destinatarios`,
-- `whatsapp_numeros`). RLS activado y sin políticas (SEGURIDAD.md): solo el servidor toca estas tablas. Se puede correr
-- dos veces.

-- 1. Versiones de los informes
create table if not exists fin_informes_versiones (
  id uuid primary key default gen_random_uuid(),
  -- mensual (Informe mensual) | semanal (resumen de WhatsApp)
  tipo text not null check (tipo in ('mensual', 'semanal')),
  periodo date not null,
  -- generado (a mano, «Guardar versión») | enviado (lo que salió por correo o WhatsApp)
  motivo text not null default 'generado' check (motivo in ('generado', 'enviado')),
  contenido jsonb not null,
  creado_por uuid references auth.users(id),
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists fin_informes_versiones_periodo on fin_informes_versiones (tipo, periodo, creado_en desc);
alter table fin_informes_versiones enable row level security;

-- 2. Envíos
create table if not exists fin_informes_envios (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('correo', 'whatsapp')),
  periodo date not null,
  destinatarios text[] not null default '{}',
  ok boolean not null,
  detalle text check (detalle is null or length(detalle) <= 1000),
  disparo text not null default 'manual' check (disparo in ('cron', 'manual')),
  version_id uuid references fin_informes_versiones(id) on delete set null,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists fin_informes_envios_fecha on fin_informes_envios (creado_en desc);
alter table fin_informes_envios enable row level security;

-- 3. Explicación de la variación del mes
create table if not exists fin_informes_explicacion (
  periodo date primary key check (extract(day from periodo) = 1),
  texto text not null check (length(texto) between 1 and 4000),
  -- ia | manual
  origen text not null default 'manual' check (origen in ('ia', 'manual')),
  modelo text,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table fin_informes_explicacion enable row level security;

-- 4. Comentarios en cifras
create table if not exists fin_comentarios (
  id uuid primary key default gen_random_uuid(),
  pagina text not null check (pagina ~ '^[a-z0-9-]{1,40}$'),
  -- AAAA-MM, u12, a2026… (lo que diga el período de la página); '' = sin período.
  periodo text not null default '' check (length(periodo) <= 20),
  clave text not null check (length(clave) between 1 and 200),
  texto text not null check (length(texto) between 1 and 2000),
  menciones uuid[] not null default '{}',
  respuesta_a uuid references fin_comentarios(id) on delete cascade,
  autor_id uuid references auth.users(id),
  autor_nombre text,
  creado_en timestamptz not null default now(),
  editado_en timestamptz
);
create index if not exists fin_comentarios_ancla on fin_comentarios (pagina, periodo, clave, creado_en);
alter table fin_comentarios enable row level security;

-- 5. Tiendas que ve cada persona
alter table perfiles add column if not exists tiendas_permitidas uuid[];

-- 6. ITBMS del documento
alter table fin_movimientos add column if not exists itbms numeric(14, 2) check (itbms is null or itbms >= 0);

-- 8. Shopify
create table if not exists fin_shopify_estado (
  tienda text primary key check (length(tienda) between 1 and 80),
  -- `updated_at` de la última orden leída (la próxima lectura sigue de ahí).
  cursor timestamptz,
  ordenes integer not null default 0,
  actualizado_en timestamptz not null default now()
);
alter table fin_shopify_estado enable row level security;

-- 9. Respaldos
create table if not exists fin_respaldos (
  id uuid primary key default gen_random_uuid(),
  ruta text not null unique,
  bytes bigint not null default 0,
  -- tabla → filas
  tablas jsonb not null default '{}'::jsonb,
  disparo text not null default 'cron' check (disparo in ('cron', 'manual')),
  creado_en timestamptz not null default now()
);
alter table fin_respaldos enable row level security;

insert into storage.buckets (id, name, public)
values ('respaldos-finanzas', 'respaldos-finanzas', false)
on conflict (id) do nothing;

insert into fin_config (clave, valor) values
  ('informe_destinatarios', '[]'::jsonb),
  ('whatsapp_numeros', '[]'::jsonb),
  ('respaldos_conservar', '8'::jsonb)
on conflict (clave) do nothing;
