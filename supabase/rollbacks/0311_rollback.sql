-- Reversa de 0311_rol_tienda_cliente.sql: quita el rol «Tienda cliente» solo si nadie lo tiene asignado (sus permisos se van con él).
delete from roles r where r.nombre = 'Tienda cliente' and not exists (select 1 from perfiles p where p.rol_id = r.id);
notify pgrst, 'reload schema';
