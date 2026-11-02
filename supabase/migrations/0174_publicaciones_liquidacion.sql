-- Gestión de IDs Dropi › «En liquidación» (pedido de Alcides, 28 oct 2026): un producto con margen bajo que se está liquidando a propósito se
-- marca así y sale del aviso de «Margen bajo» (tarjeta, punto rojo y recomendaciones de subir el precio o armar el combo). Va a su propia
-- tarjeta y filtro «En liquidación». Solo es del sistema: no cambia nada en Dropi. `liquidacion_en` dice desde cuándo; null = no está en liquidación.
-- Reversa: supabase/rollbacks/0174_rollback.sql

alter table dropi_publicaciones add column if not exists liquidacion_en timestamptz;
