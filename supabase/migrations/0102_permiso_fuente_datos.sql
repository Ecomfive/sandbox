-- Marketing › «Fuente de datos» (/fuente-datos, pedido de Alcides, 13 oct 2026): las fuentes de donde salen los productos
-- para testear (Drop Killer, Tu Winner, Scraping de proveedores y Selección de productos). Arranca con el mismo acceso que
-- Test productos, con su mismo solo lectura; después se ajusta por rol en Usuarios y roles. Se puede repetir.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'fuente-datos', solo_lectura
from permisos_rol
where modulo = 'productos-test'
on conflict (rol_id, modulo) do nothing;
