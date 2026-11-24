-- Gestión de tienda › ClickSi (24 nov 2026, pedido de Hernán: «conectemos ClickSi; a ellos les vamos a poner solo lectura por ahora porque tienen su
-- propio equipo de atención al cliente»). La cuarta tienda, después de Kenku, Oferfy y Nuvo: queda «por conectar». Con la fila, Pedidos, Dashboard,
-- Logística y la ficha ya muestran sus órdenes de la Matriz (unidad «CLICKSI», 12.652 órdenes del 1 abr al 19 nov 2026, números «#CS…»; la tienda se
-- une a su unidad por el nombre). Su tablero de Monday «Devoluciones ClickSi» ya se lee. Lo nuevo entra al conectar su app de Shopify (solo lectura):
-- SHOPIFY_CLICKSI_CLIENT_ID, SHOPIFY_CLICKSI_CLIENT_SECRET y SHOPIFY_CLICKSI_DOMINIO en Vercel, y «Conectar» en Tiendas. La escritura en Shopify
-- (`escribe_shopify`, migración 0337) queda apagada.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0358_rollback.sql
insert into tiendas (nombre, pais_id, moneda, orden)
select 'ClickSi', p.id, 'USD', 4 from paises p where p.codigo = 'PA'
on conflict (pais_id, nombre) do nothing;

notify pgrst, 'reload schema';

-- Revisión: debe decir «sí».
select 'tienda ClickSi creada' as que,
  case when exists (select 1 from tiendas t join paises p on p.id = t.pais_id where p.codigo = 'PA' and t.nombre = 'ClickSi') then 'sí' else 'NO' end as quedo;
