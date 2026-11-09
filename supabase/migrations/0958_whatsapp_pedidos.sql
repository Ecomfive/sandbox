-- 0958 · WhatsApp de los pedidos de Shopify (Chatmaid): registro de mensajes enviados y recibidos. Se puede correr más de una vez.
create table if not exists ven_whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid references ven_ordenes(id) on delete set null,
  telefono_clave text,
  direccion text not null check (direccion in ('saliente', 'entrante')),
  plantilla text,
  cuerpo text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'entregado', 'leido', 'fallido', 'recibido')),
  proveedor_id text,
  error text,
  por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists ven_whatsapp_mensajes_proveedor on ven_whatsapp_mensajes (proveedor_id) where proveedor_id is not null;
create index if not exists ven_whatsapp_mensajes_orden on ven_whatsapp_mensajes (orden_id, creado_en desc);
alter table ven_whatsapp_mensajes enable row level security;

-- Eventos del webhook ya procesados (los reintentos de Chatmaid no se aplican dos veces).
create table if not exists ven_whatsapp_eventos (
  clave text primary key,
  creado_en timestamptz not null default now()
);
alter table ven_whatsapp_eventos enable row level security;

-- Qué avisos salen solos al cambiar de fase, por país (apagados de entrada).
insert into ven_config (clave, valor) values
  ('whatsapp_auto', '{"confirmada": false, "despachada": false, "fallida": false, "entregada": false}'::jsonb)
on conflict (clave) do nothing;
