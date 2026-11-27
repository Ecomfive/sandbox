-- Reversa de 0368. Antes de correrla, que despacho reciba (o inventario deshaga) los pedidos «Enviado» sin traslado: al quitar la tabla se pierde de qué bodega salía cada uno.
drop function if exists despacho_recibir_pedido(uuid, uuid, text);
drop function if exists despacho_deshacer_recepcion(uuid, uuid, text);
drop function if exists despacho_disponible(uuid, uuid);
drop table if exists despacho_pedidos_inventario_envios;
alter table despacho_pedidos_inventario drop column if exists bodega_asignada_id;
alter table despacho_pedidos_inventario drop column if exists solicitud_grupo;
notify pgrst, 'reload schema';
