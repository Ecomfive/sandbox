-- Reversa de 0178_tareas_estados.sql: se pierden el estado (salvo hecha, que sigue en hecha_en), la prioridad y lo archivado.
alter table dropi_publicaciones_tareas drop constraint if exists dropi_publicaciones_tareas_prioridad_check;
alter table dropi_publicaciones_tareas drop constraint if exists dropi_publicaciones_tareas_estado_check;
alter table dropi_publicaciones_tareas drop column if exists archivada_en;
alter table dropi_publicaciones_tareas drop column if exists prioridad;
alter table dropi_publicaciones_tareas drop column if exists estado;
