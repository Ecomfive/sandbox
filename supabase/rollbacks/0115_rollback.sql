-- Reversa de la migración 0115: quita los perfiles nuevos y los permisos que la migración sumó a los existentes.
-- Los roles existentes se dejan como estaban el 20 oct 2026 (los permisos que ya tenían se conservan).
-- Un rol nuevo con personas asignadas no se borra: primero hay que pasarlas a otro rol.
begin;
delete from permisos_rol where rol_id = (select id from roles where nombre = 'Administrativo') and modulo in ('compras', 'producto', 'inventario', 'dashboard', 'notificaciones');
delete from permisos_rol where rol_id = (select id from roles where nombre = 'Atención al cliente') and modulo in ('sugerencias-clientes', 'pedidos-dropi', 'alertas', 'producto', 'dashboard', 'notificaciones');
delete from permisos_rol where rol_id = (select id from roles where nombre = 'Líder comercial') and modulo in ('pedidos-dropi', 'producto', 'inteligencia-competitiva', 'analisis-competencia', 'dashboard', 'notificaciones');
delete from permisos_rol where rol_id = (select id from roles where nombre = 'Operaciones') and modulo in ('inventario', 'alertas', 'wms-bodegas', 'wms-ubicaciones', 'producto', 'compras', 'pedidos-dropi', 'dashboard', 'notificaciones');
delete from roles r where r.nombre in ('Investigación de producto', 'Contenido y ofertas', 'Compras', 'Producto / Catálogo', 'Talento humano', 'Consulta') and not exists (select 1 from perfiles p where p.rol_id = r.id);
commit;
