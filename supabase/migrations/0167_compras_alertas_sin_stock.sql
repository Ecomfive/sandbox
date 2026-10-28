-- Compras › Sin stock (pedido de Alcides, 27 oct 2026): mientras el inventario no está conectado al sistema, cuando un producto se queda
-- sin stock en Dropi (la lectura de «Mis productos» de cada mañana o de «Actualizar datos») se abre una alerta para Compras, que revisa el
-- inventario manual y anota qué decidió (comprar, hay inventario manual, no reponer). Un producto es el producto vinculado de sus
-- publicaciones (todos sus IDs de Dropi juntos) o, sin vincular, el ID de Dropi. Una alerta abierta o revisada por producto; se cierra sola
-- cuando Dropi le vuelve a ver unidades. A quienes pueden modificar Compras les llega el aviso «Para ti» (tipo `sin_stock`).
-- RLS sin políticas: solo el servidor la lee y la escribe. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0167_rollback.sql

create table if not exists compras_alertas_sin_stock (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises (id),
  -- «sku:<uuid del producto>» o «dropi:<ID>»: lo que identifica al producto.
  clave text not null,
  sku_maestro_id uuid references skus_maestros (id) on delete set null,
  dropi_ids text[] not null default '{}',
  nombre text not null,
  detectada_en timestamptz not null default now(),
  estado text not null default 'abierta' check (estado in ('abierta', 'revisada', 'cerrada')),
  decision text check (decision in ('comprar', 'inventario_manual', 'no_reponer')),
  nota text check (char_length(nota) <= 1000),
  revisada_por uuid references perfiles (id) on delete set null,
  revisada_por_nombre text,
  revisada_en timestamptz,
  cerrada_en timestamptz,
  motivo_cierre text
);
-- Una sola alerta viva (abierta o revisada) por producto y país.
create unique index if not exists compras_alertas_sin_stock_viva on compras_alertas_sin_stock (pais_id, clave) where estado <> 'cerrada';
create index if not exists compras_alertas_sin_stock_pais on compras_alertas_sin_stock (pais_id, estado, detectada_en desc);
alter table compras_alertas_sin_stock enable row level security;

-- El aviso «Para ti» de una alerta nueva.
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock'));
