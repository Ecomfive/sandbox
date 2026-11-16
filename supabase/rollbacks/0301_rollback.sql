-- Reversa de 0301: quita la ciudad o corregimiento de las direcciones de ejemplo.
alter table confirmacion_ia_ejemplos drop column if exists ciudad;

notify pgrst, 'reload schema';
