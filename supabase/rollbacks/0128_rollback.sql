-- Reversa de 0128_publicaciones_tareas.sql (borra los avisos de tareas y las columnas de tarea de las decisiones).
delete from notificaciones_usuario where tipo = 'tarea';
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor'));
drop index if exists dropi_publicaciones_decisiones_abiertas;
alter table dropi_publicaciones_decisiones
  drop column if exists responsable_id,
  drop column if exists responsable_nombre,
  drop column if exists plazo,
  drop column if exists hecha_en,
  drop column if exists hecha_por_nombre,
  drop column if exists hecha_como,
  drop column if exists hecha_nota;
