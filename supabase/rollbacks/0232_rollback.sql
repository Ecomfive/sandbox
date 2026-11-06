-- Reversa de 0232_compras_por_pais.sql: quita el módulo «Por país» de Compras a quien lo tenga.
delete from permisos_persona where modulo = 'compras-por-pais';
