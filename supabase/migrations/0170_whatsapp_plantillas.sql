-- CRM Dropshippers › Plantillas de WhatsApp (pedido de Jhokser, 28 oct 2026). Pasadas 24 h del último mensaje de un dropshipper, solo se le puede
-- escribir con una plantilla que Meta aprobó antes. Aquí se crean, se editan y se mandan a Meta desde el sistema, se ve su estado (borrador,
-- en revisión, aprobada, rechazada, pausada), su calidad y su categoría (Meta la puede cambiar sola), y se avisa de cada cambio.
--   * whatsapp_plantillas: una fila por plantilla y idioma. `categoria` es la que se pidió y `categoria_actual` la que Meta le puso.
--   * whatsapp_alertas: lo que avisan Meta y 360dialog (plantilla aprobada, rechazada, pausada, calidad baja, categoría cambiada, el número
--     o la cuenta restringidos) para mostrarlo en la pantalla y en la campana.
--   * whatsapp_numeros.limite_mensajes: el límite de envío que avisó Meta (TIER_250, TIER_10K…).
--   * whatsapp_mensajes.plantilla_id: qué plantilla se usó en un mensaje.
-- Código: src/lib/whatsapp/plantillas*.ts, src/app/(app)/crm-dropshippers/plantillas/. Reversa: supabase/rollbacks/0170_rollback.sql

create table if not exists whatsapp_plantillas (
  id uuid primary key default uuid_v7(),
  -- Solo minúsculas, números y guiones bajos (regla de Meta). Con el idioma es único.
  nombre text not null check (nombre ~ '^[a-z0-9_]{1,100}$'),
  idioma text not null default 'es',
  categoria text not null check (categoria in ('marketing', 'utility')),
  -- La que Meta le puso: puede cambiarla sola (p. ej. de Utilidad a Marketing si lo ve promocional).
  categoria_actual text check (categoria_actual in ('marketing', 'utility', 'authentication')),
  estado text not null default 'borrador' check (estado in ('borrador', 'pendiente', 'aprobada', 'rechazada', 'pausada', 'deshabilitada')),
  calidad text not null default 'pendiente' check (calidad in ('pendiente', 'alta', 'media', 'baja')),
  -- Por qué la rechazó o la pausó Meta.
  motivo text,
  -- Por qué no se pudo mandar a Meta la última vez.
  error_envio text,
  -- Su id en Meta (hsm_id).
  meta_id text,
  encabezado text,
  cuerpo text not null,
  pie text,
  -- Los botones de respuesta rápida: ["Sí, retomemos", "Ahora no"].
  botones jsonb not null default '[]'::jsonb,
  -- Una por cada {{n}} del cuerpo, en orden: [{ "campo": "primer_nombre", "ejemplo": "María" }].
  variables jsonb not null default '[]'::jsonb,
  -- La clave de la plantilla sugerida de la que salió, si salió de ahí.
  sugerida text,
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_nombre text,
  enviada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (nombre, idioma)
);
create index if not exists whatsapp_plantillas_meta_idx on whatsapp_plantillas (meta_id) where meta_id is not null;

create table if not exists whatsapp_alertas (
  id uuid primary key default uuid_v7(),
  tipo text not null,
  severidad text not null default 'info' check (severidad in ('info', 'aviso', 'critica')),
  titulo text not null,
  detalle text,
  plantilla_id uuid references whatsapp_plantillas(id) on delete set null,
  vista_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists whatsapp_alertas_recientes_idx on whatsapp_alertas (creado_en desc);

alter table whatsapp_numeros add column if not exists limite_mensajes text;
alter table whatsapp_numeros add column if not exists limite_actualizado_en timestamptz;
alter table whatsapp_mensajes add column if not exists plantilla_id uuid references whatsapp_plantillas(id) on delete set null;

-- Los avisos «Para ti» de WhatsApp.
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp'));

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_plantillas enable row level security;
alter table whatsapp_alertas enable row level security;
