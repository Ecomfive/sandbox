-- Reversa de 0197_crm_direccion_salud.sql: se pierden las alertas atendidas; las tareas creadas desde una alerta quedan como «manual».
update tareas_dropshipper set origen = 'manual' where origen = 'alerta';
alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_origen_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_origen_check check (origen in ('manual', 'escalado', 'chat', 'llegada'));
drop table if exists crm_alertas_atendidas;
drop function if exists crm_pedidos_semanales(uuid, integer);
drop function if exists crm_salud_dropshippers(uuid);
