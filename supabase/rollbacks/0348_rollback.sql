-- Reversa de 0348_ia_pone_etiqueta.sql: quita el interruptor por tienda y el registro de la etiqueta puesta. Las etiquetas que la IA ya puso en Shopify quedan en los pedidos.
alter table confirmacion_ia_analisis drop column if exists etiqueta_error;
alter table confirmacion_ia_analisis drop column if exists etiqueta_puesta_en;
alter table confirmacion_ia_analisis drop column if exists etiqueta_puesta;
alter table tiendas drop column if exists ia_pone_etiqueta_en;
alter table tiendas drop column if exists ia_pone_etiqueta_por;
alter table tiendas drop column if exists ia_pone_etiqueta;
notify pgrst, 'reload schema';
