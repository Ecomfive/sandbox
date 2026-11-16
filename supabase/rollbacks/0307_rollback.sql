-- Reversa de 0307: quita la revisión del equipo (los ejemplos que creó quedan, como manuales).
drop index if exists confirmacion_ia_analisis_revision;
alter table confirmacion_ia_analisis drop column if exists rev_ejemplo_id;
alter table confirmacion_ia_analisis drop column if exists rev_en;
alter table confirmacion_ia_analisis drop column if exists rev_por_nombre;
alter table confirmacion_ia_analisis drop column if exists rev_por;
alter table confirmacion_ia_analisis drop column if exists rev_ok;
alter table confirmacion_ia_analisis drop column if exists rev_falta;
alter table confirmacion_ia_analisis drop column if exists rev_zona;
alter table confirmacion_ia_analisis drop column if exists rev_completa;
alter table confirmacion_ia_ejemplos drop column if exists origen;
notify pgrst, 'reload schema';
