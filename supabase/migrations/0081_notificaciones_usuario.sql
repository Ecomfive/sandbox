-- Avisos personales (pedido de Hernán, 8 oct 2026): cuando alguien etiqueta a una persona con «@» en un comentario (Compras)
-- o en una nota (CRM), a esa persona le llega un aviso en el Centro de notificaciones («Para ti») que la lleva al lugar del
-- comentario. `href` es a dónde lleva; `leida_en` se marca al abrirlo (o con «Marcar todas como leídas»).
-- RLS sin políticas: solo el servidor la toca (ver migración 0063 y SEGURIDAD.md).

create table if not exists notificaciones_usuario (
  id uuid primary key default uuid_v7(),
  usuario_id uuid not null references perfiles(id) on delete cascade,
  tipo text not null default 'mencion' check (tipo in ('mencion')),
  titulo text not null,
  texto text,
  href text not null,
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text,
  leida_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists notificaciones_usuario_pendientes on notificaciones_usuario (usuario_id, creado_en desc) where leida_en is null;
create index if not exists notificaciones_usuario_todas on notificaciones_usuario (usuario_id, creado_en desc);
alter table notificaciones_usuario enable row level security;
