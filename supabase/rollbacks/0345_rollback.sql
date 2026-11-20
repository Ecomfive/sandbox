-- Reversa de 0345_asesores_tienda.sql. Las columnas nuevas de `ven_orden_eventos` se dejan (borrarlas perdería quién hizo cada cambio); solo se quitan
-- el índice y los permisos.
drop index if exists ven_orden_eventos_etiquetas_fecha;
delete from permisos_rol where modulo in ('tienda-asesores', 'tienda-tablero');
delete from permisos_persona where modulo in ('tienda-asesores', 'tienda-tablero');
notify pgrst, 'reload schema';
