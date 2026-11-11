-- Avisos: «remisión» (del equipo, 0237) y «cierre» (del Portal AF4, 0928) a la vez (11 nov 2026).
-- La 0928 del portal rehacía la lista de tipos de `notificaciones_usuario` sin «remision»; como la 0237 se corrió después, hoy la
-- base acepta «remision» pero no «cierre», así que los avisos de cierre de mes del portal fallan al guardarse. Esta deja los dos.
-- La 0928 del repositorio también se corrigió para incluir «remision» si alguien la vuelve a correr.
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0268_rollback.sql
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check
  check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision', 'cierre'));

notify pgrst, 'reload schema';
