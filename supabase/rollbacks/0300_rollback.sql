-- Reversa de 0300: quita la confirmación con IA (configuración, ejemplos, palabras de zona y análisis).
drop table if exists confirmacion_ia_analisis;
drop table if exists confirmacion_ia_zonas;
drop table if exists confirmacion_ia_ejemplos;
drop table if exists confirmacion_ia_config;

notify pgrst, 'reload schema';
