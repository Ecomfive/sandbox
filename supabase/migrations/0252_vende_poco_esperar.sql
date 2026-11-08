-- Gestión de IDs Dropi › «Vende poco» › «Esperar un mes» (8 nov 2026, pedido de Alcides): después de analizar una publicación que vende poco, se
-- puede decidir esperar sin cambiar el precio. Hasta `vende_poco_espera_hasta` no sale en «Vende poco»; la nota dice por qué y quién lo decidió.
-- Solo es del sistema: no cambia nada en Dropi. null = sin espera.
-- Reversa: supabase/rollbacks/0252_rollback.sql

alter table dropi_publicaciones add column if not exists vende_poco_espera_hasta date;
alter table dropi_publicaciones add column if not exists vende_poco_espera_nota text;
alter table dropi_publicaciones add column if not exists vende_poco_espera_por text;
