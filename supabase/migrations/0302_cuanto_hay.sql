-- «¿Cuánto hay?» (16 nov 2026, pedido de Hernán; prototipo aprobado: https://claude.ai/artifact/BK449CDGnYApU2eQ9BqvxL).
-- Los encargados de cada tienda (Kenku, Oferfy…) preguntan cuánto hay de un producto, con una nota; Yiletsi manda a contar a
-- despacho y responde con la cantidad, y la respuesta le llega a quien preguntó («Para ti»).
--   * `tienda_cuanto_hay`: una pregunta por fila (tienda, producto del catálogo, nota, quién y cuándo) y su respuesta (cantidad,
--     quién y cuándo). El nombre del producto se guarda como estaba al preguntar.
--   * Módulos: `tienda-cuanto-hay` (preguntar) para los roles que tienen Pedidos de tienda; `despacho-cuanto-hay` (responder)
--     para los que tienen Logística de tienda y, a ella sola, para Yiletsi (permiso propio: el resto del rol Administrativo no lo ve).
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0302_rollback.sql
create table if not exists tienda_cuanto_hay (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references tiendas (id),
  sku_id uuid not null references skus_maestros (id),
  producto text not null check (length(producto) <= 300),
  nota text check (nota is null or length(nota) <= 300),
  pedido_por uuid not null,
  pedido_por_nombre text,
  creado_en timestamptz not null default now(),
  cantidad integer check (cantidad is null or cantidad between 0 and 1000000),
  respondido_por uuid,
  respondido_por_nombre text,
  respondido_en timestamptz
);
create index if not exists tienda_cuanto_hay_abiertas_idx on tienda_cuanto_hay (creado_en) where respondido_en is null;
create index if not exists tienda_cuanto_hay_pedido_por_idx on tienda_cuanto_hay (pedido_por, creado_en desc);
create index if not exists tienda_cuanto_hay_tienda_idx on tienda_cuanto_hay (tienda_id, creado_en desc);
-- Solo el servidor (clave de servicio) la lee y la escribe.
alter table tienda_cuanto_hay enable row level security;

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'tienda-cuanto-hay', solo_lectura from permisos_rol where modulo = 'tienda-pedidos'
on conflict (rol_id, modulo) do nothing;
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'despacho-cuanto-hay', solo_lectura from permisos_rol where modulo = 'tienda-logistica'
on conflict (rol_id, modulo) do nothing;
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'despacho-cuanto-hay', 'edicion' from perfiles where nombre ilike 'Yiletsi %' and activo
on conflict (perfil_id, modulo) do nothing;

notify pgrst, 'reload schema';
