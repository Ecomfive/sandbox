-- Reversa de 0204_crm_direccion_automatizar.sql: se pierden el interruptor de la secuencia de alta y qué pasos se crearon; las tareas creadas
-- por la secuencia quedan como «manual».
update tareas_dropshipper set origen = 'manual' where origen = 'alta';
alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_origen_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_origen_check check (origen in ('manual', 'escalado', 'chat', 'llegada', 'alerta'));
drop table if exists crm_alta_pasos;
drop table if exists crm_automatizaciones;
drop function if exists crm_entregas(uuid, integer);
