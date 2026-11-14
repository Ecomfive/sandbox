-- Reversa de 0294_siscore_avance_por_tienda.sql: quita la tienda y el avance de las lecturas de SISCORE.
drop index if exists tienda_guias_lecturas_tienda;
alter table tienda_guias_lecturas drop column if exists avance_en;
alter table tienda_guias_lecturas drop column if exists total;
alter table tienda_guias_lecturas drop column if exists hechos;
alter table tienda_guias_lecturas drop column if exists tienda_id;
notify pgrst, 'reload schema';
