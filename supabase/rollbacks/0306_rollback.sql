-- Reversa de 0306_tienda_nuvo.sql: quita la tienda Nuvo (solo si todavía no se conectó a Shopify; sus órdenes de Finanzas no se tocan).
delete from tiendas t using paises p where t.pais_id = p.id and p.codigo = 'PA' and t.nombre = 'Nuvo' and t.estado = 'por_conectar';
notify pgrst, 'reload schema';
