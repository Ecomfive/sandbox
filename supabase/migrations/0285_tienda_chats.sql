-- Chat de WhatsApp del cliente en Pedidos de tienda (13 nov 2026, pedido de Hernán; prototipo «Chat de tiendas con iComfly» aprobado). Los chats de WhatsApp de cada tienda
-- viven en iComfly (su bot): el sistema los lee y responde por su conector (migración 0284). Aquí solo lo que iComfly no da o no guarda para nosotros:
-- 1) `tienda_chat_mensajes`: cuándo vio el sistema cada mensaje (el conector de iComfly devuelve las fechas vacías, 13 nov 2026) y quién del equipo lo mandó
--    desde el sistema (iComfly no sabe quién de nosotros escribió).
-- 2) `tienda_chat_conversaciones`: si el bot se pausó desde el sistema, quién y cuándo (el conector pausa, pero no dice si está pausado).
-- 3) Sin módulo propio: el chat va dentro de Pedidos de tienda y usa su permiso. La primera versión de esta migración creaba el módulo «tienda-chats»
--    (13 nov 2026, antes de publicarse); se borra por si ya se corrió.
-- Con RLS y sin políticas: solo el servidor. Se puede correr más de una vez. Reversa: supabase/rollbacks/0285_rollback.sql

create table if not exists tienda_chat_mensajes (
  tienda_id uuid not null references tiendas (id) on delete cascade,
  mensaje_id bigint not null,
  conversacion_id bigint,
  -- Cuándo lo vio el sistema; null si ya estaba cuando el chat se abrió por primera vez (historial sin hora).
  visto_en timestamptz,
  autor_id uuid references perfiles (id) on delete set null,
  autor_nombre text,
  primary key (tienda_id, mensaje_id)
);
create index if not exists tienda_chat_mensajes_conversacion on tienda_chat_mensajes (tienda_id, conversacion_id);
alter table tienda_chat_mensajes enable row level security;

create table if not exists tienda_chat_conversaciones (
  tienda_id uuid not null references tiendas (id) on delete cascade,
  conversacion_id bigint not null,
  telefono text,
  bot_pausado boolean not null default false,
  pausado_por text,
  pausado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (tienda_id, conversacion_id)
);
alter table tienda_chat_conversaciones enable row level security;

delete from permisos_rol where modulo = 'tienda-chats';

notify pgrst, 'reload schema';
