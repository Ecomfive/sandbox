-- Reversa de 0196_crm_tipo_cliente_automatico.sql: quita el cálculo automático y los umbrales (el tipo que tenga cada cliente se queda).
drop function if exists crm_recalcular_tipo_cliente();
drop table if exists crm_tipo_cliente_umbrales;
alter table dropshippers drop column if exists promedio_pedidos_mes;
alter table dropshippers drop column if exists nivel_manual;
