-- Gestión de tienda › Oferfy (14 nov 2026, pedido de Hernán: «vamos a iniciar con Oferfy a crearlo en el sistema»). La segunda tienda, después de Kenku:
-- queda «por conectar». Con la fila, Pedidos, Dashboard, Logística y la ficha ya muestran sus órdenes del Excel de Finanzas (unidad «OFERFY PAN», hasta el
-- 13 oct 2026; la tienda se une a su unidad por el alias de la Matriz: OFERFY → OFERFY PAN). Lo nuevo entra al conectar su app de Shopify (solo
-- lectura): SHOPIFY_OFERFY_CLIENT_ID, SHOPIFY_OFERFY_CLIENT_SECRET y SHOPIFY_OFERFY_DOMINIO en Vercel, y «Conectar» en Tiendas.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0291_rollback.sql
insert into tiendas (nombre, pais_id, moneda, orden)
select 'Oferfy', p.id, 'USD', 2 from paises p where p.codigo = 'PA'
on conflict (pais_id, nombre) do nothing;

notify pgrst, 'reload schema';
