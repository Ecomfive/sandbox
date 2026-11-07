-- Aviso de 5 minutos sin actividad (7 nov 2026, pedido de Alcides): a quién se le muestra la ventana que bloquea el sistema hasta pulsar
-- «Entendido». Se elige en Configuración › «Aviso de inactividad». Arranca solo con Nicol Muñoz (Atención al cliente).
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0249_rollback.sql

alter table perfiles add column if not exists aviso_inactividad boolean not null default false;

update perfiles set aviso_inactividad = true where id = '3abaec4c-3689-4cc9-94c5-613003a8680d';
