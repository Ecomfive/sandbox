-- Reversa de 0299: quita las cajas y las etiquetas del espejo de pedidos del proveedor (las imágenes quedan en el bucket y como adjuntos de la compra).
alter table proveedor_pedidos drop column if exists etiquetas_rutas;
alter table proveedor_pedidos drop column if exists cajas;

notify pgrst, 'reload schema';
