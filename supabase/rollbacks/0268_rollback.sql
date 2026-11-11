-- Reversa de 0268_avisos_remision_y_cierre.sql: vuelve a la lista de la 0237 (sin «cierre»). Falla si ya hay avisos de cierre guardados:
-- bórralos antes o deja la 0268.
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check
  check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision'));
notify pgrst, 'reload schema';
