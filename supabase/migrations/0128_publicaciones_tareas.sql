-- Gestión de IDs Dropi › Recomendaciones como tareas (21 oct 2026).
--
-- Al aceptar una recomendación se vuelve una tarea con responsable y plazo. Queda «Por hacer» hasta que el sistema detecta que se
-- hizo (Dropi muestra el precio nuevo, o el combo x2 ya está publicado) o la persona pulsa «Ya lo hice»; si pasa el plazo, se ve
-- «Atrasada». Al responsable le llega un aviso «Para ti» (notificaciones_usuario, tipo «tarea»).
--
-- Reversa: supabase/rollbacks/0128_rollback.sql

alter table dropi_publicaciones_decisiones
  add column if not exists responsable_id uuid references perfiles (id) on delete set null,
  add column if not exists responsable_nombre text,
  add column if not exists plazo date,
  add column if not exists hecha_en timestamptz,
  add column if not exists hecha_por_nombre text,
  add column if not exists hecha_como text check (hecha_como in ('manual', 'dropi', 'producto')),
  add column if not exists hecha_nota text;

create index if not exists dropi_publicaciones_decisiones_abiertas on dropi_publicaciones_decisiones (plazo) where decision = 'aceptada' and hecha_en is null;

alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea'));
