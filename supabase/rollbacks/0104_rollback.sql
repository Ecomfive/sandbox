-- Reversa de la migración 0104: borra el tablero de Selección de productos y los correlativos de las fuentes.
-- ATENCIÓN: borra todas sus filas.
drop table if exists wms_seleccion_productos;
drop function if exists wms_siguiente_codigo_fuente(text);
drop table if exists wms_fuente_correlativos;
