-- Confirmación con IA › poner la etiqueta de zona en Shopify, por tienda (21 nov 2026, pedido de Jhokser: la prueba del lunes empieza con una sola tienda y se va
-- activando poco a poco). Hasta ahora la IA solo proponía la etiqueta; con este interruptor, en la tienda encendida, la pone sola cuando el pedido queda «Listo» con zona.
--   * `tiendas.ia_pone_etiqueta`: el interruptor por tienda (apagado de entrada; solo un administrador lo enciende y solo con «Escribir en Shopify» encendido).
--   * `confirmacion_ia_analisis.etiqueta_puesta*`: qué etiqueta puso la IA en Shopify, cuándo y, si falló, por qué (para validar al final del día).
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0348_rollback.sql
alter table tiendas add column if not exists ia_pone_etiqueta boolean not null default false;
alter table tiendas add column if not exists ia_pone_etiqueta_por uuid references perfiles(id) on delete set null;
alter table tiendas add column if not exists ia_pone_etiqueta_en timestamptz;

alter table confirmacion_ia_analisis add column if not exists etiqueta_puesta text;
alter table confirmacion_ia_analisis add column if not exists etiqueta_puesta_en timestamptz;
alter table confirmacion_ia_analisis add column if not exists etiqueta_error text;

notify pgrst, 'reload schema';

-- Revisión: las tres filas deben decir «sí».
select 'interruptor por tienda' as que,
  case when exists (select 1 from information_schema.columns where table_name = 'tiendas' and column_name = 'ia_pone_etiqueta') then 'sí' else 'NO' end as quedo
union all
select 'etiqueta puesta en el análisis',
  case when exists (select 1 from information_schema.columns where table_name = 'confirmacion_ia_analisis' and column_name = 'etiqueta_puesta_en') then 'sí' else 'NO' end
union all
select 'error de la etiqueta en el análisis',
  case when exists (select 1 from information_schema.columns where table_name = 'confirmacion_ia_analisis' and column_name = 'etiqueta_error') then 'sí' else 'NO' end;
