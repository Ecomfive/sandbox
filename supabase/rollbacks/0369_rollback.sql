-- Reversa de 0369 (otros pedidos de una fila de Monday y pedidos nuevos en espera).
drop index if exists mon_despachos_otras_ordenes;
alter table mon_despachos drop column if exists otras_ordenes;
alter table tiendas drop column if exists pone_en_espera_en;
alter table tiendas drop column if exists pone_en_espera_por;
alter table tiendas drop column if exists pone_en_espera;
notify pgrst, 'reload schema';
