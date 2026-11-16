-- Confirmación con IA (16 nov 2026, pedido de Hernán): cada dirección de ejemplo guarda aparte la ciudad o el corregimiento que puso el cliente, porque es lo más importante para saber de
-- dónde es (con una palabra, Colón, ya se sabe que no es ciudad). Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0301_rollback.sql.
alter table confirmacion_ia_ejemplos add column if not exists ciudad text check (ciudad is null or char_length(ciudad) <= 120);

notify pgrst, 'reload schema';
