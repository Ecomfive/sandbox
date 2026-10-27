-- Reversa de 0166_segundo_paso.sql: quita los códigos por correo de la verificación en dos pasos.
drop function if exists segundo_paso_sumar_intento(uuid);
drop table if exists segundo_paso_codigos;
