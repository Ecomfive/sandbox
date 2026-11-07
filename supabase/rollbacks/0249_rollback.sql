-- Reversa de 0249_aviso_inactividad.sql: quita a quién se le muestra el aviso de inactividad (sin la columna, no le sale a nadie).
alter table perfiles drop column if exists aviso_inactividad;
