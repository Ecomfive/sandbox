-- Operación › Fulfillment › Gestión de IDs Drop (pedido de Jhokser, 3 nov 2026): otra aplicación aparte de Dropi, con el mismo módulo que Gestión de IDs Dropi pero sin datos
-- (se van conectando poco a poco). Por ahora solo hace falta el permiso: el módulo `publicaciones-drop` lo reciben los roles que ya tienen `publicaciones-dropi`, con el
-- mismo nivel (edición o solo lectura). Las tablas de sus datos llegarán con la conexión.
-- Reversa: supabase/rollbacks/0220_rollback.sql

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'publicaciones-drop', solo_lectura from permisos_rol where modulo = 'publicaciones-dropi'
on conflict (rol_id, modulo) do nothing;
