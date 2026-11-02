-- Reversa de 0223_tu_winner.sql: borra las lecturas y el seguimiento de Tu Winner (las filas ya mandadas a Selección se quedan).

drop index if exists wms_seleccion_productos_tuwinner_uidx;
alter table wms_seleccion_productos drop column if exists tuwinner_clave;
drop table if exists tuwinner_eventos;
drop table if exists tuwinner_dias;
drop table if exists tuwinner_productos;
drop table if exists tuwinner_lecturas;
