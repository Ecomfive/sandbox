-- Gestión de tienda › Logística (pedido de Hernán, 12 nov 2026, como la pantalla de Mi Reto Digital, con lo que hay): los confirmados por preparar
-- (hoy o programados para después, por la fecha de la nota del pedido), los que van en ruta por zona y los demorados. Solo lectura.
--
-- Sin tablas nuevas: solo el módulo «tienda-logistica» para los roles que ya abren Pedidos de tienda, con el mismo permiso (lectura o escritura).

insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, 'tienda-logistica', pr.solo_lectura
from permisos_rol pr
where pr.modulo = 'tienda-pedidos'
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';
