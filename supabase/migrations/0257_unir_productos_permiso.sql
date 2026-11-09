-- Permiso para unir productos duplicados (9 nov 2026, pedido de Hernán): hasta ahora solo un administrador veía «Unir con otro» en la ficha de
-- Producto. Se crea el módulo `unir-productos`, que se da por persona (no por rol) y solo autoriza esa acción (no da «Eliminar» producto), y se
-- le da a Dinora Gomez. Se puede dar o quitar a otra persona en Usuarios y roles › Permisos propios. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0257_rollback.sql
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'unir-productos', 'edicion' from perfiles
where nombre = 'Dinora Gomez' and activo
on conflict (perfil_id, modulo) do nothing;
