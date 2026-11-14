-- Permiso para la salida a mano donde toda salida va con remisión (Costa Rica) (14 nov 2026, pedido de Hernán): hasta ahora solo un administrador veía «Salida» en la
-- ficha de Inventario y «Restar» en el Levantamiento de Costa Rica. Se crea el módulo `salida-manual`, que se da por persona (no por rol) y solo autoriza esa salida,
-- y se le da a Yanixia, que lleva el inventario de Costa Rica. Se puede dar o quitar a otra persona en Usuarios y roles › Permisos propios. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0291_rollback.sql
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'salida-manual', 'edicion' from perfiles
where nombre ilike 'Yanixia%' and activo
on conflict (perfil_id, modulo) do nothing;
