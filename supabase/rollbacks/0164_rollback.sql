-- Reversa de 0164_crm_direccion_kpis.sql. Antes de correrla, pasar a otra área los números que estén en «direccion».
drop function if exists whatsapp_kpis(timestamptz, text[]);
drop function if exists whatsapp_registrar_saliente_celular(text, text, text, uuid, text, text, text, text, text, text, timestamptz, text);
delete from permisos_rol where modulo = 'crm-direccion';
alter table whatsapp_numeros drop constraint if exists whatsapp_numeros_area_check;
alter table whatsapp_numeros add constraint whatsapp_numeros_area_check check (area in ('atencion', 'comercial'));
