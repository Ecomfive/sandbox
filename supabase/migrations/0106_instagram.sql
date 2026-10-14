-- Testing Lab › Fuentes › «Instagram» (pedido de Hernán, 14 oct 2026): cada vez que alguien del equipo ve en Instagram un producto
-- que puede servir para testear, lo comparte por mensaje directo a la cuenta del equipo (ecomfive.fuentes) y cae aquí: Meta avisa
-- al sistema con un webhook, el sistema guarda el enlace, el copy y quién lo envió, y copia el video a nuestro almacenamiento.
-- Se guarda también el JSON completo que mandó Meta (`payload`): mientras se decide qué datos sirven, no se pierde ninguno.
-- Se puede repetir.

-- Permiso del módulo nuevo: lo reciben los roles que ya tenían Drop Killer, con su mismo solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'instagram', solo_lectura from permisos_rol where modulo = 'drop-killer'
on conflict (rol_id, modulo) do nothing;

create table if not exists instagram_capturas (
  id uuid primary key default uuid_v7(),
  -- El N.º de la captura (se muestra IG-0001).
  numero integer not null,
  -- Dedupe: el id del mensaje de Meta + la posición del adjunto. Meta reintenta los webhooks, así que el mismo aviso puede
  -- llegar dos veces y no debe crear dos filas.
  mensaje_id text not null,
  recibido_en timestamptz not null default now(),
  -- Quién lo compartió: el id de Instagram (siempre) y su usuario o nombre (si el sistema pudo consultarlo).
  remitente_id text not null,
  remitente_usuario text,
  remitente_nombre text,
  -- reel, post, video u otro (lo que declaró el adjunto).
  tipo text not null default 'otro' check (tipo in ('reel', 'post', 'video', 'otro')),
  -- Lo que trae el adjunto: el enlace, el título (el copy, si Meta lo manda) y el id del reel o del post.
  enlace text,
  titulo text,
  media_id text,
  -- Lo que la persona escribió en el mismo mensaje (una nota o el enlace de la página de destino).
  texto_mensaje text,
  -- El video copiado a nuestro almacenamiento (bucket privado `instagram-fuentes`).
  video_ruta text,
  video_bytes bigint,
  video_error text,
  -- Métricas del autor (me gusta, comentarios, vistas), si se pudieron consultar. Cada una puede faltar.
  autor_usuario text,
  metricas jsonb not null default '{}'::jsonb,
  -- A completar a mano.
  pagina_destino text,
  notas text,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'por_testear', 'descartado')),
  -- El aviso completo de Meta, tal como llegó.
  payload jsonb not null,
  actualizado_en timestamptz not null default now()
);

create sequence if not exists instagram_capturas_numero_seq owned by instagram_capturas.numero;
alter table instagram_capturas alter column numero set default nextval('instagram_capturas_numero_seq');
create unique index if not exists instagram_capturas_numero_uidx on instagram_capturas (numero);
create unique index if not exists instagram_capturas_mensaje_uidx on instagram_capturas (mensaje_id);
create index if not exists instagram_capturas_estado_idx on instagram_capturas (estado, recibido_en desc);

-- Solo el servidor (con la clave de servicio) toca los datos: RLS activo y sin políticas (ver SEGURIDAD.md).
alter table instagram_capturas enable row level security;

-- Los videos: bucket privado (se ven con enlaces firmados de una hora). Un reel pesa unos MB; el tope es de 100 MB.
insert into storage.buckets (id, name, public) values ('instagram-fuentes', 'instagram-fuentes', false)
on conflict (id) do nothing;
update storage.buckets set file_size_limit = 104857600 where id = 'instagram-fuentes';
