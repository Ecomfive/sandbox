-- Líderes que asignan tareas (9 nov 2026, pedido de Hernán: «también los líderes»). Hasta ahora solo un administrador asignaba una tarea a otra
-- persona (Equipo › Tareas y el botón «Asignar tarea» de cada módulo). Las personas marcadas aquí también pueden; se eligen en Configuración ›
-- «Líderes: asignan tareas». Un rol cuyo nombre empieza con «Líder» cuenta sin marcarlo. Arranca sin nadie marcado.
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0263_rollback.sql

alter table perfiles add column if not exists lider_tareas boolean not null default false;
