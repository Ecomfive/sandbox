-- Reversa de 0284_tienda_icomfly.sql: se borra la conexión de las tiendas con iComfly (los tokens cifrados se pierden; habría que volver a autorizar).
drop table if exists tienda_icomfly;
notify pgrst, 'reload schema';
