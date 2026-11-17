-- Reversa de 0312: quita el pago por adelantado (lo que estaba «en espera de pago» pasa a «revisar»).
update confirmacion_ia_analisis set estado = 'revisar' where estado = 'adelantado';
alter table confirmacion_ia_analisis drop constraint if exists confirmacion_ia_analisis_estado_check;
alter table confirmacion_ia_analisis add constraint confirmacion_ia_analisis_estado_check check (estado in ('listo', 'falta_dato', 'revisar', 'error'));
alter table tiendas drop column if exists pago_adelantado_instrucciones;
drop table if exists confirmacion_ia_adelanto_zonas;
delete from compras_avisos_destinatarios where evento = 'pago_adelantado';
alter table compras_avisos_destinatarios drop constraint if exists compras_avisos_destinatarios_evento_check;
alter table compras_avisos_destinatarios add constraint compras_avisos_destinatarios_evento_check check (evento in ('llegada_puerto', 'llegada_bodega'));
delete from notificaciones_usuario where tipo = 'adelanto';
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check
  check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision', 'cierre', 'llegada'));
notify pgrst, 'reload schema';
