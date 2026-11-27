-- Las guías de SISCORE entran solas en Shopify (24 nov 2026, pedido de Hernán): «la guía trae el número de pedido, no hay forma de que el sistema se
-- pierda; si hay alguna novedad, va al filtro y se encarga una asesora». Cada guía nueva (emitida desde el 24 nov 2026, en ruta y con su pedido) se
-- carga en el envío del pedido en Shopify, con su enlace de rastreo y el aviso al cliente. Aquí queda cómo le fue:
--   cargada   = entró en Shopify (sola o con «Cargar guía» de la asesora);
--   ya_tenia  = el pedido ya tenía una guía en Shopify: no se pisa ni se le vuelve a escribir al cliente;
--   pendiente = no entró (no preparado, pedido anulado, Shopify no la aceptó): sale en Pedidos de tienda › «Guía sin cargar» con el motivo, y se
--               vuelve a intentar en cada lectura de SISCORE;
--   resuelta  = era pendiente y la asesora la resolvió a mano («Ya está resuelto» en la ficha).

alter table tienda_guias add column if not exists shopify_estado text check (shopify_estado in ('cargada', 'ya_tenia', 'pendiente', 'resuelta'));
alter table tienda_guias add column if not exists shopify_motivo text;
alter table tienda_guias add column if not exists shopify_en timestamptz;
-- Cómo le llegó al cliente: correo (de Shopify), whatsapp, a_mano (no salió: la asesora se la manda) o a_mano_hecho (ya se la mandó).
alter table tienda_guias add column if not exists aviso_cliente text;

create index if not exists tienda_guias_shopify_pendiente on tienda_guias (tienda_id) where shopify_estado = 'pendiente';

comment on column tienda_guias.shopify_estado is 'Carga sola en Shopify: cargada, ya_tenia, pendiente o resuelta (sale en «Guía sin cargar»). Vacío = todavía no se intentó.';

-- Revisión: deben salir las 4 columnas.
select column_name from information_schema.columns where table_name = 'tienda_guias' and column_name in ('shopify_estado', 'shopify_motivo', 'shopify_en', 'aviso_cliente') order by 1;
