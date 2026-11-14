-- Reversa de 0291_tienda_oferfy.sql: quita la tienda Oferfy (solo si todavía no se conectó a Shopify; sus órdenes de Finanzas no se tocan).
delete from tiendas t using paises p where t.pais_id = p.id and p.codigo = 'PA' and t.nombre = 'Oferfy' and t.estado = 'por_conectar';
notify pgrst, 'reload schema';
