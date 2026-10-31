-- Reversa de 0184_crm_comentarios.sql. Borra los comentarios del CRM: hacer copia antes. Los archivos del bucket `crm-dropshippers` no se
-- borran aquí (Supabase no deja borrar un bucket con archivos).
drop table if exists dropshipper_comentario_reacciones;
drop table if exists dropshipper_adjuntos;
drop table if exists dropshipper_comentarios;
