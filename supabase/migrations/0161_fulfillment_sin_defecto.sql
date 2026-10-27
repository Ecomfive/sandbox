-- Gestión de IDs Dropi: el fulfillment fijo de $1.50 es solo de Panamá (Hernán, 27 oct 2026); en otro país se escribe en la ficha
-- como antes. Por eso la columna deja de tener 1.5 por defecto (lo puso la 0160): el servidor pone el de Panamá al crear y guardar
-- (`fulfillmentFijo`, src/lib/publicaciones/publicacion.ts). No cambia ningún dato.
-- Reversa: supabase/rollbacks/0161_rollback.sql

alter table dropi_publicaciones alter column fulfillment drop default;
