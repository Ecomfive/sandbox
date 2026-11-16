-- Reversa de 0972 (Cambios y reembolsos en el sistema). Las solicitudes creadas en el sistema (item_id «S…») se borran: anótalas antes si hace falta.
delete from permisos_rol where modulo in ('despacho-cambios', 'despacho-cambios-cuentas');
delete from permisos_persona where modulo in ('despacho-cambios', 'despacho-cambios-cuentas');
drop table if exists postventa_cuentas;
drop table if exists postventa_actividad;
drop table if exists postventa_notas;
delete from mon_postventa where item_id like 'S%';
drop index if exists mon_postventa_despacho;
drop index if exists mon_postventa_grupo;
alter table mon_postventa drop column if exists archivado_por, drop column if exists archivado_en, drop column if exists editado_por, drop column if exists editado_en,
  drop column if exists creado_por, drop column if exists origen, drop column if exists despacho_item_id, drop column if exists solicitud,
  drop column if exists fecha_notificacion, drop column if exists notificar, drop column if exists adjuntos, drop column if exists envio_paga,
  drop column if exists valor_envio, drop column if exists seguimiento, drop column if exists fecha, drop column if exists responsable_texto,
  drop column if exists responsable_id;
alter table mon_postventa drop constraint if exists mon_postventa_item_id_check;
alter table mon_postventa add constraint mon_postventa_item_id_check check (item_id ~ '^[0-9]{1,20}$');
notify pgrst, 'reload schema';
