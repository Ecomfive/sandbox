-- Gestión de IDs Dropi › «Pausar por falta de stock» (pedido de Alcides, 27 oct 2026). Una publicación sin stock no se archiva (regla de
-- Hernán, 27 oct 2026), pero sí se pausa: en Dropi se archiva igual que con «Archivar» (para que la competencia no vea que se agotó) y en
-- el sistema sigue a la vista en la tarjeta «Pausadas sin stock» hasta reactivarla. `pausada_en` dice desde cuándo; al sacarla de
-- Archivados deja de contar como pausada (pausada = `pausada_en` + archivada) y archivarla con «Archivar» le quita la marca.
-- Reversa: supabase/rollbacks/0165_rollback.sql

alter table dropi_publicaciones add column if not exists pausada_en timestamptz;
