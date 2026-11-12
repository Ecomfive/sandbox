-- La hora en que se creó cada orden en Shopify (12 nov 2026, pedido de Hernán: «el último pedido me sale hoy a las 12 p. m. cuando cayó hace unos
-- minutos»). `ven_ordenes.fecha` guarda solo el día (el Excel de Finanzas no trae hora); las órdenes que llegan de Shopify traen `created_at` y ahora
-- se guarda aquí. Las del Excel quedan sin hora (null) y se muestran solo con el día. Las de Shopify que ya estaban se completan solas en la próxima
-- revisión de su tienda. Se puede correr más de una vez. Reversa: supabase/rollbacks/0275_rollback.sql
alter table ven_ordenes add column if not exists creado_origen timestamptz;

notify pgrst, 'reload schema';
