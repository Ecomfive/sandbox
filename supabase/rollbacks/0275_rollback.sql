-- Reversa de 0275_ordenes_hora_shopify.sql: quita la hora de Shopify de las órdenes (las pantallas vuelven a mostrar solo el día).
alter table ven_ordenes drop column if exists creado_origen;
notify pgrst, 'reload schema';
