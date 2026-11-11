-- Reversa de 0263_lideres_tareas.sql: sin la columna, solo un administrador (o un rol «Líder…») asigna tareas a otras personas.
alter table perfiles drop column if exists lider_tareas;
