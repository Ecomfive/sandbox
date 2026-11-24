-- Reversa de 0358_tienda_clicksi.sql: quita la tienda ClickSi (solo si todavía no se conectó a Shopify; sus órdenes de la Matriz no se tocan).
delete from tiendas t using paises p where t.pais_id = p.id and p.codigo = 'PA' and t.nombre = 'ClickSi' and t.estado = 'por_conectar';
notify pgrst, 'reload schema';
