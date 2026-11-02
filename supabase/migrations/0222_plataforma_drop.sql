-- La plataforma «Drog» se llama **Drop** (Hernán, 3 nov 2026: «en ningún lado usamos Drog»). El nombre venía mal escrito desde la carga inicial de plataformas
-- (migración 0014). Es la misma fila (mismo id), así que Costa Rica la sigue teniendo en su lista y su fulfillment (Configuración) queda donde está; Gestión de
-- IDs Drop busca esa fila por el nombre «Drop». Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0222_rollback.sql

update plataformas set nombre = 'Drop'
where nombre = 'Drog' and not exists (select 1 from plataformas where nombre = 'Drop');
