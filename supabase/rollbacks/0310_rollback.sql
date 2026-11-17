-- Reversa de 0310_reporteria_pedidos.sql: se quitan el módulo, la función, el historial de ediciones y las columnas que trajo la Matriz.
delete from permisos_rol where modulo = 'tienda-reporteria';
drop function if exists ven_reporteria_aplicar(jsonb);
drop table if exists ven_orden_ediciones;
alter table ven_ordenes_clientes drop column if exists provincia;
alter table ven_ordenes
  drop column if exists estado_matriz,
  drop column if exists verificado,
  drop column if exists preparacion,
  drop column if exists courier_matriz,
  drop column if exists monto_envio,
  drop column if exists monto_envio_se,
  drop column if exists monto_pagado_delivery,
  drop column if exists delivery,
  drop column if exists cambio_monto,
  drop column if exists cambio_forma_pago,
  drop column if exists cambio_envio,
  drop column if exists fecha_devolucion_texto,
  drop column if exists bloque_facturado,
  drop column if exists matriz_en;
notify pgrst, 'reload schema';
