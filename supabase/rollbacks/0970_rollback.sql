-- Reversa de 0970 (Despacho ciudad). Las filas creadas en el sistema (item_id «S…») se borran: anótalas antes si hace falta.
delete from permisos_rol where modulo in ('despacho-ciudad', 'despacho-devoluciones');
delete from permisos_persona where modulo in ('despacho-ciudad', 'despacho-devoluciones');
drop table if exists despacho_actividad;
drop table if exists despacho_notas;
delete from mon_despachos where item_id like 'S%';
delete from mon_tableros_extra where tablero_id in ('18429025062', '18429046569');
drop index if exists mon_despachos_clase_fecha;
alter table mon_despachos drop column if exists editado_por, drop column if exists editado_en, drop column if exists origen, drop column if exists posicion,
  drop column if exists comprobantes, drop column if exists comentario, drop column if exists turno, drop column if exists coste_envio,
  drop column if exists por_cobrar, drop column if exists edo_pago, drop column if exists grupo, drop column if exists clase;
alter table mon_despachos drop constraint if exists mon_despachos_item_id_check;
alter table mon_despachos add constraint mon_despachos_item_id_check check (item_id ~ '^[0-9]{1,20}$');
