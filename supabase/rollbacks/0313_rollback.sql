-- Reversa de 0313: «adelantado» deja de ser una zona (las palabras, ejemplos y revisiones que la usaban se quitan o quedan sin zona).
delete from confirmacion_ia_zonas where resultado = 'adelantado';
update confirmacion_ia_ejemplos set zona = null where zona = 'adelantado';
update confirmacion_ia_analisis set rev_zona = null where rev_zona = 'adelantado';
alter table confirmacion_ia_zonas drop constraint if exists confirmacion_ia_zonas_resultado_check;
alter table confirmacion_ia_zonas add constraint confirmacion_ia_zonas_resultado_check check (resultado in ('ciudad', 'interior'));
alter table confirmacion_ia_ejemplos drop constraint if exists confirmacion_ia_ejemplos_zona_check;
alter table confirmacion_ia_ejemplos add constraint confirmacion_ia_ejemplos_zona_check check (zona is null or zona in ('ciudad', 'interior'));
alter table confirmacion_ia_analisis drop constraint if exists confirmacion_ia_analisis_rev_zona_check;
alter table confirmacion_ia_analisis add constraint confirmacion_ia_analisis_rev_zona_check check (rev_zona is null or rev_zona in ('ciudad', 'interior'));
-- (La tabla confirmacion_ia_adelanto_zonas de 0312 se vuelve a crear corriendo esa migración.)
notify pgrst, 'reload schema';
