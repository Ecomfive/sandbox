-- Reversa de 0186_tareas_crm.sql. Las tareas que solo son de un chat (sin dropshipper) se borran, porque la columna vuelve a ser
-- obligatoria; las que esperan una llegada vuelven a «pendiente».
delete from tareas_dropshipper where dropshipper_id is null;
update tareas_dropshipper set estado = 'pendiente' where estado = 'esperando';
update tareas_dropshipper set origen = 'manual' where origen in ('chat', 'llegada');

drop index if exists tareas_dropshipper_esperando;
drop index if exists tareas_dropshipper_conversacion;
alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_con_quien;
alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_estado_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_estado_check check (estado in ('pendiente', 'hecha'));
alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_origen_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_origen_check check (origen in ('manual', 'escalado'));

alter table tareas_dropshipper drop column if exists avisada_en;
alter table tareas_dropshipper drop column if exists activada_en;
alter table tareas_dropshipper drop column if exists llegada_estimada;
alter table tareas_dropshipper drop column if exists compras_esperadas;
alter table tareas_dropshipper drop column if exists pais_id;
alter table tareas_dropshipper drop column if exists sku_id;
alter table tareas_dropshipper drop column if exists conversacion_id;
alter table tareas_dropshipper alter column dropshipper_id set not null;
