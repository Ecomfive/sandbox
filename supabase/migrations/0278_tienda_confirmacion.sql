-- Gestión de tienda › Confirmación (pedido de Hernán, 12 nov 2026, como la pantalla de Mi Reto Digital): la cola de pedidos por confirmar,
-- los que esperan respuesta y la tasa de confirmación contra la meta. Solo lectura: lo que se confirma o se cancela lo marca el equipo de la
-- tienda en Shopify con etiquetas; el sistema no escribe en Shopify.
--
-- Sin tablas nuevas: solo el módulo «tienda-confirmacion» para los roles que ya abren Pedidos de tienda, con el mismo permiso
-- (lectura o escritura) que tienen allí. Después se reparte en la matriz de cada rol (Usuarios y roles).

insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, 'tienda-confirmacion', pr.solo_lectura
from permisos_rol pr
where pr.modulo = 'tienda-pedidos'
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';
