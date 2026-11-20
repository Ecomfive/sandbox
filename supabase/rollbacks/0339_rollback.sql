-- Reversa de 0339: devuelve la regla general de Postgres (EXECUTE a PUBLIC en las funciones nuevas del rol postgres).
-- No vuelve a abrir las funciones que ya existen: eso dejaría la clave pública ejecutándolas (para eso, 0319_rollback.sql).
alter default privileges for role postgres grant execute on functions to public;
