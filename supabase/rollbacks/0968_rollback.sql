-- Reversa de 0968.
drop index if exists ven_ordenes_etiquetas_equipo_idx;
alter table ven_ordenes drop constraint if exists ven_ordenes_franja_check;
alter table ven_ordenes drop column if exists franja;
alter table ven_ordenes drop column if exists etiquetas_equipo;
